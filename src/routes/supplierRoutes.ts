import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireBranchAccess, requirePermission } from '../middleware/authorize';
import { PERMISSIONS } from '../constants/permissions';
import * as supplierController from '../controllers/supplierController';

const router = Router();
router.use(authenticate);

/** GET /suppliers?branchId= */
router.get('/', requireBranchAccess({ allowGlobalAdminWithoutBranch: true }), supplierController.list);

/** POST /suppliers */
router.post('/', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), supplierController.create);

/** PUT /suppliers/:id */
router.put('/:id', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), supplierController.update);

export default router;

/** Branch-scoped sub-router: GET /branches/:branchId/suppliers */
const branchRouter = Router({ mergeParams: true });
branchRouter.use(authenticate);
branchRouter.get('/:branchId/suppliers', requireBranchAccess({ param: 'branchId' }), supplierController.list);

export { branchRouter as branchSupplierRoutes };
