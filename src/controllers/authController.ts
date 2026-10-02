import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { currentUser } from '../middleware/authenticate';
import { z } from 'zod';
import * as authService from '../services/authService';
import * as branchService from '../services/branchService';
import { ROLES } from '../constants/roles';
import type { LoginBody } from '../validators/authValidators';

/**
 * POST /api/auth/login
 * Request:  { loginId, password, branchId? }
 * Response: { success: true, data: { token, user } }
 *
 * Wrapped in the project envelope. The frontend's apiClient returns the parsed
 * body verbatim and has no real-mode auth endpoint today, so the envelope is
 * additive and conflicts with nothing.
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body as LoginBody);
  res.status(200).json({ success: true, data: result });
});

/** GET /api/auth/me - the authenticated principal derived from the JWT. */
export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  res.status(200).json({ success: true, data: await authService.me(user.id) });
});

/** POST /api/auth/change-password - changes the CALLER's own password. */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  await authService.changePassword(user.id, req.body.currentPassword, req.body.newPassword);
  res.status(200).json({ success: true, data: { message: 'Password updated.' } });
});

/** GET /api/users - branch-scoped for Branch Admin, global for Super Admin. */
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const actor = currentUser(req);
  const users = await authService.listUsers(actor, req.query.branchId as string | undefined);
  res.status(200).json({ success: true, data: users });
});

/** POST /api/users - SUPER_ADMIN only. A Branch Admin cannot mint admins. */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const actor = currentUser(req);
  const user = await authService.createUser(req.body, actor);
  res.status(201).json({ success: true, data: user });
});

/** PUT /api/users/:id/status */
export const setUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = currentUser(req);
  const targetId = req.params.id as string;

  // A Branch Admin may only enable/disable staff inside their own branch, and
  // may never disable an account holding a role above their own.
  const target = await authService.me(targetId);
  if (actor.role === ROLES.BRANCH_ADMIN) {
    if (target.branchId !== actor.branchId) {
      return res.status(403).json({
        success: false,
        error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this user.' },
      });
    }
    if (target.role !== ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        error: { code: 'AUTHORIZATION_ERROR', message: 'You can only change the status of employee accounts.' },
      });
    }
  }
  await authService.setUserStatus(targetId, req.body.status);
  res.status(200).json({ success: true, data: { message: 'User status updated.' } });
});

// --- Branches ------------------------------------------------------------

/** GET /api/branches - SUPER_ADMIN sees all; others see only their own. */
export const listBranches = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(req);
  const branches = await branchService.listBranches(user.role === ROLES.SUPER_ADMIN ? undefined : (user.branchId ?? undefined));
  res.status(200).json({ success: true, data: branches });
});

/** GET /api/branches/:branchId - 403 for another branch. */
export const getBranch = asyncHandler(async (req: Request, res: Response) => {
  const branch = await branchService.getBranchOrThrow(req.params.branchId as string);
  res.status(200).json({ success: true, data: branch });
});

const branchSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  address: z.string().max(2000).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  gst: z.string().max(50).optional().nullable(),
  manager: z.string().max(150).optional().nullable(),
  opening: z.string().max(20).optional().nullable(),
  closing: z.string().max(20).optional().nullable(),
  status: z.enum(['Active', 'Inactive']).optional(),
});

const branchUpdateSchema = branchSchema.partial();

/** POST /api/branches - SUPER_ADMIN only (also enforced by requireRole). */
export const createBranch = asyncHandler(async (req: Request, res: Response) => {
  const branch = await branchService.createBranch(req.body);
  res.status(201).json({ success: true, data: branch });
});

/** PUT /api/branches/:branchId - SUPER_ADMIN only. */
export const updateBranch = asyncHandler(async (req: Request, res: Response) => {
  const branch = await branchService.updateBranch(req.params.branchId as string, req.body);
  res.status(200).json({ success: true, data: branch });
});