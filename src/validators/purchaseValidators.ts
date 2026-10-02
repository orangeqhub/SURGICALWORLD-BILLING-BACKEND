import { z } from 'zod';

/** One line item inside a purchase creation request. */
const purchaseItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string().max(200).optional(),
  sku: z.string().max(100).nullish(),
  hsn: z.string().max(100).nullish(),
  quantity: z.coerce.number().int().positive(),
  freeQuantity: z.coerce.number().int().min(0).default(0),
  unit: z.string().max(30).nullish(),
  purchasePrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0).default(0),
  mrp: z.coerce.number().min(0).default(0),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  gstPercent: z.coerce.number().min(0).max(100).default(0),
  batchNumber: z.string().max(100).nullish(),
  mfgDate: z.string().max(30).nullish(),
  expiryDate: z.string().max(30).nullish(),
  remarks: z.string().max(500).nullish(),
}).strip();

export const createPurchaseBodySchema = z.object({
  /** Frontend-supplied idempotency key (the DPUR-… id from the draft store). */
  id: z.string().max(150).nullish(),
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierInvoiceNumber: z.string().max(150).nullish(),
  purchaseDate: z.string().max(30).optional(),
  taxType: z.enum(['INTRA', 'INTER']).default('INTRA'),
  purchaseType: z.enum(['CASH', 'CREDIT']).default('CREDIT'),
  items: z.array(purchaseItemSchema).min(1, 'At least one item is required'),
  invoiceDiscount: z.coerce.number().min(0).default(0),
  otherCharges: z.coerce.number().min(0).default(0),
  paidAmount: z.coerce.number().min(0).default(0),
  notes: z.string().max(2000).nullish(),
}).strip();

export type CreatePurchaseBody = z.infer<typeof createPurchaseBodySchema>;

export const listPurchasesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
}).strip();

export const branchIdParamSchema = z.object({
  branchId: z.string().uuid(),
}).strip();

export const purchaseIdentifierParamSchema = z.object({
  id: z.string().min(1).max(150),
}).strip();
