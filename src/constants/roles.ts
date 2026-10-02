/**
 * Role values are a hard contract with the frontend. Source of truth:
 * frontend/src/constants/roles.js (ROLES) and
 * frontend/src/database/databaseTypes.ts (VerifiedUserRow.role).
 *
 * The frontend uses exactly these three values. CUSTOMER / AGENT /
 * SALES_MEMBER are NOT roles in this system - do not add them.
 */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  BRANCH_ADMIN: 'BRANCH_ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

/** Type guard: is this string one of the three real roles? */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}

/** Roles permitted to approve or reject a stock transfer. */
export const TRANSFER_APPROVER_ROLES: Role[] = [ROLES.SUPER_ADMIN];

/** Roles permitted to create a manual ledger entry. */
export const MANUAL_LEDGER_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN];