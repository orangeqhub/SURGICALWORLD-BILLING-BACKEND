import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as purchaseService from '../services/purchaseService';
import type { Purchase } from '../models/Purchase';
import type { PurchaseItem } from '../models/PurchaseItem';
import { fromColumn } from '../utils/money';

function serializePurchase(p: Purchase) {
  return {
    id: p.id,
    localId: p.localId,
    branchId: p.branchId,
    supplierId: p.supplierId,
    invoiceNumber: p.invoiceNumber,
    purchaseNumber: p.purchaseNumber,
    supplierInvoiceNumber: p.supplierInvoiceNumber,
    purchaseType: p.purchaseType,
    taxType: p.taxType,
    subtotal: fromColumn(p.subtotal).toNumber(),
    productDiscounts: fromColumn(p.productDiscounts).toNumber(),
    invoiceDiscount: fromColumn(p.invoiceDiscount).toNumber(),
    taxableAmount: fromColumn(p.taxableAmount).toNumber(),
    cgst: fromColumn(p.cgst).toNumber(),
    sgst: fromColumn(p.sgst).toNumber(),
    igst: fromColumn(p.igst).toNumber(),
    otherCharges: fromColumn(p.otherCharges).toNumber(),
    roundOff: fromColumn(p.roundOff).toNumber(),
    netAmount: fromColumn(p.netAmount).toNumber(),
    totalAmount: fromColumn(p.netAmount).toNumber(),
    paidAmount: fromColumn(p.paidAmount).toNumber(),
    balanceAmount: fromColumn(p.balanceAmount).toNumber(),
    notes: p.notes,
    status: p.status,
    purchaseDate: p.purchaseDate,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function serializePurchaseItem(item: PurchaseItem) {
  return {
    id: item.id,
    purchaseId: item.purchaseId,
    productId: item.productId,
    name: item.name,
    skuSnapshot: item.skuSnapshot,
    hsnSnapshot: item.hsnSnapshot,
    quantity: item.quantity,
    freeQuantity: item.freeQuantity,
    unit: item.unit,
    purchasePrice: fromColumn(item.purchasePrice).toNumber(),
    sellingPriceSnapshot: fromColumn(item.sellingPriceSnapshot).toNumber(),
    mrpSnapshot: fromColumn(item.mrpSnapshot).toNumber(),
    discountPercent: fromColumn(item.discountPercent).toNumber(),
    discountAmount: fromColumn(item.discountAmount).toNumber(),
    netAmount: fromColumn(item.netAmount).toNumber(),
    adjustedTaxable: fromColumn(item.adjustedTaxable).toNumber(),
    gstPercent: fromColumn(item.gstPercent).toNumber(),
    cgst: fromColumn(item.cgst).toNumber(),
    sgst: fromColumn(item.sgst).toNumber(),
    igst: fromColumn(item.igst).toNumber(),
    lineGst: fromColumn(item.lineGst).toNumber(),
    lineTotal: fromColumn(item.lineTotal).toNumber(),
    batchNumber: item.batchNumber,
    mfgDate: item.mfgDate,
    expiryDate: item.expiryDate,
    createdAt: item.createdAt,
  };
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const purchase = await purchaseService.createPurchase(req, req.body);
  res.status(201).json({ success: true, data: serializePurchase(purchase) });
});

export const listForBranch = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.params.branchId as string;
  const { limit = 100, offset = 0 } = req.query as Record<string, string>;
  const purchases = await purchaseService.listPurchasesForBranch(req, branchId, Number(limit), Number(offset));
  res.status(200).json({ success: true, data: purchases.map(serializePurchase) });
});

export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const items = await purchaseService.getPurchaseItems(req, id);
  res.status(200).json({ success: true, data: items.map(serializePurchaseItem) });
});
