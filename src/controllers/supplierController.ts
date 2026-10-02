import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as supplierService from '../services/supplierService';
import { fromColumn } from '../utils/money';
import type { Supplier } from '../models/Supplier';

function serialize(s: Supplier) {
  return {
    id: s.id,
    localId: s.localId,
    branchId: s.branchId,
    name: s.name,
    mobile: s.mobile,
    email: s.email,
    address: s.address,
    gst: s.gst,
    supplierCode: s.supplierCode,
    openingBalance: fromColumn(s.openingBalance).toNumber(),
    openingBalanceType: s.openingBalanceType,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const branchId = (req.params.branchId ?? req.query.branchId) as string | undefined;
  const suppliers = await supplierService.listSuppliers(req, branchId);
  res.json({ success: true, data: suppliers.map(serialize) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await supplierService.createSupplier(req, req.body);
  res.status(201).json({ success: true, data: serialize(supplier) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await supplierService.updateSupplier(req, req.params.id as string, req.body);
  res.json({ success: true, data: serialize(supplier) });
});
