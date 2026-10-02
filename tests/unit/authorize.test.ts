import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  authoritativeBranchId,
  requireBranchAccess,
  requirePermission,
  requireRole,
} from '../../src/middleware/authorize';
import { AppError } from '../../src/utils/AppError';
import { ROLES } from '../../src/constants/roles';

/**
 * Middleware is tested in isolation with a fake req/res. This is where the
 * security guarantees live, so they are asserted directly rather than only
 * through HTTP.
 */

function fakeRequest(opts: {
  user?: { id: string; loginId: string; role: string; branchId: string | null; name: string; permissions: string[] };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): Request {
  return {
    user: opts.user,
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: opts.query ?? {},
    originalUrl: '/test',
  } as unknown as Request;
}

function run(handler: RequestHandler, req: Request): { nextCalled: boolean; error: unknown } {
  let nextCalled = false;
  const next: NextFunction = vi.fn(() => {
    nextCalled = true;
  });
  const res = {} as Response;
  let error: unknown;
  try {
    handler(req, res, next);
  } catch (err) {
    error = err;
  }
  return { nextCalled, error };
}

const BRANCH_A = '11111111-1111-1111-1111-111111111111';
const BRANCH_B = '22222222-2222-2222-2222-222222222222';

const superAdmin = {
  id: 'sa',
  loginId: 'SA-001',
  role: ROLES.SUPER_ADMIN,
  branchId: null,
  name: 'SA',
  permissions: [],
};
const branchAdminA = {
  id: 'ba',
  loginId: 'BA-001',
  role: ROLES.BRANCH_ADMIN,
  branchId: BRANCH_A,
  name: 'BA',
  permissions: [],
};
const employeeA = {
  id: 'emp',
  loginId: 'EMP-001',
  role: ROLES.EMPLOYEE,
  branchId: BRANCH_A,
  name: 'Emp',
  permissions: ['BILLING'],
};

describe('requireRole', () => {
  it('lets an allowed role through', () => {
    const { nextCalled, error } = run(requireRole(ROLES.SUPER_ADMIN), fakeRequest({ user: superAdmin }));
    expect(error).toBeUndefined();
    expect(nextCalled).toBe(true);
  });

  it('rejects a role outside the allow-list with 403', () => {
    const { nextCalled, error } = run(requireRole(ROLES.SUPER_ADMIN), fakeRequest({ user: branchAdminA }));
    expect(nextCalled).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
  });

  it('blocks a Branch Admin from a Super-Admin-only action', () => {
    // This is the guarantee behind "only Super Admin can approve a transfer".
    const { error } = run(requireRole(ROLES.SUPER_ADMIN), fakeRequest({ user: employeeA }));
    expect((error as AppError).statusCode).toBe(403);
  });
});

describe('requirePermission', () => {
  it('lets Super Admin and Branch Admin through unconditionally, mirroring hasPermission()', () => {
    expect(run(requirePermission('BILLING'), fakeRequest({ user: superAdmin })).nextCalled).toBe(true);
    expect(run(requirePermission('BILLING'), fakeRequest({ user: branchAdminA })).nextCalled).toBe(true);
  });

  it('lets an Employee through when they hold the permission', () => {
    expect(run(requirePermission('BILLING'), fakeRequest({ user: employeeA })).nextCalled).toBe(true);
  });

  it('rejects an Employee who lacks the permission', () => {
    const { error } = run(requirePermission('PAYROLL_MANAGE'), fakeRequest({ user: employeeA }));
    expect((error as AppError).statusCode).toBe(403);
  });

  it('reports every missing permission, not just the first', () => {
    const { error } = run(requirePermission('PAYROLL_MANAGE', 'CRM_MANAGE'), fakeRequest({ user: employeeA }));
    expect((error as AppError).message).toContain('PAYROLL_MANAGE');
    expect((error as AppError).message).toContain('CRM_MANAGE');
  });
});

describe('requireBranchAccess', () => {
  const guard = requireBranchAccess({ param: 'branchId' });

  it('lets a Branch Admin read their own branch', () => {
    const req = fakeRequest({ user: branchAdminA, params: { branchId: BRANCH_A } });
    expect(run(guard, req).nextCalled).toBe(true);
  });

  it('blocks a Branch Admin reading another branch', () => {
    const req = fakeRequest({ user: branchAdminA, params: { branchId: BRANCH_B } });
    const { nextCalled, error } = run(guard, req);
    expect(nextCalled).toBe(false);
    expect((error as AppError).statusCode).toBe(403);
  });

  it('blocks an Employee reading another branch', () => {
    const req = fakeRequest({ user: employeeA, params: { branchId: BRANCH_B } });
    expect(run(guard, req).nextCalled).toBe(false);
  });

  it('lets a Super Admin read any branch', () => {
    expect(run(guard, fakeRequest({ user: superAdmin, params: { branchId: BRANCH_A } })).nextCalled).toBe(true);
    expect(run(guard, fakeRequest({ user: superAdmin, params: { branchId: BRANCH_B } })).nextCalled).toBe(true);
  });

  it('rejects a conflicting branchId in the body even when the route matches', () => {
    // The route param is the user's own branch, so a naive "route wins" check
    // would let the request through while the body targets another branch.
    const req = fakeRequest({
      user: branchAdminA,
      params: { branchId: BRANCH_A },
      body: { branchId: BRANCH_B },
    });
    const { nextCalled, error } = run(guard, req);
    expect(nextCalled).toBe(false);
    expect((error as AppError).statusCode).toBe(400);
    expect((error as AppError).message).toContain('Conflicting branchId');
  });

  it('rejects a conflicting branchId in the query string', () => {
    const req = fakeRequest({
      user: branchAdminA,
      params: { branchId: BRANCH_A },
      query: { branchId: BRANCH_B },
    });
    expect(run(guard, req).nextCalled).toBe(false);
  });

  it('rejects conflicting branchIds even for a Super Admin', () => {
    const req = fakeRequest({
      user: superAdmin,
      params: { branchId: BRANCH_A },
      body: { branchId: BRANCH_B },
    });
    expect(run(guard, req).nextCalled).toBe(false);
  });

  it('allows a consistent branchId repeated across route, body and query', () => {
    const req = fakeRequest({
      user: branchAdminA,
      params: { branchId: BRANCH_A },
      body: { branchId: BRANCH_A },
      query: { branchId: BRANCH_A },
    });
    expect(run(guard, req).nextCalled).toBe(true);
  });

  it('requires a branchId from a Super Admin', () => {
    const { error } = run(guard, fakeRequest({ user: superAdmin }));
    expect((error as AppError).statusCode).toBe(400);
  });

  it('lets a Super Admin omit the branchId when the route allows it', () => {
    const globalGuard = requireBranchAccess({ allowGlobalAdminWithoutBranch: true });
    expect(run(globalGuard, fakeRequest({ user: superAdmin })).nextCalled).toBe(true);
  });

  it('refuses a branch-scoped account that somehow has no branch', () => {
    const orphan = { ...branchAdminA, branchId: null };
    const { error } = run(guard, fakeRequest({ user: orphan, params: { branchId: BRANCH_A } }));
    expect((error as AppError).statusCode).toBe(403);
  });
});

describe('authoritativeBranchId', () => {
  it('ignores client input for a branch-scoped account', () => {
    // The caller's own branch always wins over anything in the request.
    const req = fakeRequest({ user: branchAdminA, body: { branchId: BRANCH_B }, query: { branchId: BRANCH_B } });
    expect(authoritativeBranchId(req)).toBe(BRANCH_A);
  });

  it('returns the requested branch for a Super Admin', () => {
    const req = fakeRequest({ user: superAdmin, body: { branchId: BRANCH_B } });
    expect(authoritativeBranchId(req)).toBe(BRANCH_B);
  });

  it('rejects a Super Admin request with no branch at all', () => {
    expect(() => authoritativeBranchId(fakeRequest({ user: superAdmin }))).toThrow(AppError);
  });

  it('rejects conflicting branches from a Super Admin', () => {
    const req = fakeRequest({ user: superAdmin, body: { branchId: BRANCH_A }, query: { branchId: BRANCH_B } });
    expect(() => authoritativeBranchId(req)).toThrow(/Conflicting branchId/);
  });
});