import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';
import { AppError } from '../utils/AppError';
import { createInvoice, listInvoices, getInvoice } from '../services/billingService';
import { fromColumn, toJsonNumber } from '../utils/money';
import type { CreateInvoiceBody } from '../validators/billingValidators';

function serializeInvoice(invoice: import('../models/Invoice').Invoice) {
  const j = invoice.toJSON() as Record<string, unknown>;
  return {
    id: j.id,
    localId: j.localId,
    invoiceNumber: j.invoiceNumber,
    branchId: j.branchId,
    customerId: j.customerId,
    employeeId: j.employeeId,
    subtotal: toJsonNumber(j.subtotal as string),
    itemDiscountTotal: toJsonNumber(j.itemDiscountTotal as string),
    discount: toJsonNumber(j.discount as string),
    discountType: j.discountType,
    discountValue: toJsonNumber(j.discountValue as string),
    gst: toJsonNumber(j.gst as string),
    grandTotal: toJsonNumber(j.grandTotal as string),
    paidTotal: toJsonNumber(j.paidTotal as string),
    paymentStatus: j.paymentStatus,
    invoiceDate: j.invoiceDate,
    createdAt: j.createdAt,
  };
}

function serializeItem(item: Record<string, unknown>) {
  return {
    id: item.id,
    productId: item.productId,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    sellingPrice: toJsonNumber(item.sellingPrice as string),
    discountPercent: toJsonNumber(item.discountPercent as string),
    grossAmount: toJsonNumber(item.grossAmount as string),
    discountAmount: toJsonNumber(item.discountAmount as string),
    netAmount: toJsonNumber(item.netAmount as string),
    allocatedInvoiceDiscount: toJsonNumber(item.allocatedInvoiceDiscount as string),
    adjustedTaxable: toJsonNumber(item.adjustedTaxable as string),
    gstPercent: toJsonNumber(item.gstPercent as string),
    lineGst: toJsonNumber(item.lineGst as string),
    effectiveUnitPrice: toJsonNumber(item.effectiveUnitPrice as string),
    cutOffPrice: toJsonNumber(item.cutOffPrice as string),
  };
}

function serializePayment(payment: Record<string, unknown>) {
  return {
    id: payment.id,
    method: payment.method,
    amount: toJsonNumber(payment.amount as string),
    reference: payment.reference,
    note: payment.note,
    createdAt: payment.createdAt,
  };
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const body = req.body as CreateInvoiceBody;

  // Branch isolation: SUPER_ADMIN may specify branchId; others are locked to their own.
  const branchId = authoritativeBranchId(req);
  if (body.branchId !== branchId) {
    throw AppError.branchForbidden('branchId in body does not match your branch.');
  }

  const invoice = await createInvoice(
    {
      localId: body.localId,
      branchId,
      customerId: body.customerId ?? null,
      items: body.items,
      discountType: body.discountType,
      discountValue: body.discountValue,
      payments: body.payments,
    },
    user,
  );

  res.status(201).json({ success: true, data: serializeInvoice(invoice) });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const branchId = user.role === 'SUPER_ADMIN' && !req.query.branchId && !req.body?.branchId
    ? null
    : authoritativeBranchId(req);
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  const invoices = await listInvoices(branchId, Math.min(limit, 500));
  res.json({ success: true, data: invoices.map(serializeInvoice) });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await getInvoice(req.params.id as string);
  if (!invoice) throw AppError.notFound('Invoice not found.');

  // Branch isolation: SA without branchId may view any invoice
  const user = currentUser(req);
  if (user.role !== 'SUPER_ADMIN') {
    const branchId = authoritativeBranchId(req);
    if (invoice.branchId !== branchId) throw AppError.branchForbidden();
  }

  const j = invoice.toJSON() as Record<string, unknown> & {
    items?: Record<string, unknown>[];
    payments?: Record<string, unknown>[];
  };

  res.json({
    success: true,
    data: {
      ...serializeInvoice(invoice),
      items: (j.items ?? []).map(serializeItem),
      payments: (j.payments ?? []).map(serializePayment),
    },
  });
});
