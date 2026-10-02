import type { Request } from 'express';
import { Op } from 'sequelize';
import { Attendance } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { toSqlDecimal, round2, Decimal } from '../utils/money';

function computeWorkingHours(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return '0.00';
  const inParts = checkIn.split(':').map(Number);
  const outParts = checkOut.split(':').map(Number);
  const inH = inParts[0] ?? 0, inM = inParts[1] ?? 0;
  const outH = outParts[0] ?? 0, outM = outParts[1] ?? 0;
  const minutes = outH * 60 + outM - (inH * 60 + inM);
  if (minutes <= 0) return '0.00';
  return toSqlDecimal(round2(new Decimal(minutes).dividedBy(60)));
}

function effectiveBranchId(req: Request): string | null {
  const user = currentUser(req);
  return user.role !== ROLES.SUPER_ADMIN ? user.branchId : null;
}

export async function listAttendance(
  req: Request,
  filters: { branchId?: string; employeeId?: string; dateFrom?: string; dateTo?: string },
): Promise<Attendance[]> {
  const userBranch = effectiveBranchId(req);
  const where: Record<string, unknown> = {};
  if (userBranch) where.branchId = userBranch;
  else if (filters.branchId) where.branchId = filters.branchId;
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.dateFrom && filters.dateTo) {
    where.date = { [Op.gte]: filters.dateFrom, [Op.lte]: filters.dateTo };
  } else if (filters.dateFrom) {
    where.date = { [Op.gte]: filters.dateFrom };
  } else if (filters.dateTo) {
    where.date = { [Op.lte]: filters.dateTo };
  }
  return Attendance.findAll({ where, order: [['date', 'DESC']] });
}

export async function getTodayAttendance(req: Request, employeeId: string): Promise<Attendance | null> {
  const user = currentUser(req);
  if (user.role === ROLES.EMPLOYEE && user.id !== employeeId) {
    throw AppError.forbidden('You can only view your own attendance.');
  }
  const today = new Date().toISOString().slice(0, 10);
  return Attendance.findOne({ where: { employeeId, date: today } });
}

export async function checkIn(req: Request, input: { employeeId: string; branchId?: string }): Promise<Attendance> {
  const user = currentUser(req);
  const branchId = (input.branchId as string) ?? user.branchId;
  if (!branchId) throw AppError.badRequest('branchId is required.');
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 5);

  const existing = await Attendance.findOne({ where: { employeeId: input.employeeId, date } });
  if (existing) {
    await existing.update({
      checkInTime: time,
      workingHours: computeWorkingHours(time, existing.checkOutTime),
      status: 'PRESENT',
    } as never);
    return existing;
  }
  return Attendance.create({
    employeeId: input.employeeId,
    employeeName: user.name,
    branchId,
    date,
    status: 'PRESENT',
    checkInTime: time,
    checkOutTime: null,
    workingHours: '0.00',
    remarks: null,
  } as never);
}

export async function checkOut(req: Request, input: { employeeId: string }): Promise<Attendance> {
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 5);
  const record = await Attendance.findOne({ where: { employeeId: input.employeeId, date } });
  if (!record || !record.checkInTime) {
    throw AppError.badRequest('Check in before checking out.');
  }
  await record.update({
    checkOutTime: time,
    workingHours: computeWorkingHours(record.checkInTime, time),
  } as never);
  return record;
}

export async function recordManualAttendance(
  req: Request,
  input: {
    employeeId: string; employeeName?: string; branchId?: string; date: string;
    status: string; checkInTime?: string; checkOutTime?: string; remarks?: string;
  },
): Promise<Attendance> {
  const user = currentUser(req);
  const branchId = (input.branchId as string) ?? user.branchId;
  if (!branchId) throw AppError.badRequest('branchId is required.');
  const workingHours = computeWorkingHours(input.checkInTime ?? null, input.checkOutTime ?? null);

  const existing = await Attendance.findOne({ where: { employeeId: input.employeeId, date: input.date } });
  if (existing) {
    await existing.update({
      employeeName: input.employeeName ?? existing.employeeName,
      status: input.status,
      checkInTime: input.checkInTime ?? existing.checkInTime,
      checkOutTime: input.checkOutTime ?? existing.checkOutTime,
      workingHours,
      remarks: input.remarks ?? existing.remarks,
    } as never);
    return existing;
  }
  return Attendance.create({
    employeeId: input.employeeId,
    employeeName: input.employeeName ?? null,
    branchId,
    date: input.date,
    status: input.status,
    checkInTime: input.checkInTime ?? null,
    checkOutTime: input.checkOutTime ?? null,
    workingHours,
    remarks: input.remarks ?? null,
  } as never);
}

export async function getMonthlySummary(
  req: Request,
  employeeId: string,
  month: string,
): Promise<object> {
  const user = currentUser(req);
  if (user.role === ROLES.EMPLOYEE && user.id !== employeeId) {
    throw AppError.forbidden('You can only view your own attendance summary.');
  }
  const rows = await Attendance.findAll({
    where: { employeeId, date: { [Op.gte]: `${month}-01`, [Op.lte]: `${month}-31` } },
    order: [['date', 'ASC']],
  });
  const summary = { presentDays: 0, absentDays: 0, halfDays: 0, leaveDays: 0, holidayDays: 0, totalHours: 0, workingDays: 0, records: rows };
  rows.forEach((r) => {
    if (r.status === 'PRESENT') summary.presentDays += 1;
    else if (r.status === 'ABSENT') summary.absentDays += 1;
    else if (r.status === 'HALF_DAY') summary.halfDays += 1;
    else if (r.status === 'LEAVE') summary.leaveDays += 1;
    else if (r.status === 'HOLIDAY') summary.holidayDays += 1;
    summary.totalHours += parseFloat(r.workingHours as string) || 0;
  });
  summary.workingDays = summary.presentDays + summary.halfDays * 0.5;
  return summary;
}
