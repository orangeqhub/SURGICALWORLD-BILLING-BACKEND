import { Op } from 'sequelize';
import { AppError } from '../utils/AppError';
import { User, Branch } from '../models';
import { hashPassword, verifyPassword } from './passwordService';
import { signAccessToken } from './tokenService';
import { ROLES, type Role } from '../constants/roles';
import type { Permission } from '../constants/permissions';

export interface LoginInput {
  loginId: string;
  password: string;
  /**
   * Optional branch selector. The frontend's login screens send a branch when
   * signing in as Branch Admin or Employee (authApi.js loginBranchAdmin/
   * loginEmployee). When present it must match the user's own branch.
   */
  branchId?: string | null;
}

export interface AuthUserPayload {
  id: string;
  loginId: string;
  role: Role;
  branchId: string | null;
  branchName: string;
  name: string;
  permissions: Permission[];
}

export interface LoginResult {
  token: string;
  user: AuthUserPayload;
}

/**
 * Credential login.
 *
 * Security properties:
 *  - the password is compared with bcrypt and never logged
 *  - a wrong loginId and a wrong password return the SAME generic message, so
 *    the endpoint cannot be used to enumerate valid accounts
 *  - `branchId` from the request is only ever used to CONFIRM the user's own
 *    branch; it can never widen access. The JWT's branchId is read from the DB.
 *  - inactive accounts are refused
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const loginId = input.loginId?.trim();
  const password = input.password ?? '';

  if (!loginId || !password) {
    throw AppError.badRequest('loginId and password are required.');
  }

  const user = await User.findOne({ where: { loginId } });
  if (!user) {
    // Spend comparable time on the miss so timing does not leak existence.
    await verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    throw AppError.unauthorized('Invalid credentials.');
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    throw AppError.unauthorized('Invalid credentials.');
  }

  if (user.status !== 'active') {
    throw AppError.forbidden('This account is inactive. Contact your administrator.');
  }

  const requestedBranchId = input.branchId?.trim();
  if (requestedBranchId && user.branchId && requestedBranchId !== user.branchId) {
    throw AppError.branchForbidden('This account does not belong to the selected branch.');
  }

  // SUPER_ADMIN must not be scoped to a branch, matching the DB CHECK.
  if (user.role !== ROLES.SUPER_ADMIN && !user.branchId) {
    throw AppError.forbidden('This account is not assigned to a branch. Contact your administrator.');
  }

  const branch = user.branchId ? await Branch.findByPk(user.branchId) : null;
  if (user.branchId && !branch) {
    throw AppError.forbidden('The branch assigned to this account no longer exists.');
  }
  if (branch && branch.status !== 'Active') {
    throw AppError.forbidden('This branch is inactive.');
  }

  await user.update({ lastLoginAt: new Date() });

  const payload: AuthUserPayload = {
    id: user.id,
    loginId: user.loginId,
    role: user.role,
    branchId: user.branchId,
    branchName: branch?.name ?? 'All Branches',
    name: user.name,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };

  return { token: signAccessToken({ id: user.id, loginId: user.loginId, role: user.role, branchId: user.branchId, name: user.name }), user: payload };
}

/** The authenticated principal, for GET /auth/me. */
export async function me(userId: string): Promise<AuthUserPayload> {
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('User not found.');
  const branch = user.branchId ? await Branch.findByPk(user.branchId) : null;
  return {
    id: user.id,
    loginId: user.loginId,
    role: user.role,
    branchId: user.branchId,
    branchName: branch?.name ?? 'All Branches',
    name: user.name,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

/** Admin user creation. Passwords are hashed; plaintext is never stored. */
export async function createUser(
  input: { loginId: string; name: string; password: string; role: Role; branchId?: string | null; employeeId?: string | null; permissions?: Permission[]; email?: string | null; phone?: string | null },
  actor: { role: Role; branchId: string | null },
): Promise<AuthUserPayload> {
  if (input.role === ROLES.SUPER_ADMIN) {
    if (actor.role !== ROLES.SUPER_ADMIN) {
      throw AppError.forbidden('Only a Super Admin can create another Super Admin.');
    }
    // Rejected rather than silently dropped: a Super Admin with a branch is a
    // client bug, and quietly discarding the value would mask it. This mirrors
    // the users_branch_required_by_role CHECK in migration 001.
    if (input.branchId) {
      throw AppError.badRequest('A SUPER_ADMIN must not have a branchId.');
    }
  } else {
    if (!input.branchId) {
      throw AppError.badRequest('branchId is required for BRANCH_ADMIN and EMPLOYEE roles.');
    }
    // A Branch Admin can only ever create staff inside their own branch.
    if (actor.role === ROLES.BRANCH_ADMIN && input.branchId !== actor.branchId) {
      throw AppError.branchForbidden('You can only create users in your own branch.');
    }
    const branch = await Branch.findByPk(input.branchId);
    if (!branch) throw AppError.badRequest('The specified branch does not exist.');
  }

  const existing = await User.findOne({ where: { loginId: input.loginId.trim() } });
  if (existing) {
    throw AppError.conflict('An account with this loginId already exists.');
  }

  const created = await User.create({
    role: input.role,
    branchId: input.branchId ?? null,
    loginId: input.loginId.trim(),
    employeeId: input.employeeId ?? null,
    name: input.name.trim(),
    email: input.email ?? null,
    phone: input.phone ?? null,
    passwordHash: await hashPassword(input.password),
    permissions: input.role === ROLES.EMPLOYEE ? (input.permissions ?? []) : [],
    status: 'active',
  });

  return me(created.id);
}

/** Changes a password. The user id comes from the route/JWT, never the body. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('User not found.');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw AppError.unauthorized('Current password is incorrect.');
  }
  await user.update({ passwordHash: await hashPassword(newPassword) });
}

export async function listUsers(actor: { role: Role; branchId: string | null }, branchId?: string): Promise<AuthUserPayload[]> {
  const where: Record<string, unknown> = {};
  if (actor.role !== ROLES.SUPER_ADMIN) {
    where.branchId = actor.branchId;
  } else if (branchId) {
    where.branchId = branchId;
  }
  const users = await User.findAll({ where, order: [['name', 'ASC']] });
  return Promise.all(users.map((user) => me(user.id)));
}

export async function setUserStatus(userId: string, status: 'active' | 'inactive'): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('User not found.');
  await user.update({ status });
}