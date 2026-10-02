import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as reportService from '../services/reportService';

export const salesTrend = asyncHandler(async (req: Request, res: Response) => {
  const { branchId, days } = req.query as Record<string, string>;
  const data = await reportService.getSalesTrend(req, branchId, days ? Number(days) : 7);
  res.json({ success: true, data });
});

export const branchSales = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportService.getBranchSales(req);
  res.json({ success: true, data });
});

export const paymentSplit = asyncHandler(async (req: Request, res: Response) => {
  const { branchId } = req.query as Record<string, string>;
  const data = await reportService.getPaymentSplit(req, branchId);
  res.json({ success: true, data });
});

export const productSales = asyncHandler(async (req: Request, res: Response) => {
  const { branchId, limit } = req.query as Record<string, string>;
  const data = await reportService.getProductSales(req, branchId, limit ? Number(limit) : 10);
  res.json({ success: true, data });
});

export const customerSales = asyncHandler(async (req: Request, res: Response) => {
  const { branchId, limit } = req.query as Record<string, string>;
  const data = await reportService.getCustomerSales(req, branchId, limit ? Number(limit) : 50);
  res.json({ success: true, data });
});

export const purchaseProductBreakdown = asyncHandler(async (req: Request, res: Response) => {
  const { branchId, limit } = req.query as Record<string, string>;
  const data = await reportService.getPurchaseProductBreakdown(req, branchId, limit ? Number(limit) : 50);
  res.json({ success: true, data });
});
