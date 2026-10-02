import type { Request } from 'express';
import { Payroll } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { toSqlDecimal, round2, Decimal } from '../utils/money';

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : parseFloat(String(v)) || 0;
}

export async function listPayroll(
  req: Request,
  filters: { branchId?: string; employeeId?: string; month?: string },
): Promise<Payroll[]> {
  const user = currentUser(req);
  const where: Record<string, unknown> = {};
  if (user.role !== ROLES.SUPER_ADMIN) where.branchId = user.branchId;
  else if (filters.branchId) where.branchId = filters.branchId;
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.month) where.month = filters.month;
  return Payroll.findAll({ where, order: [['month', 'DESC']] });
}

export async function getPayrollRecord(req: Request, employeeId: string, month: string): Promise<Payroll | null> {
  const user = currentUser(req);
  if (user.role === ROLES.EMPLOYEE && user.id !== employeeId) {
    throw AppError.forbidden('You can only view your own payroll.');
  }
  return Payroll.findOne({ where: { employeeId, month } });
}

export async function generatePayroll(req: Request, input: Record<string, unknown>): Promise<Payroll> {
  const user = currentUser(req);
  const branchId = (input.branchId as string) ?? user.branchId;
  if (!branchId) throw AppError.badRequest('branchId is required.');
  if (user.role === ROLES.EMPLOYEE) throw AppError.forbidden('Employees cannot generate payroll.');

  const record = {
    employeeId: input.employeeId as string,
    employeeName: (input.employeeName as string) ?? null,
    branchId,
    month: input.month as string,
    basicSalary: toSqlDecimal(round2(new Decimal(toNum(input.basicSalary)))),
    allowances: toSqlDecimal(round2(new Decimal(toNum(input.allowances)))),
    bonus: toSqlDecimal(round2(new Decimal(toNum(input.bonus)))),
    deductions: toSqlDecimal(round2(new Decimal(toNum(input.deductions)))),
    advance: toSqlDecimal(round2(new Decimal(toNum(input.advance)))),
    presentDays: toSqlDecimal(round2(new Decimal(toNum(input.presentDays)))),
    absentDays: toSqlDecimal(round2(new Decimal(toNum(input.absentDays)))),
    halfDays: toSqlDecimal(round2(new Decimal(toNum(input.halfDays)))),
    leaveDays: toSqlDecimal(round2(new Decimal(toNum(input.leaveDays)))),
    workingDays: toSqlDecimal(round2(new Decimal(toNum(input.workingDays)))),
    perDayRate: toSqlDecimal(round2(new Decimal(toNum(input.perDayRate)))),
    attendanceDeduction: toSqlDecimal(round2(new Decimal(toNum(input.attendanceDeduction)))),
    grossSalary: toSqlDecimal(round2(new Decimal(toNum(input.grossSalary)))),
    netSalary: toSqlDecimal(round2(new Decimal(toNum(input.netSalary)))),
    remarks: (input.remarks as string) ?? null,
  };

  const existing = await Payroll.findOne({ where: { employeeId: record.employeeId, month: record.month } });
  if (existing) {
    await existing.update(record as never);
    return existing;
  }
  return Payroll.create({ ...record, paymentStatus: 'PENDING', paymentDate: null } as never);
}

export async function editPayroll(req: Request, id: string, patch: Record<string, unknown>): Promise<Payroll> {
  const user = currentUser(req);
  if (user.role === ROLES.EMPLOYEE) throw AppError.forbidden('Employees cannot edit payroll.');
  const record = await Payroll.findByPk(id);
  if (!record) throw AppError.notFound('Payroll record not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== record.branchId) {
    throw AppError.branchForbidden('You do not have access to this payroll record.');
  }
  await record.update(patch as never);
  return record;
}

export async function markPaid(req: Request, id: string): Promise<Payroll> {
  const user = currentUser(req);
  if (user.role === ROLES.EMPLOYEE) throw AppError.forbidden('Employees cannot mark payroll as paid.');
  const record = await Payroll.findByPk(id);
  if (!record) throw AppError.notFound('Payroll record not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== record.branchId) {
    throw AppError.branchForbidden('You do not have access to this payroll record.');
  }
  await record.update({ paymentStatus: 'PAID', paymentDate: new Date() } as never);
  return record;
}
