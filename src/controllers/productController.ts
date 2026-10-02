import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import * as productService from '../services/productService';
import type { ListProductsQuery } from '../validators/productValidators';

/**
 * Product Master controller.
 *
 * Thin by design: no business logic lives here.
 *
 * NOTE: values are READ, never re-parsed. The route's `validate()` middleware
 * already ran the Zod schema and REPLACED req.params/req.query/req.body with the
 * parsed result (see middleware/validate.ts). Re-parsing here would apply the
 * same schema twice - and would fail, because a schema that transforms
 * `?includeInactive=true` into boolean `true` cannot parse boolean `true` again.
 * So the handlers cast to the schema's inferred type and trust the middleware.
 */

/** Reads a validated :id param. */
function id(req: Request): string {
  return req.params.id as string;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListProductsQuery;
  const [products, total] = await Promise.all([
    productService.listProducts(query),
    productService.countProducts(query),
  ]);
  res.status(200).json({
    success: true,
    data: products.map(productService.serializeProduct),
    meta: { total, count: products.length, limit: query.limit ?? null, offset: query.offset ?? 0 },
  });
});

/** GET /products/search?q= - the frontend's fetchProductsBySearch contract. */
export const search = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as { q?: string; limit?: number };
  const products = await productService.searchProducts(query.q ?? '', query.limit ?? 50);
  res.status(200).json({ success: true, data: products.map(productService.serializeProduct) });
});

/** GET /products/barcode/:barcode - the billing scanner contract. */
export const getByBarcode = asyncHandler(async (req: Request, res: Response) => {
  const barcode = req.params.barcode as string;
  const product = await productService.findByBarcode(barcode);
  if (!product) throw AppError.notFound('No product matches that barcode.');
  res.status(200).json({ success: true, data: productService.serializeProduct(product) });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProductOrThrow(id(req));
  res.status(200).json({ success: true, data: productService.serializeProduct(product) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.createProduct(req.body as Record<string, unknown>);
  res.status(201).json({ success: true, data: productService.serializeProduct(product) });
});

/**
 * PUT /products/:id. Only the supplied keys are written, so an omitted
 * discountPercent keeps its stored value instead of resetting to 0.
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.updateProduct(id(req), req.body as Record<string, unknown>);
  res.status(200).json({ success: true, data: productService.serializeProduct(product) });
});

/** PATCH /products/:id/status - Product Manager's Deactivate/Activate action. */
export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: 'Active' | 'Inactive' };
  const product = await productService.setProductStatus(id(req), status);
  res.status(200).json({ success: true, data: productService.serializeProduct(product) });
});

/** DELETE /products/:id - deactivates rather than destroying history. */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.deactivateProduct(id(req));
  res.status(200).json({
    success: true,
    data: productService.serializeProduct(product),
    message: 'Product deactivated. Historical stock and billing references are retained.',
  });
});

/** GET /categories - the Product Master category dropdown. */
export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as { q?: string };
  const categories = await productService.listCategories(query.q);
  res.status(200).json({
    success: true,
    data: categories.map((c) => ({ id: c.id, name: c.name })),
  });
});

export const getCategory = asyncHandler(async (req: Request, res: Response) => {
  const categoryId = req.params.id as string;
  const categories = await productService.listCategories();
  const category = categories.find((c) => c.id === categoryId);
  if (!category) throw AppError.notFound('Category not found.');
  res.status(200).json({ success: true, data: { id: category.id, name: category.name } });
});

export default {
  list,
  search,
  getByBarcode,
  getOne,
  create,
  update,
  setStatus,
  remove,
  listCategories,
  getCategory,
};
