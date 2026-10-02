import type { Request, RequestHandler, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { currentUser } from './authenticate';
import { ROLES, type Role } from '../constants/roles';
import type { Permission } from '../constants/permissions';
import { logWarn } from '../config/logger';

/**
 * Restricts a route to an explicit allow-list of roles. Always paired with
 * `authenticate` upstream so req.user is guaranteed.
 *
 * This is the gate that enforces "ONLY SUPER_ADMIN can approve or reject a
 * stock transfer": a BRANCH_ADMIN token calling
 * POST /stock-transfers/:id/approve is rejected with 403 here, regardless of
 * what the frontend UI showed them.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = currentUser(req);
    if (!allowed.includes(user.role)) {
      logWarn('Role denied', { userId: user.id, role: user.role, allowed, path: req.originalUrl });
      throw AppError.forbidden(
        `This action requires one of the following roles: ${allowed.join(', ')}. Your role is ${user.role}.`,
      );
    }
    next();
  };
}

export const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);
export const requireAdmin = requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN);

/**
 * Mirrors frontend/src/utils/permissions.js hasPermission() exactly:
 * SUPER_ADMIN and BRANCH_ADMIN bypass the permission list; EMPLOYEE must hold
 * the permission explicitly.
 *
 * NOTE: deliberately NOT used for transfer approval. The frontend makes
 * transfer approval an explicit SUPER_ADMIN-only carve-out because
 * hasPermission() grants Branch Admin everything; use `requireRole` there.
 */
export function requirePermission(...required: Permission[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = currentUser(req);
    if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.BRANCH_ADMIN) {
      next();
      return;
    }
    const held = new Set<string>(user.permissions);
    const missing = required.filter((permission) => !held.has(permission));
    if (missing.length > 0) {
      logWarn('Permission denied', { userId: user.id, role: user.role, missing, path: req.originalUrl });
      throw AppError.forbidden(`Missing required permission: ${missing.join(', ')}.`);
    }
    next();
  };
}

/**
 * Branch isolation.
 *
 * Resolves the branch a request is allowed to act on and REJECTS any explicit
 * conflicting branchId rather than silently normalising it - a mismatch is a
 * client bug or an attack, and hiding it would mask real problems.
 *
 * Behaviour:
 *  - SUPER_ADMIN       -> any branch, but it must be supplied and must exist.
 *  - BRANCH_ADMIN      -> only req.user.branchId. An explicit different
 *                         branchId in body/query/route => 403.
 *  - EMPLOYEE          -> same as BRANCH_ADMIN (branch-scoped).
 *
 * IMPORTANT: every explicitly supplied branch id (route param, body, query) is
 * collected and compared against each other BEFORE being compared to the user.
 * Picking the route param and ignoring a conflicting body would let a request
 * such as GET /branches/<own-branch>?branchId=<victim-branch> through.
 */
export function requireBranchAccess(options: {
  /** Route param holding a branch id, e.g. ':branchId'. */
  param?: string;
  /** Allow SUPER_ADMIN to omit branchId (single-branch routes only). */
  allowGlobalAdminWithoutBranch?: boolean;
} = {}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = currentUser(req);

    const supplied = collectSuppliedBranchIds(req, options.param);

    // Two different branches requested by the same request is always a bug or
    // an attack, regardless of who is asking.
    if (supplied.distinct.length > 1) {
      logWarn('Conflicting branch ids in one request', {
        userId: user.id,
        role: user.role,
        supplied: supplied.distinct,
        path: req.originalUrl,
      });
      throw AppError.badRequest(`Conflicting branchId values in one request: ${supplied.distinct.join(', ')}.`);
    }

    const requested = supplied.distinct[0];

    if (user.role === ROLES.SUPER_ADMIN) {
      if (!requested) {
        if (options.allowGlobalAdminWithoutBranch) {
          next();
          return;
        }
        throw AppError.badRequest('branchId is required.');
      }
      next();
      return;
    }

    if (!user.branchId) {
      // Defensive: the DB CHECK means this cannot happen for a valid account.
      throw AppError.forbidden('Your account is not assigned to a branch.');
    }

    // A conflicting explicit value is rejected, never normalised.
    if (requested && requested !== user.branchId) {
      logWarn('Branch access denied', {
        userId: user.id,
        role: user.role,
        userBranchId: user.branchId,
        requestedBranchId: requested,
        path: req.originalUrl,
      });
      throw AppError.branchForbidden('You do not have access to the requested branch.');
    }

    next();
  };
}

/** Gathers every explicitly supplied branchId so conflicts cannot hide. */
function collectSuppliedBranchIds(req: Request, param?: string): { distinct: string[] } {
  const values: string[] = [];

  // 'branchId' is always collected, even when the caller does not name a param.
  // A route that puts the branch in the path (e.g. /branches/:branchId/stock)
  // has supplied it just as explicitly as one in the body, and ignoring it
  // would make SUPER_ADMIN requests to those routes fail with
  // "branchId is required." - or, worse, let a conflicting value slip past.
  const routeValues = [param, 'branchId']
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .map((name) => req.params[name])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  values.push(...routeValues);

  const bodyValue = req.body?.branchId;
  if (typeof bodyValue === 'string' && bodyValue) values.push(bodyValue);

  const queryValue = req.query?.branchId;
  if (typeof queryValue === 'string' && queryValue) values.push(queryValue);

  return { distinct: [...new Set(values)] };
}

/**
 * Returns the branch the current request must operate on, ignoring any
 * client-supplied value. Services call this instead of reading `body.branchId`
 * so the authenticated user is always the source of truth.
 */
export function authoritativeBranchId(req: Request): string {
  const user = currentUser(req);
  if (user.role === ROLES.SUPER_ADMIN) {
    const supplied = collectSuppliedBranchIds(req);
    if (supplied.distinct.length > 1) {
      throw AppError.badRequest(`Conflicting branchId values in one request: ${supplied.distinct.join(', ')}.`);
    }
    if (!supplied.distinct[0]) {
      throw AppError.badRequest('branchId is required.');
    }
    return supplied.distinct[0];
  }
  if (!user.branchId) {
    throw AppError.forbidden('Your account is not assigned to a branch.');
  }
  return user.branchId;
}

export default { requireRole, requireSuperAdmin, requireAdmin, requirePermission, requireBranchAccess, authoritativeBranchId };