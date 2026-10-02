import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { PERMISSIONS } from '../constants/permissions';
import * as crmController from '../controllers/crmController';

/** Customer notes — mounted under /customers/:customerId */
export const customerNoteRoutes = Router({ mergeParams: true });
customerNoteRoutes.use(authenticate);
customerNoteRoutes.get('/:customerId/notes', crmController.listNotes);
customerNoteRoutes.post('/:customerId/notes', requirePermission(PERMISSIONS.CRM_MANAGE), crmController.createNote);

/** Follow-up routes — mounted at /crm */
const router = Router();
router.use(authenticate);
router.get('/follow-ups/counts', crmController.getFollowUpCounts);
router.get('/follow-ups', crmController.listFollowUps);
router.post('/follow-ups', requirePermission(PERMISSIONS.CRM_MANAGE), crmController.createFollowUp);
router.put('/follow-ups/:id', requirePermission(PERMISSIONS.CRM_MANAGE), crmController.updateFollowUp);
router.put('/follow-ups/:id/complete', requirePermission(PERMISSIONS.CRM_MANAGE), crmController.completeFollowUp);
router.put('/follow-ups/:id/cancel', requirePermission(PERMISSIONS.CRM_MANAGE), crmController.cancelFollowUp);
router.put('/follow-ups/:id/reschedule', requirePermission(PERMISSIONS.CRM_MANAGE), crmController.rescheduleFollowUp);

export default router;
