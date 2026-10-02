import { z } from 'zod';
import { LEDGER_PARTY_TYPES, LEDGER_ENTRY_TYPES, MANUAL_LEDGER_REFERENCE_TYPES } from '../constants/enums';

export const createLedgerEntryBodySchema = z
  .object({
    branchId: z.string().uuid(),
    partyType: z.enum(LEDGER_PARTY_TYPES),
    partyId: z.string().uuid(),
    partyName: z.string().max(200).nullish(),
    type: z.enum(LEDGER_ENTRY_TYPES),
    amount: z.number().positive({ message: 'amount must be greater than 0' }),
    note: z.string().min(1).max(2000),
    referenceType: z.enum(MANUAL_LEDGER_REFERENCE_TYPES as [string, ...string[]]),
    referenceId: z.string().uuid().nullish(),
    /** ISO timestamp sent by the frontend's toEntryDate(); defaults to now if absent. */
    date: z.string().datetime({ offset: true }).optional(),
    /** Ignored — createdBy is always taken from the authenticated JWT. */
    createdBy: z.string().uuid().nullish().optional(),
  })
  .strip();

export const listLedgerEntriesQuerySchema = z
  .object({
    branchId: z.string().uuid().optional(),
    partyType: z.enum(LEDGER_PARTY_TYPES).optional(),
    partyId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strip();

export const partyBalanceQuerySchema = z
  .object({
    partyType: z.enum(LEDGER_PARTY_TYPES),
    partyId: z.string().uuid(),
  })
  .strip();
