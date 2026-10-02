import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission, requireSuperAdmin } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  createTransferBodySchema,
  rejectTransferBodySchema,
  receiveTransferBodySchema,
  transferIdParamSchema,
  listTransfersQuerySchema,
} from '../validators/transferValidators';
import * as tc from '../controllers/transferController';

/**
 * Stock transfer routes.
 *
 * Authorization summary:
 *   POST   /               requirePermission(TRANSFER_CREATE) — create draft
 *   GET    /               requirePermission(TRANSFER_VIEW)   — list (branch-scoped)
 *   GET    /:id            requirePermission(TRANSFER_VIEW)   — detail
 *   PATCH  /:id/submit     requirePermission(TRANSFER_CREATE) — DRAFT→PENDING_APPROVAL
 *   PATCH  /:id/approve    requireSuperAdmin                  — PENDING_APPROVAL→APPROVED
 *   PATCH  /:id/reject     requireSuperAdmin                  — PENDING_APPROVAL→REJECTED
 *   PATCH  /:id/dispatch   requirePermission(TRANSFER_DISPATCH)
 *   PATCH  /:id/receive    requirePermission(TRANSFER_RECEIVE)
 *   PATCH  /:id/cancel     requirePermission(TRANSFER_CREATE)
 */
const router = Router();

router.use(authenticate);

router.post(
  '/',
  requirePermission('TRANSFER_CREATE'),
  validate({ body: createTransferBodySchema }),
  tc.create,
);

router.get(
  '/',
  requirePermission('TRANSFER_VIEW'),
  validate({ query: listTransfersQuerySchema }),
  tc.list,
);

router.get(
  '/:id',
  requirePermission('TRANSFER_VIEW'),
  validate({ params: transferIdParamSchema }),
  tc.getOne,
);

router.patch(
  '/:id/submit',
  requirePermission('TRANSFER_CREATE'),
  validate({ params: transferIdParamSchema }),
  tc.submit,
);

// Approve and reject are SUPER_ADMIN only — enforced by requireSuperAdmin here
// AND double-checked inside transferService.ts.
router.patch(
  '/:id/approve',
  requireSuperAdmin,
  validate({ params: transferIdParamSchema }),
  tc.approve,
);

router.patch(
  '/:id/reject',
  requireSuperAdmin,
  validate({ params: transferIdParamSchema, body: rejectTransferBodySchema }),
  tc.reject,
);

router.patch(
  '/:id/dispatch',
  requirePermission('TRANSFER_DISPATCH'),
  validate({ params: transferIdParamSchema }),
  tc.dispatch,
);

router.patch(
  '/:id/receive',
  requirePermission('TRANSFER_RECEIVE'),
  validate({ params: transferIdParamSchema, body: receiveTransferBodySchema }),
  tc.receive,
);

router.patch(
  '/:id/cancel',
  requirePermission('TRANSFER_CREATE'),
  validate({ params: transferIdParamSchema }),
  tc.cancel,
);

export default router;
