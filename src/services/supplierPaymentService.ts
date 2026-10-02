import type { Request } from 'express';
import { SupplierPayment, LedgerEntry } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';
import { toSqlDecimal, round2, Decimal } from '../utils/money';
import { sequelize } from '../config/database';

export async function listPayments(req: Request, branchId: string): Promise<SupplierPayment[]> {
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to this branch.');
  }
  return SupplierPayment.findAll({ where: { branchId }, order: [['date', 'DESC']] });
}

export async function createPayment(req: Request, input: Record<string, unknown>): Promise<SupplierPayment> {
  const branchId = authoritativeBranchId(req);
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && input.branchId && input.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }

  const amount = toSqlDecimal(round2(new Decimal(Number(input.amount) || 0)));

  return sequelize.transaction(async (t) => {
    const payment = await SupplierPayment.create({
      branchId,
      supplierId: (input.supplierId as string) ?? null,
      supplierName: (input.supplierName as string) ?? null,
      amount,
      method: (input.method as string) ?? null,
      reference: (input.reference as string) ?? null,
      note: (input.note as string) ?? null,
      date: (input.date as string) ? new Date(input.date as string) : new Date(),
      status: 'RECORDED',
      createdBy: user.id,
    } as never, { transaction: t });

    if (input.supplierId) {
      await LedgerEntry.create({
        branchId,
        partyType: 'SUPPLIER',
        partyId: input.supplierId,
        partyName: (input.supplierName as string) ?? null,
        type: 'CREDIT',
        amount,
        note: (input.note as string) || `Payment ${payment.id}`,
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        entryDate: new Date(),
        createdBy: user.id,
      } as never, { transaction: t });
    }

    return payment;
  });
}
