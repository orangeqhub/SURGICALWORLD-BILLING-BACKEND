import { z } from 'zod';

/**
 * Product Master request validation.
 *
 * Field names mirror the frontend's `products` table / ProductRow exactly
 * (frontend/src/database/schema.ts, databaseTypes.ts) so the Product Manager
 * screen needs no translation layer:
 *   code (the SKU column), mrp, cutOffPrice, sellingPrice, purchasePrice,
 *   gst, unit, minStock, hsn, brand, subcategory, manufacturer, batch, mfgDate,
 *   expiryDate, batchTrackingEnabled, expiryTrackingEnabled, status, remarks.
 *
 * PRODUCTS ARE GLOBAL - there is deliberately no branchId here. The frontend
 * `products` table has no branch column and productMasterApi stores every
 * product-profile override in one global AsyncStorage key, so a product is
 * visible to every branch. Per-branch isolation applies to STOCK only.
 *
 * Prices are validated as DECIMAL(14,2) money, discountPercent/gst as
 * DECIMAL(5,2) percentages. The bound checks here are only the FIRST line of
 * defence: src/services/productService.ts re-parses with Decimal.js and the
 * database enforces the ranges with CHECK constraints.
 */

/** Accepts a number or numeric string; anything else fails with a clear path. */
const decimalInput = (label: string, max: string) =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a finite number.` });
      return z.NEVER;
    }
    const text = String(value).trim();
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid decimal number.` });
      return z.NEVER;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is out of range.` });
      return z.NEVER;
    }
    if (Math.abs(parsed) > Number(max)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} exceeds the maximum supported value (${max}).` });
      return z.NEVER;
    }
    return text;
  });

/** A DECIMAL(14,2) money amount that must not be negative. */
const money = (label: string) =>
  decimalInput(label, '999999999999.99').refine((v) => Number(v) >= 0, {
    message: `${label} cannot be negative.`,
  });

/**
 * discountPercent: DECIMAL(5,2), 0 <= value <= 100.
 * Rejects -1, 100.01, 101, NaN, Infinity and malformed decimals rather than
 * clamping them the way the frontend's clampDiscountPercent does. The frontend
 * clamp exists for its mock store only; the server must never silently turn
 * bad input into a valid number.
 */
const percent = (label: string) =>
  decimalInput(label, '100').refine((v) => {
    const n = Number(v);
    return n >= 0 && n <= 100;
  }, { message: `${label} must be between 0 and 100.` });

/** Stock quantities are INTEGER everywhere in the frontend (see databaseTypes.ts). */
const stockCount = (label: string) =>
  z.union([z.number(), z.string()])
    .transform((value, ctx) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a finite whole number.` });
        return z.NEVER;
      }
      const text = String(value).trim();
      if (!/^-?\d+$/.test(text)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a whole number.` });
        return z.NEVER;
      }
      const parsed = Number(text);
      if (!Number.isSafeInteger(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is out of range.` });
        return z.NEVER;
      }
      return parsed;
    })
    .refine((v) => v >= 0, { message: `${label} cannot be negative.` });

const uuidParam = z.object({ id: z.string().uuid('Product id must be a valid UUID.') });

const text = (max: number) => z.string().trim().max(max);

/** Shared optional field set. `.nullable()` so a client can explicitly clear a value. */
const optionalFields = {
  barcode: text(100).nullable().optional(),
  categoryId: z.string().uuid('categoryId must be a valid UUID.').nullable().optional(),
  mrp: money('mrp').optional(),
  cutOffPrice: money('cutOffPrice').optional(),
  sellingPrice: money('sellingPrice').optional(),
  purchasePrice: money('purchasePrice').optional(),
  discountPercent: percent('discountPercent').optional(),
  gst: percent('gst').optional(),
  unit: text(20).optional(),
  minStock: stockCount('minStock').optional(),
  maxStock: stockCount('maxStock').nullable().optional(),
  batch: text(100).nullable().optional(),
  hsn: text(50).nullable().optional(),
  mfgDate: text(50).nullable().optional(),
  expiryDate: text(50).nullable().optional(),
  brand: text(100).nullable().optional(),
  subcategory: text(100).nullable().optional(),
  manufacturer: text(150).nullable().optional(),
  supplier: text(150).nullable().optional(),
  batchTrackingEnabled: z.boolean().optional(),
  expiryTrackingEnabled: z.boolean().optional(),
  remarks: z.string().trim().max(2000).nullable().optional(),
};

export const productIdParamSchema = uuidParam;

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name is required.').max(200),
    // The frontend's SKU column is `code` (productMasterApi maps sku -> code).
    // `sku` is accepted as an alias so either spelling works.
    code: text(100).min(1, 'SKU (code) is required.').optional(),
    sku: text(100).min(1, 'SKU (code) is required.').optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
    ...optionalFields,
  })
  .transform((value, ctx) => {
    const code = value.code ?? value.sku;
    if (!code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['code'], message: 'SKU (code) is required.' });
      return z.NEVER;
    }
    const { sku, ...rest } = value;
    return { ...rest, code };
  });

/** PUT is a partial update: omitted fields are preserved, never reset. */
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name cannot be empty.').max(200).optional(),
    code: text(100).min(1, 'SKU (code) cannot be empty.').optional(),
    sku: text(100).min(1, 'SKU (code) cannot be empty.').optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
    ...optionalFields,
  })
  .transform((value, ctx) => {
    const { sku, ...rest } = value;
    const code = rest.code ?? sku;
    const patch: Record<string, unknown> = { ...rest };
    if (code !== undefined) patch.code = code;
    // `code: null` is not meaningful; drop it so a partial update cannot blank it.
    if (patch.code === null) delete patch.code;
    if (Object.keys(patch).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'No updatable fields were supplied.' });
      return z.NEVER;
    }
    return patch;
  });

export const productStatusSchema = z.object({
  status: z.enum(['Active', 'Inactive'], { message: 'status must be Active or Inactive.' }),
});

export const listProductsQuerySchema = z.object({
  /** Free-text search across name / code (SKU) / barcode / brand. */
  q: text(120).optional(),
  search: text(120).optional(),
  categoryId: z.string().uuid('categoryId must be a valid UUID.').optional(),
  brand: text(100).optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  /** Default returns only Active products, matching Product Master's default list. */
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const searchProductsQuerySchema = z.object({
  q: text(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const barcodeParamSchema = z.object({
  barcode: z.string().trim().min(1, 'A barcode is required.').max(100),
});

export const categoryIdParamSchema = z.object({
  id: z.string().uuid('Category id must be a valid UUID.'),
});

export const listCategoriesQuerySchema = z.object({
  q: text(120).optional(),
});

export default {
  productIdParamSchema,
  createProductSchema,
  updateProductSchema,
  productStatusSchema,
  listProductsQuerySchema,
  searchProductsQuerySchema,
  barcodeParamSchema,
  categoryIdParamSchema,
  listCategoriesQuerySchema,
};