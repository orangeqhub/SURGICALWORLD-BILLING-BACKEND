import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as ledgerService from '../services/ledgerService';
import type { LedgerEntry } from '../models';

/**
 * Serializes a LedgerEntry model instance into the API response shape.
 *
 * The frontend contract (LedgerEntryManager.jsx, LedgerView.jsx) expects a
 * `date` field, not `entryDate`. The mapping is made here, once.
 */
function serialize(entry: LedgerEntry) {
  return {
    id: entry.id,
    branchId: entry.branchId,
    partyType: entry.partyType,
    partyId: entry.partyId,
    partyName: entry.partyName,
    type: entry.type,
    amount: Number(entry.amount),
    note: entry.note,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    date: entry.entryDate,   // entryDate → date (frontend contract)
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
  };
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const entry = await ledgerService.createEntry(req, req.body);
  res.status(201).json({ success: true, data: serialize(entry) });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { branchId, partyType, partyId, limit, offset } = req.query as Record<string, string>;
  const entries = await ledgerService.listEntries(req, {
    branchId,
    partyType: partyType as any,
    partyId,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  res.json({ success: true, data: entries.map(serialize) });
});

export const balance = asyncHandler(async (req: Request, res: Response) => {
  const { partyType, partyId } = req.query as { partyType: string; partyId: string };
  const bal = await ledgerService.partyBalance(partyType as any, partyId);
  res.json({ success: true, data: bal });
});
