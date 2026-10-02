import type { Request } from 'express';
import { Expense } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';
import { toSqlDecimal, round2, Decimal } from '../utils/money';

export async function listExpenses(req: Request, branchId: string): Promise<Expense[]> {
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to this branch.');
  }
  return Expense.findAll({ where: { branchId }, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
}

export async function createExpense(req: Request, input: Record<string, unknown>): Promise<Expense> {
  const branchId = authoritativeBranchId(req);
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && input.branchId && input.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }
  return Expense.create({
    branchId,
    date: (input.date as string) ?? new Date().toISOString().slice(0, 10),
    category: input.category,
    amount: toSqlDecimal(round2(new Decimal(Number(input.amount) || 0))),
    paymentMethod: (input.paymentMethod as string) ?? null,
    reference: (input.reference as string) ?? null,
    note: (input.note as string) ?? null,
    createdBy: user.id,
  } as never);
}
