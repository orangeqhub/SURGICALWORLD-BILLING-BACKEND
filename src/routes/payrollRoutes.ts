import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { PERMISSIONS } from '../constants/permissions';
import * as payrollController from '../controllers/payrollController';

const router = Router();
router.use(authenticate);

router.get('/', payrollController.list);
router.post('/generate', requirePermission(PERMISSIONS.PAYROLL_MANAGE), payrollController.generate);
router.get('/:employeeId/:month', payrollController.getRecord);
router.put('/:id/mark-paid', requirePermission(PERMISSIONS.PAYROLL_MANAGE), payrollController.markPaid);
router.put('/:id', requirePermission(PERMISSIONS.PAYROLL_MANAGE), payrollController.edit);

export default router;
