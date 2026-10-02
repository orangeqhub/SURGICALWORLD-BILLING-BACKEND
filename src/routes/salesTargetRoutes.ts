import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { PERMISSIONS } from '../constants/permissions';
import * as salesTargetController from '../controllers/salesTargetController';

const router = Router();
router.use(authenticate);

router.get('/', salesTargetController.list);
router.post('/', requirePermission(PERMISSIONS.TARGET_MANAGE), salesTargetController.create);
router.put('/:id/cancel', requirePermission(PERMISSIONS.TARGET_MANAGE), salesTargetController.cancel);
router.put('/:id', requirePermission(PERMISSIONS.TARGET_MANAGE), salesTargetController.update);

export default router;
