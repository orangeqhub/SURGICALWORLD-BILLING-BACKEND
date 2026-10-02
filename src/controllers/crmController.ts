import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as crmService from '../services/crmService';

export const listNotes = asyncHandler(async (req: Request, res: Response) => {
  const notes = await crmService.listNotes(req, req.params.customerId as string);
  res.json({ success: true, data: notes });
});

export const createNote = asyncHandler(async (req: Request, res: Response) => {
  const note = await crmService.createNote(req, req.params.customerId as string, req.body);
  res.status(201).json({ success: true, data: note });
});

export const listFollowUps = asyncHandler(async (req: Request, res: Response) => {
  const followUps = await crmService.listFollowUps(req, req.query as Record<string, string>);
  res.json({ success: true, data: followUps });
});

export const getFollowUpCounts = asyncHandler(async (req: Request, res: Response) => {
  const counts = await crmService.getFollowUpCounts(req);
  res.json({ success: true, data: counts });
});

export const createFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const followUp = await crmService.createFollowUp(req, req.body);
  res.status(201).json({ success: true, data: followUp });
});

export const updateFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const followUp = await crmService.updateFollowUp(req, req.params.id as string, req.body);
  res.json({ success: true, data: followUp });
});

export const completeFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const followUp = await crmService.completeFollowUp(req, req.params.id as string, req.body.note ?? '');
  res.json({ success: true, data: followUp });
});

export const cancelFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const followUp = await crmService.cancelFollowUp(req, req.params.id as string, req.body.note ?? '');
  res.json({ success: true, data: followUp });
});

export const rescheduleFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const followUp = await crmService.rescheduleFollowUp(req, req.params.id as string, req.body);
  res.json({ success: true, data: followUp });
});
