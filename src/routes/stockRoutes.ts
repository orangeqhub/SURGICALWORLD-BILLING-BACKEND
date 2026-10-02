import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireBranchAccess, requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { PERMISSIONS } from '../constants/permissions';
import * as stockController from '../controllers/stockController';
import {
  batchQuerySchema,
  branchIdParamSchema,
  branchProductParamSchema,
  listStockQuerySchema,
  lowStockQuerySchema,
  movementQuerySchema,
  stockAdjustBodySchema,
  stockAdjustSchema,
  stockInitBodySchema,
  stockInitSchema,
  stockSetBodySchema,
  stockSetSchema,
} from '../validators/stockValidators';

/**
 * Stock routes.
 *
 * Endpoint paths are dictated by the existing frontend adapters, which were
 * read before these routes were written (see stockValidators.ts for the map).
 * Nothing here was invented to a different shape.
 *
 * READS require only a valid token: an EMPLOYEE must be able to see the catalog
 * and stock levels in order to sell, and branch scoping is enforced by
 * authoritativeBranchId inside the controller. WRITES require STOCK_ADJUST,
 * which SUPER_ADMIN and BRANCH_ADMIN hold implicitly (mirroring the frontend's
 * hasPermission) and an EMPLOYEE must hold explicitly.
 */

/** Mounted at /api/stock */
export const stockRoutes = Router();
stockRoutes.use(authenticate);

stockRoutes.get('/', validate({ query: listStockQuerySchema }), stockController.listAll);
stockRoutes.get('/low', validate({ query: lowStockQuerySchema }), stockController.listLow);
stockRoutes.get('/movements', validate({ query: movementQuerySchema }), stockController.listMovements);

stockRoutes.post(
  '/adjust',
  requirePermission(PERMISSIONS.STOCK_ADJUST),
  validate({ body: stockAdjustBodySchema }),
  stockController.adjustByBody,
);
stockRoutes.post(
  '/set',
  requirePermission(PERMISSIONS.STOCK_ADJUST),
  validate({ body: stockSetBodySchema }),
  stockController.setTotalByBody,
);
stockRoutes.post(
  '/init',
  requirePermission(PERMISSIONS.STOCK_ADJUST),
  validate({ body: stockInitBodySchema }),
  stockController.initialiseByBody,
);

/** Mounted at /api/batches */
export const batchRoutes = Router();
batchRoutes.use(authenticate);
batchRoutes.get('/', validate({ query: batchQuerySchema }), stockController.listBatches);

/**
 * Mounted into branchRoutes at /api/branches, so these resolve as
 * /api/branches/:branchId/...
 *
 * requireBranchAccess rejects a :branchId that disagrees with the token before
 * the handler runs, and authoritativeBranchId re-derives the branch inside the
 * controller - the route param is never trusted on its own.
 */
export const branchStockRoutes = Router();
branchStockRoutes.use(authenticate);

branchStockRoutes.get(
  '/:branchId/inventory',
  requireBranchAccess({ param: 'branchId' }),
  validate({ params: branchIdParamSchema, query: listStockQuerySchema }),
  stockController.listBranchInventory,
);

/** The frontend also calls /branches/:branchId/stock for the same data. */
branchStockRoutes.get(
  '/:branchId/stock',
  requireBranchAccess({ param: 'branchId' }),
  validate({ params: branchIdParamSchema, query: listStockQuerySchema }),
  stockController.listBranchInventory,
);

branchStockRoutes.get(
  '/:branchId/stock/:productId',
  requireBranchAccess({ param: 'branchId' }),
  validate({ params: branchProductParamSchema }),
  stockController.getOne,
);

branchStockRoutes.get(
  '/:branchId/stock-movements',
  requireBranchAccess({ param: 'branchId' }),
  validate({ params: branchIdParamSchema, query: movementQuerySchema }),
  stockController.listMovements,
);

branchStockRoutes.post(
  '/:branchId/stock-adjust',
  requirePermission(PERMISSIONS.STOCK_ADJUST),
  requireBranchAccess({ param: 'branchId' }),
  validate({ params: branchIdParamSchema, body: stockAdjustSchema }),
  stockController.adjust,
);

branchStockRoutes.post(
  '/:branchId/stock/init',
  requirePermission(PERMISSIONS.STOCK_ADJUST),
  requireBranchAccess({ param: 'branchId' }),
  validate({ params: branchIdParamSchema, body: stockInitSchema }),
  stockController.initialise,
);

branchStockRoutes.put(
  '/:branchId/stock',
  requirePermission(PERMISSIONS.STOCK_ADJUST),
  requireBranchAccess({ param: 'branchId' }),
  validate({ params: branchIdParamSchema, body: stockSetSchema }),
  stockController.setTotal,
);

export default stockRoutes;