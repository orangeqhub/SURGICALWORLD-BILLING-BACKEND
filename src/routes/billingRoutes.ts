import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireBranchAccess, requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { PERMISSIONS } from '../constants/permissions';
import * as billingController from '../controllers/billingController';
import {
  createInvoiceBodySchema,
  listInvoicesQuerySchema,
  invoiceIdParamSchema,
} from '../validators/billingValidators';

/**
 * Billing routes — mounted at /api/invoices.
 *
 * POST /api/invoices        — create invoice (atomic: calc + stock deduct + persist)
 * GET  /api/invoices        — list branch invoices (branch-scoped)
 * GET  /api/invoices/:id    — single invoice with items + payments
 *
 * Permissions mirror the frontend's hasPermission(user, PERMISSIONS.BILLING):
 *   SUPER_ADMIN and BRANCH_ADMIN always pass.
 *   EMPLOYEE needs the BILLING permission explicitly.
 */
const billingRoutes = Router();
billingRoutes.use(authenticate);

billingRoutes.post(
  '/',
  requirePermission(PERMISSIONS.BILLING),
  requireBranchAccess({ allowGlobalAdminWithoutBranch: false }),
  validate({ body: createInvoiceBodySchema }),
  billingController.create,
);

billingRoutes.get(
  '/',
  requireBranchAccess({ allowGlobalAdminWithoutBranch: true }),
  validate({ query: listInvoicesQuerySchema }),
  billingController.list,
);

billingRoutes.get(
  '/:id',
  requireBranchAccess({ allowGlobalAdminWithoutBranch: true }),
  validate({ params: invoiceIdParamSchema }),
  billingController.getOne,
);

export default billingRoutes;
