import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { PERMISSIONS } from '../constants/permissions';
import * as productController from '../controllers/productController';
import {
  barcodeParamSchema,
  createProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  productStatusSchema,
  searchProductsQuerySchema,
  updateProductSchema,
} from '../validators/productValidators';

/**
 * Product Master routes, mounted at /api/products.
 *
 * ROUTE ORDER MATTERS: /search and /barcode/:barcode are declared before /:id,
 * otherwise Express would treat the literal "search" as a product UUID and
 * answer 400 for a perfectly valid search.
 *
 * PRODUCTS ARE GLOBAL - there is no branchId on any route, because the frontend
 * `products` table has no branch column and productMasterApi stores overrides
 * in a single global store. Stock is the per-branch layer.
 *
 * READS need only a token: an EMPLOYEE must see the catalog to sell from it.
 * WRITES require PRODUCT_MASTER, which SUPER_ADMIN/BRANCH_ADMIN hold implicitly
 * (mirroring the frontend's hasPermission) and an EMPLOYEE must hold explicitly.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listProductsQuerySchema }), productController.list);

router.get('/search', validate({ query: searchProductsQuerySchema }), productController.search);

router.get('/barcode/:barcode', validate({ params: barcodeParamSchema }), productController.getByBarcode);

router.get('/:id', validate({ params: productIdParamSchema }), productController.getOne);

router.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_MASTER),
  validate({ body: createProductSchema }),
  productController.create,
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCT_MASTER),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  productController.update,
);

router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.PRODUCT_MASTER),
  validate({ params: productIdParamSchema, body: productStatusSchema }),
  productController.setStatus,
);

/** DELETE deactivates; history is never destroyed (FKs are ON DELETE RESTRICT). */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCT_MASTER),
  validate({ params: productIdParamSchema }),
  productController.remove,
);

export default router;