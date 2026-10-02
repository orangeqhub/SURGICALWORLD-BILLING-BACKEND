import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import * as productController from '../controllers/productController';
import {
  categoryIdParamSchema,
  listCategoriesQuerySchema,
} from '../validators/productValidators';

/**
 * Category routes, mounted at /api/categories.
 *
 * The frontend calls GET /categories (productApi.fetchCategories) to populate
 * the Product Master category dropdown. Categories are read-only in Phase 4:
 * category administration was not requested and the frontend manages categories
 * through its own constants, so exposing writes here would invent scope.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listCategoriesQuerySchema }), productController.listCategories);
router.get('/:id', validate({ params: categoryIdParamSchema }), productController.getCategory);

export default router;