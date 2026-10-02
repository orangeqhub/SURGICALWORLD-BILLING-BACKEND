import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as customerService from '../services/customerService';
import { fromColumn } from '../utils/money';
import type { Customer } from '../models/Customer';

function serialize(c: Customer) {
  return {
    id: c.id,
    localId: c.localId,
    branchId: c.branchId,
    name: c.name,
    mobile: c.mobile,
    email: c.email,
    address: c.address,
    gst: c.gst,
    doctor: c.doctor,
    type: c.type,
    customerCode: c.customerCode,
    creditLimit: fromColumn(c.creditLimit).toNumber(),
    openingBalance: fromColumn(c.openingBalance).toNumber(),
    openingBalanceType: c.openingBalanceType,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const branchId = (req.params.branchId ?? req.query.branchId) as string;
  const customers = await customerService.listCustomers(req, branchId);
  res.json({ success: true, data: customers.map(serialize) });
});

export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? '';
  const customers = await customerService.searchCustomers(req, q);
  res.json({ success: true, data: customers.map(serialize) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.createCustomer(req, req.body);
  res.status(201).json({ success: true, data: serialize(customer) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.updateCustomer(req, req.params.id as string, req.body);
  res.json({ success: true, data: serialize(customer) });
});
