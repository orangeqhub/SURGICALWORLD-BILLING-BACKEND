import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireBranchAccess, requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { PERMISSIONS } from '../constants/permissions';
import * as purchaseController from '../controllers/purchaseController';
import {
  createPurchaseBodySchema,
  listPurchasesQuerySchema,
  branchIdParamSchema,
  purchaseIdentifierParamSchema,
} from '../validators/purchaseValidators';

/**
 * Mounted at /api/purchases — POST /purchases, GET /purchases/:id/items.
 */
const purchaseRoutes = Router();
purchaseRoutes.use(authenticate);

purchaseRoutes.post(
  '/',
  requirePermission(PERMISSIONS.PURCHASE_MANAGE),
  validate({ body: createPurchaseBodySchema }),
  purchaseController.create,
);

purchaseRoutes.get(
  '/:id/items',
  validate({ params: purchaseIdentifierParamSchema }),
  purchaseController.getItems,
);

export default purchaseRoutes;

/**
 * Mounted inside branchRoutes at /api/branches — GET /branches/:branchId/purchases.
 */
export const branchPurchaseRoutes = Router();
branchPurchaseRoutes.use(authenticate);

branchPurchaseRoutes.get(
  '/:branchId/purchases',
  requireBranchAccess({ param: 'branchId' }),
  validate({ params: branchIdParamSchema, query: listPurchasesQuerySchema }),
  purchaseController.listForBranch,
);
