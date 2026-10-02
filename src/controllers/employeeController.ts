import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as employeeService from '../services/employeeService';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.params.branchId as string | undefined;
  const employees = await employeeService.listEmployees(req, branchId);
  res.json({ success: true, data: employees });
});

export const listAdmins = asyncHandler(async (req: Request, res: Response) => {
  const admins = await employeeService.listBranchAdmins(req);
  res.json({ success: true, data: admins });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.createEmployee(req, req.body);
  res.status(201).json({ success: true, data: employee });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.updateEmployeeStatus(req, req.params.id as string, req.body.status);
  res.json({ success: true, data: employee });
});
