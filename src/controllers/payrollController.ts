import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as payrollService from '../services/payrollService';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const records = await payrollService.listPayroll(req, req.query as Record<string, string>);
  res.json({ success: true, data: records });
});

export const getRecord = asyncHandler(async (req: Request, res: Response) => {
  const record = await payrollService.getPayrollRecord(req, req.params.employeeId as string, req.params.month as string);
  res.json({ success: true, data: record });
});

export const generate = asyncHandler(async (req: Request, res: Response) => {
  const record = await payrollService.generatePayroll(req, req.body);
  res.status(201).json({ success: true, data: record });
});

export const edit = asyncHandler(async (req: Request, res: Response) => {
  const record = await payrollService.editPayroll(req, req.params.id as string, req.body);
  res.json({ success: true, data: record });
});

export const markPaid = asyncHandler(async (req: Request, res: Response) => {
  const record = await payrollService.markPaid(req, req.params.id as string);
  res.json({ success: true, data: record });
});
