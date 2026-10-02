import { Op, type IncludeOptions, type Transaction } from 'sequelize';
import { AppError } from '../utils/AppError';
import { sequelize } from '../config/database';
import { BranchStock, Product, StockBatch, StockMovement, withRowLock } from '../models';
import { requireActiveBranch } from './branchService';
import { ROLES, type Role } from '../constants/roles';

/**
 * Stock service: per-branch quantities, movements, and adjustments.
 *
 * THE ONLY WAY STOCK CHANGES IN PHASE 4 is `applyAdjustment` / `setTotal` /
 * `initialiseStock`, and every one of them runs inside a single transaction that
 * takes a PostgreSQL row-level lock before reading the current quantity.
 *
 * Why a lock is mandatory: two concurrent sales of the last unit must not both
 * observe available = 1. Without SELECT ... FOR UPDATE, both read 1, both write
 * 0, and the second unit vanishes. With the lock, the second transaction blocks
 * until the first commits and then re-reads the already-updated row.
 *
 * QUANTITIES ARE INTEGERS (branch_stock.available, stock_movements.quantity and
 * products.min_stock are INTEGER in the frontend schema.ts), so all arithmetic
 * here is plain integer addition - exact, and no float can creep in.
 *
 * NEGATIVE STOCK IS PROHIBITED. The frontend clamps with MAX(available + ?, 0)
 * (see its stockRepository/purchaseRepository/invoiceRepository), and the
 * database has CHECK (available >= 0) as the final backstop. The explicit check
 * below exists so the client gets a useful 409 INSUFFICIENT_STOCK message
 * instead of a constraint violation.
 *
 * The `status` column is maintained here using the frontend's exact rule
 * (stockRepository.ts / constants/stock.js):
 *     available <= 0                      -> OUT_OF_STOCK
 *     available <= minStock               -> LOW_STOCK
 *     otherwise                           -> IN_STOCK
 */

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type MovementType =
  | 'SALE'
  | 'PURCHASE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN';

export interface StockRow {
  branchId: string;
  productId: string;
  /** Frontend BranchStockRow contract (databaseTypes.ts). */
  available: number;
  /** Mirror of `available`, so callers using either spelling work. */
  quantity: number;
  minStock: number;
  status: StockStatus;
  updatedAt: Date;
  product?: {
    id: string;
    name: string;
    code: string;
    sku: string;
    unit: string;
    barcode: string | null;
    brand: string | null;
    categoryId: string | null;
    mrp: number;
    sellingPrice: number;
    purchasePrice: number;
    discountPercent: number;
    status: string;
  } | null;
}

export interface MovementRow {
  id: string;
  branchId: string;
  productId: string;
  batchId: string | null;
  /** Signed: negative = stock out, positive = stock in. */
  quantity: number;
  type: MovementType;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Frontend low-stock rule, in priority order. */
export function computeStockStatus(available: number, minStock: number): StockStatus {
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= minStock) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/**
 * Ensures a branch_stock row exists, then takes `FOR UPDATE` on it.
 *
 * The INSERT ... ON CONFLICT DO NOTHING is what makes concurrent first-time
 * adjustments safe: Postgres serialises the two speculative inserts on the
 * composite primary key, so the loser's insert becomes a no-op and its
 * subsequent SELECT FOR UPDATE waits for the winner's committed row rather than
 * failing or creating a duplicate.
 */
async function lockStockRow(branchId: string, productId: string, transaction: Transaction): Promise<BranchStock> {
  await sequelize.query(
    `INSERT INTO branch_stock (branch_id, product_id, available, min_stock, status, created_at, updated_at)
     VALUES (:branchId, :productId, 0, 0, 'OUT_OF_STOCK', NOW(), NOW())
     ON CONFLICT (branch_id, product_id) DO NOTHING`,
    { replacements: { branchId, productId }, transaction },
  );

  const row = await BranchStock.findOne(withRowLock({ branchId, productId }, transaction));
  if (!row) {
    // Unreachable unless the row was deleted between the INSERT and the SELECT,
    // which ON DELETE RESTRICT prevents.
    throw AppError.internal('Could not lock the stock row for this product.');
  }
  return row;
}

/** Product summary embedded in stock/movement rows so screens need no N+1 call. */
function serializeProductSummary(product: Product): NonNullable<StockRow['product']> {
  const p = product.toJSON() as Record<string, unknown>;
  // `text(value)` on an absent attribute yields the literal string "undefined",
  // which is worse than null: it silently corrupts a display field instead of
  // failing loudly. Text attributes are required on Product, so any absence
  // means the row was not loaded with PRODUCT_SUMMARY_ATTRIBUTES.
  const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
  const amount = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: String(p.id),
    name: text(p.name) as string,
    code: text(p.code) as string,
    sku: text(p.code) as string,
    unit: text(p.unit) as string,
    barcode: text(p.barcode),
    brand: text(p.brand),
    categoryId: text(p.categoryId),
    mrp: amount(p.mrp) as number,
    sellingPrice: amount(p.sellingPrice) as number,
    purchasePrice: amount(p.purchasePrice) as number,
    discountPercent: amount(p.discountPercent) as number,
    status: text(p.status) as string,
  };
}

