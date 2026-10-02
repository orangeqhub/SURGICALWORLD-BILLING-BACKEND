import type { Request } from 'express';
import { Receipt, LedgerEntry } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';
import { toSqlDecimal, round2, Decimal } from '../utils/money';
import { sequelize } from '../config/database';

export async function listReceipts(req: Request, branchId: string): Promise<Receipt[]> {
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to this branch.');
  }
  return Receipt.findAll({ where: { branchId }, order: [['date', 'DESC']] });
}

export async function createReceipt(req: Request, input: Record<string, unknown>): Promise<Receipt> {
  const branchId = authoritativeBranchId(req);
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && input.branchId && input.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }

  const amount = toSqlDecimal(round2(new Decimal(Number(input.amount) || 0)));

  return sequelize.transaction(async (t) => {
    const receipt = await Receipt.create({
      branchId,
      customerId: (input.customerId as string) ?? null,
      customerName: (input.customerName as string) ?? null,
      amount,
      method: (input.method as string) ?? 'CASH',
      reference: (input.reference as string) ?? null,
      note: (input.note as string) ?? null,
      date: (input.date as string) ? new Date(input.date as string) : new Date(),
      status: 'RECORDED',
      createdBy: user.id,
    } as never, { transaction: t });

    if (input.customerId) {
      await LedgerEntry.create({
        branchId,
        partyType: 'CUSTOMER',
        partyId: input.customerId,
        partyName: (input.customerName as string) ?? null,
        type: 'CREDIT',
        amount,
        note: (input.note as string) || `Receipt ${receipt.id}`,
        referenceType: 'RECEIPT',
        referenceId: receipt.id,
        entryDate: new Date(),
        createdBy: user.id,
      } as never, { transaction: t });
    }

    return receipt;
  });
}
