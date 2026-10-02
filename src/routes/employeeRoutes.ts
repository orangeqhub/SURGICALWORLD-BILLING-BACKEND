import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireBranchAccess } from '../middleware/authorize';
import * as employeeController from '../controllers/employeeController';

const router = Router();
router.use(authenticate);

/** GET /employees */
router.get('/', employeeController.list);

/** POST /employees */
router.post('/', employeeController.create);

/** PUT /employees/:id/status */
router.put('/:id/status', employeeController.updateStatus);

/** GET /branch-admins */
export const branchAdminRouter = Router();
branchAdminRouter.use(authenticate);
branchAdminRouter.get('/', employeeController.listAdmins);

export default router;

/** Branch-scoped sub-router: GET /branches/:branchId/employees */
const branchRouter = Router({ mergeParams: true });
branchRouter.use(authenticate);
branchRouter.get('/:branchId/employees', requireBranchAccess({ param: 'branchId' }), employeeController.list);

export { branchRouter as branchEmployeeRoutes };