function serializeStock(row: BranchStock, product?: Product | null): StockRow {
  const json = row.toJSON() as Omit<StockRow, 'quantity' | 'product'>;
  const result: StockRow = { ...json, quantity: json.available };
  if (product) result.product = serializeProductSummary(product);
  return result;
}

/** Reads the `product` association Sequelize attached to an eager-loaded row. */
function attachedProduct(row: unknown): Product | null {
  const product = (row as { product?: Product | null }).product;
  return product ?? null;
}

export interface AdjustmentInput {
  branchId: string;
  productId: string;
  /** Signed whole number. */
  delta: number;
  reason: string;
  minStock?: number;
  referenceType?: string;
  referenceId?: string;
  batchId?: string;
  note?: string;
  /** Movement type recorded in stock_movements. Defaults to 'ADJUSTMENT'. */
  movementType?: MovementType;
}

/** Adjustment body as it arrives from a validated request. */
export type BranchAdjustmentBody = Omit<AdjustmentInput, 'branchId'> & { branchId?: string };

/**
 * Ensures a branch_stock row exists, then takes FOR UPDATE on it.
 * Exported for use by billing and other transactional services that manage
 * their own outer transaction.
 */
export { lockStockRow };

/**
 * Applies a signed adjustment and records exactly one movement row.
 * Caller supplies the transaction; the whole thing commits or rolls back as one.
 * Exported for use by billing and other services that run their own transaction.
 */
export async function writeAdjustment(
  input: AdjustmentInput,
  transaction: Transaction,
): Promise<{ stock: BranchStock; movement: StockMovement }> {
  const row = await lockStockRow(input.branchId, input.productId, transaction);

  if (input.minStock !== undefined) {
    if (!Number.isInteger(input.minStock) || input.minStock < 0) {
      throw AppError.badRequest('minStock must be a non-negative whole number.');
    }
    row.minStock = input.minStock;
  }

  const current = row.available;
  const next = current + input.delta;

  if (next < 0) {
    // Rolled back by the caller's transaction - nothing is written.
    throw AppError.insufficientStock(
      `Cannot remove ${Math.abs(input.delta)} unit(s): only ${current} in stock. Stock cannot go negative.`,
      { productId: input.productId, branchId: input.branchId, available: current, requested: Math.abs(input.delta) },
    );
  }

  row.available = next;
  row.status = computeStockStatus(next, row.minStock);
  await row.save({ transaction });

  const movement = await StockMovement.create(
    {
      branchId: input.branchId,
      productId: input.productId,
      batchId: null,
      quantity: input.delta,
      type: input.movementType ?? 'ADJUSTMENT',
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      note: [input.reason, input.note].filter(Boolean).join(' - ') || null,
    },
    { transaction },
  );

  return { stock: row, movement };
}

/**
 * POST /branches/:branchId/stock-adjust  { productId, delta, reason }
 * The endpoint the frontend's `adjustInventory` already calls.
 */
export async function adjustStock(input: AdjustmentInput): Promise<{ stock: StockRow; movement: MovementRow }> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw AppError.badRequest('delta must be a non-zero whole number.');
  }
  if (input.batchId) {
    // Deliberately refused rather than silently ignored: recording a movement
    // against a batch without changing that batch's quantity would leave the
    // batch ledger inconsistent. Batch-level quantities stay read-only in
    // Phase 4, matching the frontend (adjustBatchQuantity throws in real mode).
    throw AppError.invalidState(
      'Batch-level stock adjustment is not available yet. Adjust the product-level quantity instead.',
    );
  }

  await requireActiveBranch(input.branchId);

  const product = await Product.findByPk(input.productId, { attributes: [...PRODUCT_SUMMARY_ATTRIBUTES] });
  if (!product) throw AppError.notFound('Product not found.');

  const result = await sequelize.transaction(async (transaction) => {
    const { stock, movement } = await writeAdjustment(input, transaction);
    return { stock, movement, product };
  });

  return {
    stock: serializeStock(result.stock, result.product),
    movement: result.movement.toJSON() as unknown as MovementRow,
  };
}

