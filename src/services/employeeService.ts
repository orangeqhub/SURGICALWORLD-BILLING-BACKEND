import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { env } from '../config/env';

function stripHash(u: User) {
  const obj = u.toJSON() as Record<string, unknown>;
  delete obj.passwordHash;
  return obj;
}

export async function listEmployees(req: Request, branchId?: string): Promise<object[]> {
  const user = currentUser(req);
  const where: Record<string, unknown> = { role: ROLES.EMPLOYEE };
  if (branchId) {
    if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== branchId) {
      throw AppError.branchForbidden('You do not have access to this branch.');
    }
    where.branchId = branchId;
  } else if (user.role !== ROLES.SUPER_ADMIN) {
    where.branchId = user.branchId;
  }
  const employees = await User.findAll({ where, order: [['name', 'ASC']] });
  return employees.map(stripHash);
}

export async function listBranchAdmins(req: Request): Promise<object[]> {
  const user = currentUser(req);
  const where: Record<string, unknown> = { role: ROLES.BRANCH_ADMIN };
  if (user.role !== ROLES.SUPER_ADMIN) {
    where.branchId = user.branchId;
  }
  const admins = await User.findAll({ where, order: [['name', 'ASC']] });
  return admins.map(stripHash);
}

export async function createEmployee(req: Request, input: Record<string, unknown>): Promise<object> {
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.BRANCH_ADMIN) {
    throw AppError.forbidden('Only admins can create employees.');
  }

  const branchId = input.branchId as string | undefined;
  if (!branchId) throw AppError.badRequest('branchId is required.');

  if (user.role === ROLES.BRANCH_ADMIN && user.branchId !== branchId) {
    throw AppError.branchForbidden('You can only create employees for your own branch.');
  }

  const existing = await User.findOne({ where: { loginId: input.loginId } });
  if (existing) throw AppError.conflict('A user with this login ID already exists.', 'DUPLICATE_LOGIN_ID');

  const password = (input.password as string) || 'ChangeMe@123';
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  const employee = await User.create({
    role: ROLES.EMPLOYEE,
    branchId,
    loginId: input.loginId,
    employeeId: input.employeeId ?? null,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    passwordHash,
    permissions: (input.permissions as string[]) ?? [],
    status: 'active',
  } as never);

  return stripHash(employee);
}

export async function updateEmployeeStatus(req: Request, employeeId: string, status: string): Promise<object> {
  const user = currentUser(req);
  const employee = await User.findByPk(employeeId);
  if (!employee) throw AppError.notFound('Employee not found.');
  if (user.role === ROLES.BRANCH_ADMIN && user.branchId !== employee.branchId) {
    throw AppError.branchForbidden('You can only manage employees in your own branch.');
  }
  await employee.update({ status } as never);
  return stripHash(employee);
}
