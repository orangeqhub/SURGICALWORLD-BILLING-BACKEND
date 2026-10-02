import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireBranchAccess } from '../middleware/authorize';
import * as customerController from '../controllers/customerController';

const router = Router();
router.use(authenticate);

/** GET /customers/search?q= — branch-scoped search */
router.get('/search', customerController.search);

/** GET /customers — SA sees all (with branchId query), others see own branch */
router.get('/', customerController.list);

/** POST /customers — create */
router.post('/', customerController.create);

/** PUT /customers/:id — update */
router.put('/:id', customerController.update);

export default router;

/** Branch-scoped sub-router: GET /branches/:branchId/customers */
const branchRouter = Router({ mergeParams: true });
branchRouter.use(authenticate);
branchRouter.get('/:branchId/customers', requireBranchAccess({ param: 'branchId' }), customerController.list);

export { branchRouter as branchCustomerRoutes };
