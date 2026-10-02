import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';
import { AppError } from '../utils/AppError';
import * as stockService from '../services/stockService';

/**
 * Stock controller.
 *
 * Branch authority always comes from the authenticated token
 * (`authoritativeBranchId`), never from the request body, so a Branch Admin
 * cannot address another branch's stock by editing the payload.
 *
 * Like productController, these handlers READ the already-validated request
 * values instead of re-parsing: middleware/validate.ts replaced req.params /
 * req.query / req.body with the Zod output, and parsing a transformed value a
 * second time fails (e.g. `includeMissing` is boolean after validation).
 */

function actor(req: Request): { role: ReturnType<typeof currentUser>['role']; branchId: string | null } {
  const user = currentUser(req);
  return { role: user.role, branchId: user.branchId };
}

/** GET /branches/:branchId/inventory (also /branches/:branchId/stock). */
export const listBranchInventory = asyncHandler(async (req: Request, res: Response) => {
  const routeBranchId = req.params.branchId as string;
  const query = req.query as { productId?: string; includeMissing?: boolean; limit?: number; offset?: number };
  // authoritativeBranchId re-derives the branch from the token, so a tampered
  // route param can never select the data.
  const branchId = authoritativeBranchId(req);

  if (routeBranchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }

  const rows = await stockService.listBranchStock(branchId, {
    productId: query.productId,
    includeMissing: query.includeMissing,
    limit: query.limit,
    offset: query.offset,
  });
  res.status(200).json({ success: true, data: rows, meta: { count: rows.length, branchId } });
});

/** GET /stock - all branches for Super Admin, own branch for everyone else. */
export const listAll = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as { branchId?: string; productId?: string; limit?: number; offset?: number };
  const rows = await stockService.listAllStock(actor(req), query.branchId, {
    productId: query.productId,
    limit: query.limit,
    offset: query.offset,
  });
  res.status(200).json({ success: true, data: rows, meta: { count: rows.length } });
});

/** GET /stock/low - uses the frontend's own LOW_STOCK / OUT_OF_STOCK rule. */
export const listLow = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as { branchId?: string; includeOutOfStock?: boolean };
  const rows = await stockService.listLowStock(actor(req), query.branchId, query.includeOutOfStock);
  res.status(200).json({ success: true, data: rows, meta: { count: rows.length } });
});

/** GET /branches/:branchId/stock-movements and GET /stock/movements. */
export const listMovements = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as {
    branchId?: string;
    productId?: string;
    type?: stockService.MovementType;
    limit?: number;
    offset?: number;
  };
  // When the branch is in the path, the token must own it.
  if (req.params.branchId) {
    const routeBranchId = req.params.branchId as string;
    if (routeBranchId !== authoritativeBranchId(req)) {
      throw AppError.branchForbidden('You do not have access to the requested branch.');
    }
  }
  const rows = await stockService.listMovements(actor(req), query.branchId, {
    productId: query.productId,
    type: query.type,
    limit: query.limit,
    offset: query.offset,
  });
  res.status(200).json({ success: true, data: rows, meta: { count: rows.length } });
});

/** GET /branches/:branchId/stock/:productId */
export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const routeBranchId = req.params.branchId as string;
  const productId = req.params.productId as string;
  const branchId = authoritativeBranchId(req);
  if (routeBranchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }
  const rows = await stockService.listBranchStock(branchId, { productId });
  if (rows.length === 0) {
    // No row yet means "no stock record", which a stock screen still needs to
    // render - so this is a zero row, not a 404.
    res.status(200).json({
      success: true,
      data: {
        branchId,
        productId,
        available: 0,
        quantity: 0,
        minStock: 0,
        status: 'OUT_OF_STOCK',
        hasRecord: false,
      },
    });
    return;
  }
  res.status(200).json({ success: true, data: { ...rows[0], hasRecord: true } });
});

/** POST /branches/:branchId/stock-adjust - the frontend's adjustInventory call. */
export const adjust = asyncHandler(async (req: Request, res: Response) => {
  const routeBranchId = req.params.branchId as string;
  const body = req.body as stockService.BranchAdjustmentBody;
  const branchId = authoritativeBranchId(req);

  if (routeBranchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }
  // A branchId smuggled into the body must not contradict the token either.
  if (body.branchId && body.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }

  const result = await stockService.adjustStock({ ...body, branchId });
  res.status(200).json({ success: true, data: result });
});

/** POST /stock/adjust - body carries the branch id. */
export const adjustByBody = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as stockService.BranchAdjustmentBody;
  const branchId = authoritativeBranchId(req);
  const result = await stockService.adjustStock({ ...body, branchId });
  res.status(200).json({ success: true, data: result });
});

/** PUT /branches/:branchId/stock - absolute set (physical stock count). */
export const setTotal = asyncHandler(async (req: Request, res: Response) => {
  const routeBranchId = req.params.branchId as string;
  const body = req.body as { productId: string; newTotal: number; reason: string; minStock?: number };
  const branchId = authoritativeBranchId(req);
  if (routeBranchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }
  const result = await stockService.setTotal({ ...body, branchId });
  res.status(200).json({ success: true, data: result });
});

/** POST /branches/:branchId/stock/init - creates the opening stock row. */
export const initialise = asyncHandler(async (req: Request, res: Response) => {
  const routeBranchId = req.params.branchId as string;
  const body = req.body as { productId: string; available?: number; minStock?: number; reason?: string };
  const branchId = authoritativeBranchId(req);
  if (routeBranchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }
  const result = await stockService.initialiseStock({ ...body, branchId });
  res.status(201).json({ success: true, data: result });
});

/** GET /batches - read-only; batch quantities are not mutated in Phase 4. */
export const listBatches = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as {
    branchId?: string;
    productId?: string;
    status?: string;
    expiringWithinDays?: number;
  };
  const rows = await stockService.listBatches(actor(req), query.branchId, {
    productId: query.productId,
    status: query.status,
    expiringWithinDays: query.expiringWithinDays,
    limit: 200,
  });
  res.status(200).json({ success: true, data: rows, meta: { count: rows.length } });
});

/** Body-carried-branch form: POST /api/stock/set */
export const setTotalByBody = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { branchId: string; productId: string; newTotal: number; reason: string; minStock?: number };
  const branchId = authoritativeBranchId(req);
  const result = await stockService.setTotal({ ...body, branchId });
  res.status(200).json({ success: true, data: result });
});

/** POST /api/stock/init */
export const initialiseByBody = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { branchId: string; productId: string; available?: number; minStock?: number; reason?: string };
  const branchId = authoritativeBranchId(req);
  const result = await stockService.initialiseStock({ ...body, branchId });
  res.status(201).json({ success: true, data: result });
});

export default {
  listBranchInventory,
  listAll,
  listLow,
  listMovements,
  getOne,
  adjust,
  adjustByBody,
  setTotal,
  setTotalByBody,
  initialise,
  initialiseByBody,
  listBatches,
};
