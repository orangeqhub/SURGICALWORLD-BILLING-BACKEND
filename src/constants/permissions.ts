/**
 * Permission strings are a hard contract with the frontend. Source of truth:
 * frontend/src/constants/roles.js (PERMISSIONS).
 *
 * IMPORTANT - the frontend's hasPermission() (frontend/src/utils/permissions.js)
 * grants EVERY permission to SUPER_ADMIN and BRANCH_ADMIN unconditionally and
 * only reads user.permissions for EMPLOYEE. The backend mirrors that, with one
 * deliberate exception: transfer approval/rejection is SUPER_ADMIN-only,
 * matching the frontend's canApproveTransfers() and its explicit comment.
 */
export const PERMISSIONS = {
  BILLING: 'BILLING',
  HOLD_BILL: 'HOLD_BILL',
  RETURNS: 'RETURNS',
  CREDIT_SALE: 'CREDIT_SALE',
  STOCK_ADJUST: 'STOCK_ADJUST',
  EMPLOYEE_MANAGE: 'EMPLOYEE_MANAGE',
  BRANCH_MANAGE: 'BRANCH_MANAGE',
  ADMIN_MANAGE: 'ADMIN_MANAGE',
  PRODUCT_MASTER: 'PRODUCT_MASTER',
  TRANSFER_APPROVE: 'TRANSFER_APPROVE',
  GLOBAL_SETTINGS: 'GLOBAL_SETTINGS',
  GLOBAL_REPORTS: 'GLOBAL_REPORTS',
  CRM_MANAGE: 'CRM_MANAGE',
  LEDGER_VIEW: 'LEDGER_VIEW',
  PAYMENTS_MANAGE: 'PAYMENTS_MANAGE',
  RECEIPTS_MANAGE: 'RECEIPTS_MANAGE',
  PURCHASE_MANAGE: 'PURCHASE_MANAGE',
  SUPPLIER_MANAGE: 'SUPPLIER_MANAGE',
  EXPENSE_MANAGE: 'EXPENSE_MANAGE',
  REPORTS_VIEW: 'REPORTS_VIEW',
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',
  INVENTORY_VIEW: 'INVENTORY_VIEW',
  PRICE_EDIT: 'PRICE_EDIT',
  DISCOUNT_EDIT: 'DISCOUNT_EDIT',
  TRANSFER_CREATE: 'TRANSFER_CREATE',
  TRANSFER_VIEW: 'TRANSFER_VIEW',
  TRANSFER_DISPATCH: 'TRANSFER_DISPATCH',
  TRANSFER_RECEIVE: 'TRANSFER_RECEIVE',
  TARGET_MANAGE: 'TARGET_MANAGE',
  ATTENDANCE_MANAGE: 'ATTENDANCE_MANAGE',
  PAYROLL_MANAGE: 'PAYROLL_MANAGE',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Type guard: is this a real permission string? */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (ALL_PERMISSIONS as string[]).includes(value);
}