import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { PERMISSIONS } from '../constants/permissions';
import * as attendanceController from '../controllers/attendanceController';

const router = Router();
router.use(authenticate);

router.get('/today', attendanceController.getToday);
router.get('/summary', attendanceController.summary);
router.get('/', attendanceController.list);
router.post('/check-in', attendanceController.checkIn);
router.post('/check-out', attendanceController.checkOut);
router.post('/manual', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), attendanceController.manual);

export default router;
