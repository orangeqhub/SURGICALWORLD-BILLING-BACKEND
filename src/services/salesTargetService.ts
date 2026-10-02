import type { Request } from 'express';
import { SalesTarget } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { toSqlDecimal, round2, Decimal } from '../utils/money';

export async function listTargets(
  req: Request,
  filters: { branchId?: string; employeeId?: string; periodType?: string; status?: string },
): Promise<SalesTarget[]> {
  const user = currentUser(req);
  const where: Record<string, unknown> = {};
  if (user.role !== ROLES.SUPER_ADMIN) where.branchId = user.branchId;
  else if (filters.branchId) where.branchId = filters.branchId;
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.periodType && filters.periodType !== 'ALL') where.periodType = filters.periodType;
  if (filters.status && filters.status !== 'ALL') where.status = filters.status;
  return SalesTarget.findAll({ where, order: [['startDate', 'DESC']] });
}

export async function createTarget(req: Request, input: Record<string, unknown>): Promise<SalesTarget> {
  const user = currentUser(req);
  const branchId = (input.branchId as string) ?? user.branchId;
  if (user.role !== ROLES.SUPER_ADMIN && branchId && user.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to this branch.');
  }
  return SalesTarget.create({
    branchId: branchId ?? null,
    employeeId: (input.employeeId as string) ?? null,
    periodType: (input.periodType as string) ?? 'MONTHLY',
    targetAmount: toSqlDecimal(round2(new Decimal(Number(input.targetAmount) || 0))),
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'ACTIVE',
    notes: (input.notes as string) ?? null,
    createdByName: user.name,
    createdBy: user.id,
  } as never);
}

export async function updateTarget(req: Request, id: string, patch: Record<string, unknown>): Promise<SalesTarget> {
  const user = currentUser(req);
  const target = await SalesTarget.findByPk(id);
  if (!target) throw AppError.notFound('Sales target not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== target.branchId) {
    throw AppError.branchForbidden('You do not have access to this target.');
  }
  await target.update(patch as never);
  return target;
}

export async function cancelTarget(req: Request, id: string): Promise<SalesTarget> {
  const user = currentUser(req);
  const target = await SalesTarget.findByPk(id);
  if (!target) throw AppError.notFound('Sales target not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== target.branchId) {
    throw AppError.branchForbidden('You do not have access to this target.');
  }
  await target.update({ status: 'CANCELLED' } as never);
  return target;
}
