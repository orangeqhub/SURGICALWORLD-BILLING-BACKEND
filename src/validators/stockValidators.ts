import { z } from 'zod';

/**
 * Stock / stock-movement request validation.
 *
 * Endpoint paths and payload shapes are dictated by the existing frontend
 * adapters, which were inspected before this file was written:
 *   frontend/src/services/api/inventoryApi.js
 *     GET  /branches/:branchId/inventory        -> fetchInventory
 *     GET  /branches/:branchId/stock-movements  -> fetchStockMovements
 *     POST /branches/:branchId/stock-adjust  { productId, delta, reason }
 *   frontend/src/services/api/productApi.js
 *     GET  /branches/:branchId/stock            -> fetchBranchStock
 *     GET  /stock                              -> fetchAllBranchStock
 *   frontend/src/services/api/batchInventoryApi.js
 *     GET  /batches?branchId=&productId=        -> fetchBatches (READ ONLY)
 *
 * QUANTITIES ARE INTEGERS. This is not an assumption: branch_stock.available,
 * stock_movements.quantity, products.min_stock/max_stock and
 * invoice_items.quantity are all INTEGER in the frontend's schema.ts, and the
 * Phase 2 backend already matches. Decimal quantities are rejected with a 400
 * rather than silently truncated, which would corrupt stock.
 */

/** Signed whole number, rejects 0 (a zero-quantity movement is meaningless). */
const signedNonZeroInteger = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((value, ctx) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a finite whole number.` });
        return z.NEVER;
      }
      const raw = String(value).trim();
      if (!/^-?\d+$/.test(raw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be a whole number (stock quantities are integers in this system).`,
        });
        return z.NEVER;
      }
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is out of range.` });
        return z.NEVER;
      }
      return parsed;
    })
    .refine((v) => v !== 0, { message: `${label} cannot be zero.` });

/** Unsigned whole number >= 0. */
const nonNegativeCount = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((value, ctx) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a finite whole number.` });
        return z.NEVER;
      }
      const raw = String(value).trim();
      if (!/^\d+$/.test(raw)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a non-negative whole number.` });
        return z.NEVER;
      }
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is out of range.` });
        return z.NEVER;
      }
      return parsed;
    });

const reason = z.string().trim().min(1, 'A reason is required for every stock adjustment.').max(300);
const productId = z.string().uuid('productId must be a valid UUID.');
const branchId = z.string().uuid('branchId must be a valid UUID.');
const reference = {
  referenceType: z.string().trim().max(50).optional(),
  referenceId: z.string().uuid('referenceId must be a valid UUID.').optional(),
  batchId: z.string().uuid('batchId must be a valid UUID.').optional(),
  note: z.string().trim().max(1000).optional(),
};

export const branchIdParamSchema = z.object({ branchId });

export const branchProductParamSchema = z.object({ branchId, productId });

/** POST /branches/:branchId/stock-adjust */
export const stockAdjustSchema = z.object({
  productId,
  delta: signedNonZeroInteger('delta'),
  reason,
  minStock: nonNegativeCount('minStock').optional(),
  ...reference,
});

/** POST /api/stock/adjust - branch travels in the body. */
export const stockAdjustBodySchema = z.object({
  branchId,
  productId,
  delta: signedNonZeroInteger('delta'),
  reason,
  minStock: nonNegativeCount('minStock').optional(),
  ...reference,
});

/** PUT /branches/:branchId/stock - absolute physical count. */
export const stockSetSchema = z.object({
  productId,
  newTotal: nonNegativeCount('newTotal'),
  reason,
  minStock: nonNegativeCount('minStock').optional(),
});

export const stockSetBodySchema = z.object({
  branchId,
  productId,
  newTotal: nonNegativeCount('newTotal'),
  reason,
  minStock: nonNegativeCount('minStock').optional(),
});

/** POST /branches/:branchId/stock/init - opening balance for a new row. */
export const stockInitSchema = z.object({
  productId,
  available: nonNegativeCount('available').default(0),
  minStock: nonNegativeCount('minStock').default(0),
  reason: reason.default('Initial stock'),
});

export const stockInitBodySchema = z.object({
  branchId,
  productId,
  available: nonNegativeCount('available').default(0),
  minStock: nonNegativeCount('minStock').default(0),
  reason: reason.default('Initial stock'),
});

export const listStockQuerySchema = z.object({
  branchId: z.string().uuid('branchId must be a valid UUID.').optional(),
  productId: z.string().uuid('productId must be a valid UUID.').optional(),
  /** Report Active products that have no branch_stock row as zero-stock. */
  includeMissing: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const lowStockQuerySchema = z.object({
  branchId: z.string().uuid('branchId must be a valid UUID.').optional(),
  includeOutOfStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
});

export const movementQuerySchema = z.object({
  branchId: z.string().uuid('branchId must be a valid UUID.').optional(),
  productId: z.string().uuid('productId must be a valid UUID.').optional(),
  type: z
    .enum(['SALE', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'SALE_RETURN', 'PURCHASE_RETURN'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const batchQuerySchema = z.object({
  branchId: z.string().uuid('branchId must be a valid UUID.').optional(),
  productId: z.string().uuid('productId must be a valid UUID.').optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'BLOCKED', 'DEPLETED']).optional(),
  /** Only batches whose expiryDate is on/before today + N days. */
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
});

export default {
  branchIdParamSchema,
  branchProductParamSchema,
  stockAdjustSchema,
  stockAdjustBodySchema,
  stockSetSchema,
  stockSetBodySchema,
  stockInitSchema,
  stockInitBodySchema,
  listStockQuerySchema,
  lowStockQuerySchema,
  movementQuerySchema,
  batchQuerySchema,
};