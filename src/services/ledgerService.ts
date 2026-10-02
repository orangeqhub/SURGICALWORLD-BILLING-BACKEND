import type { Request } from 'express';
import { QueryTypes, WhereOptions } from 'sequelize';
import { sequelize } from '../config/database';
import { LedgerEntry } from '../models';
import { AppError } from '../utils/AppError';
import { Decimal, toSqlDecimal, round2 } from '../utils/money';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';
import type { LedgerPartyType, LedgerEntryType, LedgerReferenceType } from '../constants/enums';

export interface CreateLedgerEntryInput {
  branchId: string;
  partyType: LedgerPartyType;
  partyId: string;
  partyName?: string | null;
  type: LedgerEntryType;
  amount: number;
  note: string;
  referenceType: 'MANUAL' | 'ADJUSTMENT';
  referenceId?: string | null;
  date?: string;
}

export async function createEntry(req: Request, input: CreateLedgerEntryInput): Promise<LedgerEntry> {
  const user = currentUser(req);

  // authoritativeBranchId resolves the branch:
  // - SUPER_ADMIN        → reads body.branchId (required, multiple values rejected)
  // - BRANCH_ADMIN/EMP   → always own user.branchId
  const branchId = authoritativeBranchId(req);

  // Explicitly reject a non-SA user that supplies a branchId that doesn't match
  // their own. "Conflicts are rejected, never normalised" (README security model).
  if (user.role !== ROLES.SUPER_ADMIN && input.branchId && input.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }

  const amount = toSqlDecimal(round2(new Decimal(input.amount)));

  try {
    const entry = await LedgerEntry.create({
      branchId,
      partyType: input.partyType,
      partyId: input.partyId,
      partyName: input.partyName ?? null,
      type: input.type,
      amount,
      note: input.note,
      referenceType: input.referenceType as LedgerReferenceType,
      referenceId: input.referenceId ?? null,
      entryDate: input.date ? new Date(input.date) : new Date(),
      createdBy: user.id,
    } as never);

    return entry;
  } catch (err: any) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw AppError.conflict(
        'A ledger entry with this referenceType and referenceId already exists.',
        'DUPLICATE_REFERENCE',
      );
    }
    throw err;
  }
}

export interface ListLedgerEntriesInput {
  branchId?: string;
  partyType?: LedgerPartyType;
  partyId?: string;
  limit?: number;
  offset?: number;
}

export async function listEntries(req: Request, input: ListLedgerEntriesInput): Promise<LedgerEntry[]> {
  const user = currentUser(req);
  const where: WhereOptions = {};

  if (user.role !== ROLES.SUPER_ADMIN) {
    // BRANCH_ADMIN and EMPLOYEE are confined to their own branch.
    where['branchId'] = user.branchId!;
  } else if (input.branchId) {
    where['branchId'] = input.branchId;
  }

  if (input.partyType) where['partyType'] = input.partyType;
  if (input.partyId) where['partyId'] = input.partyId;

  return LedgerEntry.findAll({
    where,
    order: [
      ['entryDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit: input.limit ?? 100,
    offset: input.offset ?? 0,
  });
}

export async function partyBalance(partyType: LedgerPartyType, partyId: string): Promise<number> {
  const [result] = await sequelize.query<{ balance: string }>(
    `SELECT COALESCE(
       SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE -amount END),
       0
     ) AS balance
     FROM ledger_entries
     WHERE party_type = :partyType AND party_id = :partyId`,
    { replacements: { partyType, partyId }, type: QueryTypes.SELECT },
  );

  return round2(new Decimal(result?.balance ?? '0')).toNumber();
}
