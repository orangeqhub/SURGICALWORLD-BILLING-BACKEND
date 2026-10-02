import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireBranchAccess, requireRole } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import * as authController from '../controllers/authController';
import { branchStockRoutes } from './stockRoutes';
import { branchPurchaseRoutes } from './purchaseRoutes';
import { branchCustomerRoutes } from './customerRoutes';
import { branchSupplierRoutes } from './supplierRoutes';
import { branchEmployeeRoutes } from './employeeRoutes';
import { branchOperationsRoutes } from './operationsRoutes';
import { ROLES } from '../constants/roles';

const router = Router();

router.use(authenticate);

/**
 * Per-branch stock sub-resources (/api/branches/:branchId/inventory, /stock,
 * /stock-movements, /stock-adjust, ...). Declared BEFORE the /:branchId
 * catch-all below so the more specific paths always win. See stockRoutes.ts.
 */
router.use(branchStockRoutes);
router.use(branchPurchaseRoutes);
router.use(branchCustomerRoutes);
router.use(branchSupplierRoutes);
router.use(branchEmployeeRoutes);
router.use(branchOperationsRoutes);

const updateSchema = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1).max(150).optional(),
  address: z.string().max(2000).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  gst: z.string().max(50).optional().nullable(),
  manager: z.string().max(150).optional().nullable(),
  opening: z.string().max(20).optional().nullable(),
  closing: z.string().max(20).optional().nullable(),
  status: z.enum(['Active', 'Inactive']).optional(),
});

const createSchema = updateSchema.extend({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
});

/** SUPER_ADMIN sees every branch; BRANCH_ADMIN/EMPLOYEE see only their own. */
router.get('/', authController.listBranches);

/**
 * Branch isolation: a BRANCH_ADMIN or EMPLOYEE requesting another branch's
 * record is rejected with 403 by requireBranchAccess before the handler runs.
 * SUPER_ADMIN passes regardless of the id.
 */
router.get('/:branchId', requireBranchAccess({ param: 'branchId' }), authController.getBranch);

/** Creating and mutating branches is Super Admin only. */
router.post('/', requireRole(ROLES.SUPER_ADMIN), validate({ body: createSchema }), authController.createBranch);
router.put('/:branchId', requireRole(ROLES.SUPER_ADMIN), validate({ body: updateSchema }), authController.updateBranch);

export default router;