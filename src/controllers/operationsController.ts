import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as expenseService from '../services/expenseService';
import * as receiptService from '../services/receiptService';
import * as supplierPaymentService from '../services/supplierPaymentService';
import * as settingsService from '../services/settingsService';

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const listExpenses = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.params.branchId as string;
  const expenses = await expenseService.listExpenses(req, branchId);
  res.json({ success: true, data: expenses });
});

export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await expenseService.createExpense(req, req.body);
  res.status(201).json({ success: true, data: expense });
});

// ─── Receipts ─────────────────────────────────────────────────────────────────

export const listReceipts = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.params.branchId as string;
  const receipts = await receiptService.listReceipts(req, branchId);
  res.json({ success: true, data: receipts });
});

export const createReceipt = asyncHandler(async (req: Request, res: Response) => {
  const receipt = await receiptService.createReceipt(req, req.body);
  res.status(201).json({ success: true, data: receipt });
});

// ─── Supplier Payments ────────────────────────────────────────────────────────

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.params.branchId as string;
  const payments = await supplierPaymentService.listPayments(req, branchId);
  res.json({ success: true, data: payments });
});

export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await supplierPaymentService.createPayment(req, req.body);
  res.status(201).json({ success: true, data: payment });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

export const upsertSetting = asyncHandler(async (req: Request, res: Response) => {
  const setting = await settingsService.upsertSetting(req, req.params.key as string, req.body.value);
  res.json({ success: true, data: setting });
});
