import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as attendanceService from '../services/attendanceService';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const records = await attendanceService.listAttendance(req, req.query as Record<string, string>);
  res.json({ success: true, data: records });
});

export const getToday = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.getTodayAttendance(req, req.query.employeeId as string);
  res.json({ success: true, data: record });
});

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.checkIn(req, req.body);
  res.status(201).json({ success: true, data: record });
});

export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.checkOut(req, req.body);
  res.json({ success: true, data: record });
});

export const manual = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.recordManualAttendance(req, req.body);
  res.status(201).json({ success: true, data: record });
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const result = await attendanceService.getMonthlySummary(
    req,
    req.query.employeeId as string,
    req.query.month as string,
  );
  res.json({ success: true, data: result });
});
