import { z } from 'zod';
import { ROLES } from '../constants/roles';
import { ALL_PERMISSIONS } from '../constants/permissions';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.');

export const loginSchema = z.object({
  loginId: z.string().trim().min(1, 'loginId is required.').max(100),
  password: z.string().min(1, 'password is required.').max(128),
  branchId: z.string().trim().max(64).optional().nullable(),
});

export const createUserSchema = z.object({
  loginId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1, 'name is required.').max(150),
  password,
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.EMPLOYEE]),
  branchId: z.string().trim().max(64).optional().nullable(),
  employeeId: z.string().trim().max(100).optional().nullable(),
  email: z.string().trim().email('Must be a valid email.').max(150).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).default([]),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword is required.').max(128),
  newPassword: password,
});

export const userStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const listUsersQuerySchema = z.object({
  branchId: z.string().trim().max(64).optional(),
});

export type LoginBody = z.infer<typeof loginSchema>;
export type CreateUserBody = z.infer<typeof createUserSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;