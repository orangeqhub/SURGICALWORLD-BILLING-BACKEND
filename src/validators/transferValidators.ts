import { z } from 'zod';

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

export const createTransferBodySchema = z.object({
  localId: z.string().min(1).max(100).optional().nullable(),
  fromBranchId: z.string().uuid(),
  toBranchId: z.string().uuid(),
  transferDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'transferDate must be YYYY-MM-DD')
    .default(() => new Date().toISOString().slice(0, 10)),
  remarks: z.string().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        transferQty: positiveInt('transferQty'),
        batchId: z.string().uuid().optional().nullable(),
        batchNumber: z.string().max(100).optional().nullable(),
        expiryDate: z.string().max(50).optional().nullable(),
        remarks: z.string().max(255).optional().nullable(),
      }),
    )
    .min(1, 'At least one item is required.'),
});

export type CreateTransferBody = z.infer<typeof createTransferBodySchema>;

export const rejectTransferBodySchema = z.object({
  rejectionReason: z.string().max(1000).optional().default(''),
});

export const receiveTransferBodySchema = z.object({
  items: z
    .array(
      z.object({
        transferItemId: z.string().uuid(),
        receivedQty: positiveInt('receivedQty'),
      }),
    )
    .min(1, 'At least one item is required.'),
});

export const transferIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listTransfersQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  fromBranchId: z.string().uuid().optional(),
  toBranchId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10) || 50, 1), 500) : 50)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? Math.max(parseInt(v, 10) || 0, 0) : 0)),
});
