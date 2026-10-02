import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as salesTargetService from '../services/salesTargetService';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const targets = await salesTargetService.listTargets(req, req.query as Record<string, string>);
  res.json({ success: true, data: targets });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const target = await salesTargetService.createTarget(req, req.body);
  res.status(201).json({ success: true, data: target });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const target = await salesTargetService.updateTarget(req, req.params.id as string, req.body);
  res.json({ success: true, data: target });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const target = await salesTargetService.cancelTarget(req, req.params.id as string);
  res.json({ success: true, data: target });
});