/** Sets an absolute quantity; the movement records the difference applied. */
export async function setTotal(
  input: { branchId: string; productId: string; newTotal: number; reason: string; minStock?: number },
): Promise<{ stock: StockRow; movement: MovementRow }> {
  if (!Number.isInteger(input.newTotal) || input.newTotal < 0) {
    throw AppError.badRequest('newTotal must be a non-negative whole number.');
  }
  await requireActiveBranch(input.branchId);

  const product = await Product.findByPk(input.productId, { attributes: [...PRODUCT_SUMMARY_ATTRIBUTES] });
  if (!product) throw AppError.notFound('Product not found.');

  const result = await sequelize.transaction(async (transaction) => {
    const existing = await lockStockRow(input.branchId, input.productId, transaction);
    const delta = input.newTotal - existing.available;
    if (delta === 0) {
      throw AppError.badRequest('The product already holds that quantity.');
    }
    const { stock, movement } = await writeAdjustment(
      { ...input, delta, reason: input.reason },
      transaction,
    );
    return { stock, movement, product };
  });

  return {
    stock: serializeStock(result.stock, result.product),
    movement: result.movement.toJSON() as unknown as MovementRow,
  };
}

/** Creates the initial branch_stock row and records the opening movement. */
export async function initialiseStock(
  input: { branchId: string; productId: string; available?: number; minStock?: number; reason?: string },
): Promise<{ stock: StockRow; movement: MovementRow | null }> {
  const available = input.available ?? 0;
  const minStock = input.minStock ?? 0;
  if (!Number.isInteger(available) || available < 0) {
    throw AppError.badRequest('available must be a non-negative whole number.');
  }
  await requireActiveBranch(input.branchId);

  const product = await Product.findByPk(input.productId, { attributes: [...PRODUCT_SUMMARY_ATTRIBUTES] });
  if (!product) throw AppError.notFound('Product not found.');

  const result = await sequelize.transaction(async (transaction) => {
    const row = await lockStockRow(input.branchId, input.productId, transaction);
    if (row.available !== 0 || row.minStock !== 0) {
      throw AppError.conflict('This product already has a stock record for the branch.');
    }
    row.available = available;
    row.minStock = minStock;
    row.status = computeStockStatus(available, minStock);
    await row.save({ transaction });

    let movement: StockMovement | null = null;
    if (available !== 0) {
      movement = await StockMovement.create(
        {
          branchId: input.branchId,
          productId: input.productId,
          batchId: null,
          quantity: available,
          type: 'ADJUSTMENT',
          referenceType: 'OPENING_STOCK',
          note: input.reason ?? 'Initial stock',
        },
        { transaction },
      );
    }
    return { stock: row, movement, product };
  });

  return {
    stock: serializeStock(result.stock, result.product),
    movement: result.movement ? (result.movement.toJSON() as unknown as MovementRow) : null,
  };
}

/** Columns embedded in every stock/movement row so screens need no N+1 call. */
const PRODUCT_SUMMARY_ATTRIBUTES = [
  'id', 'name', 'code', 'unit', 'barcode', 'brand', 'categoryId',
  'mrp', 'sellingPrice', 'purchasePrice', 'discountPercent', 'status',
] as const;

const STOCK_INCLUDE_PRODUCT: IncludeOptions[] = [
  { model: Product, as: 'product', attributes: [...PRODUCT_SUMMARY_ATTRIBUTES] },
];

/** Stock for one branch. */
export async function listBranchStock(
  branchId: string,
  options: { productId?: string; includeMissing?: boolean; limit?: number; offset?: number } = {},
): Promise<StockRow[]> {
  const where: Record<string, unknown> = { branchId };
  if (options.productId) where.productId = options.productId;

  const rows = await BranchStock.findAll({
    where,
    include: STOCK_INCLUDE_PRODUCT,
    order: [['productId', 'ASC']],
    limit: options.limit,
    offset: options.offset,
  });

  if (options.includeMissing && !options.productId) {
    // Products with no branch_stock row yet are reported as zero rather than
    // being silently omitted, so a stock screen shows them as OUT_OF_STOCK.
    const stockedProductIds = rows.map((r) => r.productId);
    const missing = await Product.findAll({
      where: { status: 'Active', ...(stockedProductIds.length ? { id: { [Op.notIn]: stockedProductIds } } : {}) },
      order: [['name', 'ASC']],
      limit: options.limit,
      offset: options.offset,
    });
    const zeroRows: StockRow[] = missing.map((product) => ({
      branchId,
      productId: product.id,
      available: 0,
      quantity: 0,
      minStock: 0,
      status: 'OUT_OF_STOCK' as StockStatus,
      updatedAt: product.updatedAt,
      product: serializeProductSummary(product),
    }));
    return [...rows.map((r) => serializeStock(r, attachedProduct(r))), ...zeroRows];
  }

  return rows.map((r) => serializeStock(r, attachedProduct(r)));
}

