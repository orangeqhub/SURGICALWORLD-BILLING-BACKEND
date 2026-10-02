import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { Branch, BranchStock, Product, StockTransfer, StockTransferItem, User } from '../models';
import { AppError } from '../utils/AppError';
import { writeAdjustment } from './stockService';
import { requireActiveBranch } from './branchService';
import { ROLES } from '../constants/roles';
import {
  TRANSFER_STATUSES,
  TRANSFER_TRANSITIONS,
  canTransitionTransfer,
  type TransferStatus,
} from '../constants/enums';

type AuthUser = Express.AuthenticatedUser;

// ─── helpers ──────────────────────────────────────────────────────────────────

function isSuperAdmin(user: AuthUser): boolean {
  return user.role === ROLES.SUPER_ADMIN;
}

/**
 * Locks the transfer row FOR UPDATE inside the caller's transaction, then
 * verifies the status is one of the allowed values. Throws INVALID_STATE if
 * the current status is not in `allowed`.
 */
async function lockAndAssertStatus(
  id: string,
  allowed: TransferStatus[],
  t: Transaction,
): Promise<StockTransfer> {
  const transfer = await StockTransfer.findOne({
    where: { id },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!transfer) throw AppError.notFound('Stock transfer not found.');
  if (!allowed.includes(transfer.status as TransferStatus)) {
    throw AppError.invalidState(
      `This action requires status ${allowed.join(' or ')}; current status is ${transfer.status}.`,
      { current: transfer.status, allowed },
    );
  }
  return transfer;
}

// ─── input types ──────────────────────────────────────────────────────────────

export interface CreateTransferItemInput {
  productId: string;
  transferQty: number;
  batchId?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  remarks?: string | null;
}

export interface CreateTransferInput {
  localId?: string | null;
  fromBranchId: string;
  toBranchId: string;
  transferDate: string;
  remarks?: string | null;
  items: CreateTransferItemInput[];
}

export interface ReceiveItemInput {
  transferItemId: string;
  receivedQty: number;
}

// ─── create ───────────────────────────────────────────────────────────────────

/**
 * Creates a DRAFT transfer.
 *
 * Branch isolation: a non-super-admin must have fromBranchId === their branch.
 * Stock is NOT deducted here — that happens at dispatch.
 */
export async function createTransfer(input: CreateTransferInput, user: AuthUser): Promise<StockTransfer> {
  // Idempotency: return the existing transfer if the same localId arrives again.
  if (input.localId) {
    const existing = await StockTransfer.findOne({ where: { localId: input.localId } });
    if (existing) return existing;
  }

  // Branch isolation.
  if (!isSuperAdmin(user) && user.branchId !== input.fromBranchId) {
    throw AppError.branchForbidden('You can only create transfers from your own branch.');
  }

  // Distinct branches.
  if (input.fromBranchId === input.toBranchId) {
    throw AppError.badRequest('Source and destination branches must be different.');
  }

  try {
    return await sequelize.transaction(async (t: Transaction) => {
      // Validate both branches exist and are active.
      await requireActiveBranch(input.fromBranchId);
      await requireActiveBranch(input.toBranchId);

      // Validate every product exists and is active.
      for (const item of input.items) {
        const product = await Product.findByPk(item.productId, { transaction: t });
        if (!product || product.status !== 'Active') {
          throw AppError.notFound(`Product "${item.productId}" not found or inactive.`);
        }
        if (!Number.isInteger(item.transferQty) || item.transferQty <= 0) {
          throw AppError.badRequest(`transferQty must be a positive integer for product "${item.productId}".`);
        }
      }

      // Server-side transfer number: TR/{YYYYMMDD}/{seq}.
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const seqCount = await StockTransfer.count({ where: { fromBranchId: input.fromBranchId }, transaction: t });
      const transferNumber = `TR/${today}/${String(seqCount + 1).padStart(4, '0')}`;

      const transfer = await StockTransfer.create(
        {
          localId: input.localId ?? null,
          transferNumber,
          // branchId = the source branch (owning branch for the record).
          branchId: input.fromBranchId,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          status: TRANSFER_STATUSES.DRAFT,
          transferDate: input.transferDate,
          requestedBy: user.id,
          remarks: input.remarks ?? null,
        },
        { transaction: t },
      );

      await StockTransferItem.bulkCreate(
        input.items.map((item) => ({
          transferId: transfer.id,
          productId: item.productId,
          batchId: item.batchId ?? null,
          batchNumber: item.batchNumber ?? null,
          expiryDate: item.expiryDate ?? null,
          transferQty: item.transferQty,
          receivedQty: 0,
          damagedQty: 0,
          remarks: item.remarks ?? null,
        })),
        { transaction: t },
      );

      return transfer;
    });
  } catch (err: unknown) {
    // Concurrent duplicate localId.
    const pgCode = (err as { parent?: { code?: string } })?.parent?.code;
    if (pgCode === '23505' && input.localId) {
      const idempotent = await StockTransfer.findOne({ where: { localId: input.localId } });
      if (idempotent) return idempotent;
    }
    throw err;
  }
}

// ─── submit ───────────────────────────────────────────────────────────────────

/** DRAFT → PENDING_APPROVAL */
export async function submitTransfer(id: string, user: AuthUser): Promise<StockTransfer> {
  return sequelize.transaction(async (t: Transaction) => {
    const transfer = await lockAndAssertStatus(id, [TRANSFER_STATUSES.DRAFT], t);

    // Branch isolation: only the source-branch user (or super admin) may submit.
    if (!isSuperAdmin(user) && user.branchId !== transfer.fromBranchId) {
      throw AppError.branchForbidden('You do not have access to this transfer.');
    }

    transfer.status = TRANSFER_STATUSES.PENDING_APPROVAL;
    await transfer.save({ transaction: t });
    return transfer;
  });
}

// ─── approve ──────────────────────────────────────────────────────────────────

/** PENDING_APPROVAL → APPROVED.  SUPER_ADMIN only. */
export async function approveTransfer(id: string, user: AuthUser): Promise<StockTransfer> {
  if (!isSuperAdmin(user)) {
    throw AppError.forbidden('Only Super Admin can approve stock transfers.');
  }
  return sequelize.transaction(async (t: Transaction) => {
    const transfer = await lockAndAssertStatus(id, [TRANSFER_STATUSES.PENDING_APPROVAL], t);
    transfer.status = TRANSFER_STATUSES.APPROVED;
    transfer.approvedBy = user.id;
    transfer.approvedAt = new Date();
    await transfer.save({ transaction: t });
    return transfer;
  });
}

// ─── reject ───────────────────────────────────────────────────────────────────

/** PENDING_APPROVAL → REJECTED.  SUPER_ADMIN only. */
export async function rejectTransfer(id: string, rejectionReason: string, user: AuthUser): Promise<StockTransfer> {
  if (!isSuperAdmin(user)) {
    throw AppError.forbidden('Only Super Admin can reject stock transfers.');
  }
  return sequelize.transaction(async (t: Transaction) => {
    const transfer = await lockAndAssertStatus(id, [TRANSFER_STATUSES.PENDING_APPROVAL], t);
    transfer.status = TRANSFER_STATUSES.REJECTED;
    transfer.rejectedBy = user.id;
    transfer.rejectedAt = new Date();
    transfer.rejectionReason = rejectionReason || null;
    await transfer.save({ transaction: t });
    return transfer;
  });
}

// ─── dispatch ─────────────────────────────────────────────────────────────────

/**
 * APPROVED → DISPATCHED.
 *
 * This is where source stock is permanently deducted. The transfer must be
 * in APPROVED status. Every item's stock row is locked with SELECT FOR UPDATE
 * before the quantity check so two concurrent dispatches cannot both observe
 * sufficient stock and drive it negative.
 *
 * Stock deduction rule: source branch, TRANSFER_OUT movement.
 */
export async function dispatchTransfer(id: string, user: AuthUser): Promise<StockTransfer> {
  return sequelize.transaction(async (t: Transaction) => {
    const transfer = await lockAndAssertStatus(id, [TRANSFER_STATUSES.APPROVED], t);

    // Branch isolation: source-branch users or super admin may dispatch.
    if (!isSuperAdmin(user) && user.branchId !== transfer.fromBranchId) {
      throw AppError.branchForbidden('Only the source branch can dispatch this transfer.');
    }

    const items = await StockTransferItem.findAll({ where: { transferId: id }, transaction: t });
    if (items.length === 0) throw AppError.badRequest('Transfer has no items.');

    // Deduct source stock for every line atomically.
    for (const item of items) {
      if (!item.productId) continue;
      await writeAdjustment(
        {
          branchId: transfer.fromBranchId,
          productId: item.productId,
          delta: -item.transferQty,
          movementType: 'TRANSFER_OUT',
          reason: 'Transfer dispatch',
          referenceType: 'STOCK_TRANSFER',
          referenceId: transfer.id,
        },
        t,
      );
    }

    transfer.status = TRANSFER_STATUSES.DISPATCHED;
    transfer.dispatchedBy = user.id;
    transfer.dispatchedAt = new Date();
    transfer.dispatchDate = new Date().toISOString().slice(0, 10);
    await transfer.save({ transaction: t });
    return transfer;
  });
}

// ─── receive ──────────────────────────────────────────────────────────────────

/**
 * DISPATCHED | PARTIALLY_RECEIVED → PARTIALLY_RECEIVED | RECEIVED.
 *
 * Each call credits the destination branch with the quantities received in this
 * shipment. Callers supply per-item received quantities; only the items
 * included in the call are updated (partial receive support).
 *
 * Receiving the same item twice in separate calls is safe because we validate
 * `receivedQty <= (transferQty − existing receivedQty)` inside the transaction.
 */
export async function receiveTransfer(
  id: string,
  receiveItems: ReceiveItemInput[],
  user: AuthUser,
): Promise<StockTransfer> {
  return sequelize.transaction(async (t: Transaction) => {
    const transfer = await lockAndAssertStatus(
      id,
      [TRANSFER_STATUSES.DISPATCHED, TRANSFER_STATUSES.PARTIALLY_RECEIVED],
      t,
    );

    // Branch isolation: destination-branch users or super admin may receive.
    if (!isSuperAdmin(user) && user.branchId !== transfer.toBranchId) {
      throw AppError.branchForbidden('Only the destination branch can receive this transfer.');
    }

    const allItems = await StockTransferItem.findAll({ where: { transferId: id }, transaction: t });

    for (const ri of receiveItems) {
      const item = allItems.find((i) => i.id === ri.transferItemId);
      if (!item) throw AppError.notFound(`Transfer item "${ri.transferItemId}" not found.`);

      const remaining = item.transferQty - item.receivedQty;
      if (ri.receivedQty <= 0 || !Number.isInteger(ri.receivedQty)) {
        throw AppError.badRequest('receivedQty must be a positive integer.');
      }
      if (ri.receivedQty > remaining) {
        throw AppError.badRequest(
          `Cannot receive ${ri.receivedQty} units; only ${remaining} remain for item ${item.id}.`,
        );
      }

      // Credit destination stock.
      if (item.productId) {
        await writeAdjustment(
          {
            branchId: transfer.toBranchId,
            productId: item.productId,
            delta: ri.receivedQty,
            movementType: 'TRANSFER_IN',
            reason: 'Transfer receive',
            referenceType: 'STOCK_TRANSFER',
            referenceId: transfer.id,
          },
          t,
        );
      }

      item.receivedQty += ri.receivedQty;
      await item.save({ transaction: t });
    }

    // Re-read updated items to decide new transfer status.
    const updatedItems = await StockTransferItem.findAll({ where: { transferId: id }, transaction: t });
    const totalRequested = updatedItems.reduce((s, i) => s + i.transferQty, 0);
    const totalReceived = updatedItems.reduce((s, i) => s + i.receivedQty, 0);

    if (totalReceived >= totalRequested) {
      transfer.status = TRANSFER_STATUSES.RECEIVED;
      transfer.receivedDate = new Date().toISOString().slice(0, 10);
      transfer.receivedBy = user.id;
      transfer.receivedAt = new Date();
    } else {
      transfer.status = TRANSFER_STATUSES.PARTIALLY_RECEIVED;
      if (!transfer.receivedBy) {
        transfer.receivedBy = user.id;
        transfer.receivedAt = new Date();
      }
    }

    await transfer.save({ transaction: t });
    return transfer;
  });
}

// ─── cancel ───────────────────────────────────────────────────────────────────

/** Cancels a transfer that has not yet been dispatched. */
export async function cancelTransfer(id: string, user: AuthUser): Promise<StockTransfer> {
  return sequelize.transaction(async (t: Transaction) => {
    const transfer = await lockAndAssertStatus(
      id,
      [TRANSFER_STATUSES.DRAFT, TRANSFER_STATUSES.PENDING_APPROVAL, TRANSFER_STATUSES.APPROVED],
      t,
    );

    if (!isSuperAdmin(user) && user.branchId !== transfer.fromBranchId) {
      throw AppError.branchForbidden('You do not have access to this transfer.');
    }

    transfer.status = TRANSFER_STATUSES.CANCELLED;
    await transfer.save({ transaction: t });
    return transfer;
  });
}

// ─── list ─────────────────────────────────────────────────────────────────────

export interface ListTransferFilters {
  branchId?: string;
  status?: string;
  fromBranchId?: string;
  toBranchId?: string;
  limit?: number;
  offset?: number;
}

export async function listTransfers(
  filters: ListTransferFilters,
  user: AuthUser,
): Promise<{ rows: StockTransfer[]; total: number }> {
  const where: Record<string, unknown> = {};

  // Branch isolation: non-super-admin sees only their branch's transfers.
  if (!isSuperAdmin(user)) {
    const userBranch = user.branchId;
    where[Op.or as unknown as string] = [{ fromBranchId: userBranch }, { toBranchId: userBranch }];
  } else {
    if (filters.fromBranchId) where.fromBranchId = filters.fromBranchId;
    if (filters.toBranchId) where.toBranchId = filters.toBranchId;
    if (filters.branchId) {
      where[Op.or as unknown as string] = [{ fromBranchId: filters.branchId }, { toBranchId: filters.branchId }];
    }
  }

  if (filters.status) where.status = filters.status;

  const limit = Math.min(filters.limit ?? 50, 500);
  const offset = filters.offset ?? 0;

  const { rows, count } = await StockTransfer.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    include: [
      { model: StockTransferItem, as: 'items' },
      { model: Branch, as: 'fromBranch', attributes: ['id', 'name', 'code'] },
      { model: Branch, as: 'toBranch', attributes: ['id', 'name', 'code'] },
    ],
  });

  return { rows, total: count };
}

// ─── get one ──────────────────────────────────────────────────────────────────

export async function getTransfer(id: string, user: AuthUser): Promise<StockTransfer> {
  const transfer = await StockTransfer.findByPk(id, {
    include: [
      { model: StockTransferItem, as: 'items' },
      { model: Branch, as: 'fromBranch', attributes: ['id', 'name', 'code'] },
      { model: Branch, as: 'toBranch', attributes: ['id', 'name', 'code'] },
      { model: User, as: 'requestedByUser', attributes: ['id', 'name', 'loginId'] },
      { model: User, as: 'approvedByUser', attributes: ['id', 'name', 'loginId'] },
      { model: User, as: 'rejectedByUser', attributes: ['id', 'name', 'loginId'] },
      { model: User, as: 'dispatchedByUser', attributes: ['id', 'name', 'loginId'] },
      { model: User, as: 'receivedByUser', attributes: ['id', 'name', 'loginId'] },
    ],
  });

  if (!transfer) throw AppError.notFound('Stock transfer not found.');

  if (!isSuperAdmin(user) && user.branchId !== transfer.fromBranchId && user.branchId !== transfer.toBranchId) {
    throw AppError.branchForbidden('You do not have access to this transfer.');
  }

  return transfer;
}
