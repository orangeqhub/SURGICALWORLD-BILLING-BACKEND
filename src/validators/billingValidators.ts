import { z } from 'zod';
import { PAYMENT_METHODS, DISCOUNT_TYPES } from '../constants/enums';

/**
 * Billing request validation.
 *
 * Frontend contract source: frontend/src/components/billing/BillingPOS.jsx
 * and frontend/src/services/api/billingApi.js (real-mode path).
 *
 * Key decisions:
 *  - sellingPrice: trusted from client (PRICE_EDIT permission allows override).
 *  - discountPercent / gst / cutOffPrice: NOT accepted from client — derived
 *    from the product row inside billingService (prevents manipulation).
 *  - discountType/discountValue: invoice-level, raw input resolved server-side.
 *  - payments array: at least one entry; amounts must be > 0.
 *  - localId: client-generated idempotency key (UUID or "INV-…" prefix format).
 */

const moneyString = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a non-negative number.` });
        return z.NEVER;
      }
      return n;
    });

const positiveInt = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const raw = String(v).trim();
      if (!/^\d+$/.test(raw)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a positive whole number.` });
        return z.NEVER;
      }
      const n = parseInt(raw, 10);
      if (n <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be greater than zero.` });
        return z.NEVER;
      }
      return n;
    });

export const createInvoiceBodySchema = z.object({
  localId: z.string().min(1).max(100),
  branchId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional().default(null),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: positiveInt('quantity'),
        sellingPrice: moneyString('sellingPrice'),
      }),
    )
    .min(1, 'At least one item is required.'),
  discountType: z.enum([DISCOUNT_TYPES.AMOUNT, DISCOUNT_TYPES.PERCENT]).default(DISCOUNT_TYPES.AMOUNT),
  discountValue: moneyString('discountValue').default(0),
  payments: z
    .array(
      z.object({
        method: z.enum([...PAYMENT_METHODS] as [string, ...string[]]),
        amount: moneyString('payment amount'),
        reference: z.string().max(200).optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .min(1, 'At least one payment entry is required.'),
});

export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;

export const listInvoicesQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10) || 50, 1), 500) : 50)),
});

export const invoiceIdParamSchema = z.object({
  id: z.string().min(1).max(200),
});