/**
 * GET /stock. SUPER_ADMIN may pass branchId to view one branch or omit it for
 * every branch; everyone else is pinned to their own branch by the route layer.
 */
export async function listAllStock(
  actor: { role: Role; branchId: string | null },
  requestedBranchId?: string,
  options: { productId?: string; limit?: number; offset?: number } = {},
): Promise<StockRow[]> {
  if (actor.role !== ROLES.SUPER_ADMIN) {
    return listBranchStock(actor.branchId as string, options);
  }
  if (requestedBranchId) return listBranchStock(requestedBranchId, options);

  const where: Record<string, unknown> = {};
  if (options.productId) where.productId = options.productId;

  const rows = await BranchStock.findAll({
    where,
    include: STOCK_INCLUDE_PRODUCT,
    order: [
      ['branchId', 'ASC'],
      ['productId', 'ASC'],
    ],
    limit: options.limit,
    offset: options.offset,
  });
  return rows.map((r) => serializeStock(r, attachedProduct(r)));
}

/**
 * Low-stock report. Uses the stored `status` column, which is kept in sync by
 * every write path, so this needs no recomputation.
 */
export async function listLowStock(
  actor: { role: Role; branchId: string | null },
  requestedBranchId?: string,
  includeOutOfStock = true,
): Promise<StockRow[]> {
  const where: Record<string, unknown> = {
    status: includeOutOfStock ? { [Op.in]: ['LOW_STOCK', 'OUT_OF_STOCK'] } : 'LOW_STOCK',
  };

  const scoped = actor.role === ROLES.SUPER_ADMIN ? requestedBranchId : actor.branchId;
  if (scoped) where.branchId = scoped;
  else if (actor.role !== ROLES.SUPER_ADMIN) {
    throw AppError.forbidden('Your account is not assigned to a branch.');
  }

  const rows = await BranchStock.findAll({
    where,
    include: STOCK_INCLUDE_PRODUCT,
    order: [
      ['status', 'ASC'],
      ['available', 'ASC'],
    ],
  });
  return rows.map((r) => serializeStock(r, attachedProduct(r)));
}

export async function listMovements(
  actor: { role: Role; branchId: string | null },
  requestedBranchId: string | undefined,
  filters: { productId?: string; type?: MovementType; limit?: number; offset?: number } = {},
): Promise<MovementRow[]> {
  const where: Record<string, unknown> = {};
  const scoped = actor.role === ROLES.SUPER_ADMIN ? requestedBranchId : actor.branchId;
  if (scoped) where.branchId = scoped;
  if (filters.productId) where.productId = filters.productId;
  if (filters.type) where.type = filters.type;

  const rows = await StockMovement.findAll({
    where,
    include: STOCK_INCLUDE_PRODUCT,
    order: [['createdAt', 'DESC']],
    limit: filters.limit,
    offset: filters.offset,
  });
  return rows.map((r) => {
    const json = r.toJSON() as unknown as MovementRow;
    return json;
  });
}

/**
 * Read-only batch listing (GET /batches).
 *
 * Scope discipline: the frontend's batchInventoryApi only ever READS batches
 * from a real endpoint - adjustBatchQuantity throws in real mode and
 * consumeBatchesForInvoice is a no-op. Phase 4 therefore exposes reads only and
 * does not redesign batch inventory.
 */
export async function listBatches(
  actor: { role: Role; branchId: string | null },
  requestedBranchId: string | undefined,
  filters: { productId?: string; status?: string; expiringWithinDays?: number; limit?: number } = {},
): Promise<StockBatch[]> {
  const where: Record<string, unknown> = {};
  const scoped = actor.role === ROLES.SUPER_ADMIN ? requestedBranchId : actor.branchId;
  if (scoped) where.branchId = scoped;
  if (filters.productId) where.productId = filters.productId;
  if (filters.status) where.status = filters.status;
  if (filters.expiringWithinDays !== undefined) {
    const cutoff = new Date(Date.now() + filters.expiringWithinDays * 86_400_000);
    where.expiryDate = { [Op.ne]: null, [Op.lte]: cutoff };
  }

  return StockBatch.findAll({
    where,
    include: STOCK_INCLUDE_PRODUCT,
    order: [['expiryDate', 'ASC'], ['createdAt', 'DESC']],
    limit: filters.limit,
  });
}

export default {
  computeStockStatus,
  adjustStock,
  setTotal,
  initialiseStock,
  listBranchStock,
  listAllStock,
  listLowStock,
  listMovements,
  listBatches,
};