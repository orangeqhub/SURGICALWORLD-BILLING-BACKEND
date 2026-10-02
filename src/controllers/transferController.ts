import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { currentUser } from '../middleware/authenticate';
import {
  createTransfer,
  submitTransfer,
  approveTransfer,
  rejectTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
  listTransfers,
  getTransfer,
} from '../services/transferService';
import type {
  CreateTransferBody,
} from '../validators/transferValidators';

// ─── serializers ──────────────────────────────────────────────────────────────

function serializeUserRef(u: Record<string, unknown> | null | undefined) {
  if (!u) return null;
  return { id: u.id, name: u.name, loginId: u.loginId };
}

function serializeBranchRef(b: Record<string, unknown> | null | undefined) {
  if (!b) return null;
  return { id: b.id, name: b.name, code: b.code };
}

function serializeItem(item: Record<string, unknown>) {
  return {
    id: item.id,
    productId: item.productId,
    batchId: item.batchId,
    batchNumber: item.batchNumber,
    expiryDate: item.expiryDate,
    transferQty: item.transferQty,
    receivedQty: item.receivedQty,
    damagedQty: item.damagedQty,
    remarks: item.remarks,
  };
}

function serializeTransfer(transfer: import('../models/StockTransfer').StockTransfer, includeDetail = false) {
  const j = transfer.toJSON() as Record<string, unknown> & {
    items?: Record<string, unknown>[];
    fromBranch?: Record<string, unknown>;
    toBranch?: Record<string, unknown>;
    requestedByUser?: Record<string, unknown>;
    approvedByUser?: Record<string, unknown>;
    rejectedByUser?: Record<string, unknown>;
    dispatchedByUser?: Record<string, unknown>;
    receivedByUser?: Record<string, unknown>;
  };

  const base = {
    id: j.id,
    localId: j.localId,
    transferNumber: j.transferNumber,
    fromBranchId: j.fromBranchId,
    toBranchId: j.toBranchId,
    status: j.status,
    transferDate: j.transferDate,
    requestedBy: j.requestedBy,
    approvedBy: j.approvedBy,
    approvedAt: j.approvedAt,
    rejectedBy: j.rejectedBy,
    rejectedAt: j.rejectedAt,
    rejectionReason: j.rejectionReason,
    dispatchDate: j.dispatchDate,
    dispatchedBy: j.dispatchedBy,
    dispatchedAt: j.dispatchedAt,
    receivedDate: j.receivedDate,
    receivedBy: j.receivedBy,
    receivedAt: j.receivedAt,
    remarks: j.remarks,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };

  if (!includeDetail) {
    return {
      ...base,
      fromBranch: serializeBranchRef(j.fromBranch),
      toBranch: serializeBranchRef(j.toBranch),
      items: (j.items ?? []).map(serializeItem),
    };
  }

  return {
    ...base,
    fromBranch: serializeBranchRef(j.fromBranch),
    toBranch: serializeBranchRef(j.toBranch),
    requestedByUser: serializeUserRef(j.requestedByUser),
    approvedByUser: serializeUserRef(j.approvedByUser),
    rejectedByUser: serializeUserRef(j.rejectedByUser),
    dispatchedByUser: serializeUserRef(j.dispatchedByUser),
    receivedByUser: serializeUserRef(j.receivedByUser),
    items: (j.items ?? []).map(serializeItem),
  };
}

// ─── handlers ─────────────────────────────────────────────────────────────────

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const body = req.body as CreateTransferBody;
  const transfer = await createTransfer(
    {
      localId: body.localId,
      fromBranchId: body.fromBranchId,
      toBranchId: body.toBranchId,
      transferDate: body.transferDate,
      remarks: body.remarks,
      items: body.items,
    },
    user,
  );
  res.status(201).json({ success: true, data: serializeTransfer(transfer) });
});

export const submit = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const transfer = await submitTransfer(req.params.id as string, user);
  res.json({ success: true, data: serializeTransfer(transfer) });
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const transfer = await approveTransfer(req.params.id as string, user);
  res.json({ success: true, data: serializeTransfer(transfer) });
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const { rejectionReason } = req.body as { rejectionReason?: string };
  const transfer = await rejectTransfer(req.params.id as string, rejectionReason ?? '', user);
  res.json({ success: true, data: serializeTransfer(transfer) });
});

export const dispatch = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const transfer = await dispatchTransfer(req.params.id as string, user);
  res.json({ success: true, data: serializeTransfer(transfer) });
});

export const receive = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const { items } = req.body as { items: Array<{ transferItemId: string; receivedQty: number }> };
  const transfer = await receiveTransfer(req.params.id as string, items, user);
  res.json({ success: true, data: serializeTransfer(transfer) });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const transfer = await cancelTransfer(req.params.id as string, user);
  res.json({ success: true, data: serializeTransfer(transfer) });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const q = req.query;
  const limit = q.limit ? Math.min(parseInt(String(q.limit), 10), 500) : 50;
  const offset = q.offset ? Math.max(parseInt(String(q.offset), 10), 0) : 0;
  const { rows, total } = await listTransfers(
    {
      branchId: typeof q.branchId === 'string' ? q.branchId : undefined,
      fromBranchId: typeof q.fromBranchId === 'string' ? q.fromBranchId : undefined,
      toBranchId: typeof q.toBranchId === 'string' ? q.toBranchId : undefined,
      status: typeof q.status === 'string' ? q.status : undefined,
      limit,
      offset,
    },
    user,
  );
  res.json({
    success: true,
    data: rows.map((t) => serializeTransfer(t)),
    meta: { total, count: rows.length, limit, offset },
  });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const transfer = await getTransfer(req.params.id as string, user);
  res.json({ success: true, data: serializeTransfer(transfer, true) });
});
