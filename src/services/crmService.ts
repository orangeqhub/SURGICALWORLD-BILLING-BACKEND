import type { Request } from 'express';
import { Op } from 'sequelize';
import { CrmNote, CrmFollowUp, Customer } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';

function branchOf(req: Request) {
  const user = currentUser(req);
  return user.role !== ROLES.SUPER_ADMIN ? user.branchId : null;
}

// ─── CRM Notes ────────────────────────────────────────────────────────────────

export async function listNotes(req: Request, customerId: string): Promise<CrmNote[]> {
  const user = currentUser(req);
  const customer = await Customer.findByPk(customerId);
  if (!customer) throw AppError.notFound('Customer not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== customer.branchId) {
    throw AppError.branchForbidden('You do not have access to this customer.');
  }
  return CrmNote.findAll({ where: { customerId }, order: [['createdAt', 'DESC']] });
}

export async function createNote(req: Request, customerId: string, input: Record<string, unknown>): Promise<CrmNote> {
  const user = currentUser(req);
  const customer = await Customer.findByPk(customerId);
  if (!customer) throw AppError.notFound('Customer not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== customer.branchId) {
    throw AppError.branchForbidden('You do not have access to this customer.');
  }
  return CrmNote.create({
    branchId: customer.branchId,
    customerId,
    note: input.note,
    createdBy: user.id,
  } as never);
}

// ─── CRM Follow-ups ───────────────────────────────────────────────────────────

interface FollowUpFilters {
  branchId?: string;
  employeeId?: string;
  customerId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listFollowUps(req: Request, filters: FollowUpFilters): Promise<CrmFollowUp[]> {
  const userBranch = branchOf(req);
  const where: Record<string, unknown> = {};
  if (userBranch) where.branchId = userBranch;
  else if (filters.branchId) where.branchId = filters.branchId;
  if (filters.employeeId) where.assignedTo = filters.employeeId;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters.dateFrom && filters.dateTo) {
    where.followUpDate = { [Op.gte]: filters.dateFrom, [Op.lte]: filters.dateTo };
  } else if (filters.dateFrom) {
    where.followUpDate = { [Op.gte]: filters.dateFrom };
  } else if (filters.dateTo) {
    where.followUpDate = { [Op.lte]: filters.dateTo };
  }
  return CrmFollowUp.findAll({ where, order: [['followUpDate', 'ASC']] });
}

export async function getFollowUpCounts(req: Request): Promise<{ today: number; overdue: number; upcoming: number }> {
  const userBranch = branchOf(req);
  const where: Record<string, unknown> = { status: { [Op.in]: ['PENDING', 'FOLLOWING'] } };
  if (userBranch) where.branchId = userBranch;
  const today = new Date().toISOString().slice(0, 10);
  const rows = await CrmFollowUp.findAll({ where });
  return {
    today: rows.filter((r) => r.followUpDate === today).length,
    overdue: rows.filter((r) => r.followUpDate < today).length,
    upcoming: rows.filter((r) => r.followUpDate > today).length,
  };
}

export async function createFollowUp(req: Request, input: Record<string, unknown>): Promise<CrmFollowUp> {
  const user = currentUser(req);
  const branchId = (input.branchId as string) ?? user.branchId;
  if (!branchId) throw AppError.badRequest('branchId is required.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to this branch.');
  }
  const timestamp = new Date().toISOString();
  return CrmFollowUp.create({
    branchId,
    customerId: input.customerId,
    customerName: input.customerName ?? null,
    assignedTo: input.assignedTo ?? null,
    followUpDate: input.followUpDate,
    followUpTime: input.followUpTime ?? null,
    status: 'PENDING',
    notes: input.notes ?? null,
    history: [{ at: timestamp, action: 'CREATED', note: input.notes || '' }],
    createdByName: user.name,
    createdBy: user.id,
  } as never);
}

export async function updateFollowUp(req: Request, id: string, patch: Record<string, unknown>): Promise<CrmFollowUp> {
  const user = currentUser(req);
  const followUp = await CrmFollowUp.findByPk(id);
  if (!followUp) throw AppError.notFound('Follow-up not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== followUp.branchId) {
    throw AppError.branchForbidden('You do not have access to this follow-up.');
  }
  const history = [...(followUp.history as object[]), { at: new Date().toISOString(), action: 'EDITED', note: patch.notes || '' }];
  await followUp.update({ ...patch, history } as never);
  return followUp;
}

async function patchFollowUpStatus(
  req: Request, id: string, status: string, action: string, note: string,
  extra: Record<string, unknown> = {},
): Promise<CrmFollowUp> {
  const user = currentUser(req);
  const followUp = await CrmFollowUp.findByPk(id);
  if (!followUp) throw AppError.notFound('Follow-up not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== followUp.branchId) {
    throw AppError.branchForbidden('You do not have access to this follow-up.');
  }
  const history = [...(followUp.history as object[]), { at: new Date().toISOString(), action, note }];
  await followUp.update({ status, history, ...extra } as never);
  return followUp;
}

export async function completeFollowUp(req: Request, id: string, note: string): Promise<CrmFollowUp> {
  return patchFollowUpStatus(req, id, 'COMPLETED', 'COMPLETED', note);
}

export async function cancelFollowUp(req: Request, id: string, note: string): Promise<CrmFollowUp> {
  return patchFollowUpStatus(req, id, 'CANCELLED', 'CANCELLED', note);
}

export async function rescheduleFollowUp(
  req: Request, id: string, input: { followUpDate: string; followUpTime?: string; notes?: string },
): Promise<CrmFollowUp> {
  return patchFollowUpStatus(req, id, 'FOLLOWING', 'RESCHEDULED', input.notes || `Rescheduled to ${input.followUpDate}`, {
    followUpDate: input.followUpDate,
    followUpTime: input.followUpTime ?? null,
    nextFollowUpDate: input.followUpDate,
  });
}
