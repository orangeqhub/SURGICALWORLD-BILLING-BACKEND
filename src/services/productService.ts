import { Op, type IncludeOptions, type WhereOptions } from 'sequelize';
import { AppError } from '../utils/AppError';
import { Decimal, toMoney, toPercent, toSqlDecimal, toJsonNumber, fromColumn } from '../utils/money';
import { BranchStock, Category, Product, StockMovement } from '../models';
import type { ListProductsQuery } from '../validators/productValidators';

/**
 * Product Master service.
 *
 * PRODUCTS ARE GLOBAL. This is derived from the frontend, not assumed:
 *   - frontend/src/database/schema.ts `products` has NO branch column
 *   - frontend/src/database/databaseTypes.ts ProductRow has NO branchId
 *   - productMasterApi.js keeps every product-profile override in ONE global
 *     AsyncStorage store keyed by productId, never per branch
 *   - the Phase 2 Product model therefore has no branchId either
 *
 * So there is no per-branch product ownership to enforce here, and no branchId
 * is accepted on create/update - accepting one would imply a scoping rule the
 * schema does not have. Branch isolation is enforced on STOCK (stockService.ts),
 * which is genuinely per-branch.
 *
 * Writes are gated by the PRODUCT_MASTER permission in the route layer.
 */

export interface ProductRecord {
  id: string;
  name: string;
  code: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  mrp: number;
  cutOffPrice: number;
  sellingPrice: number;
  purchasePrice: number;
  discountPercent: number;
  gst: number;
  unit: string;
  minStock: number;
  maxStock: number | null;
  batch: string | null;
  hsn: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  brand: string | null;
  subcategory: string | null;
  manufacturer: string | null;
  supplier: string | null;
  batchTrackingEnabled: boolean;
  expiryTrackingEnabled: boolean;
  status: 'Active' | 'Inactive';
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Money fields written to DECIMAL(14,2). */
const MONEY_FIELDS = ['mrp', 'cutOffPrice', 'sellingPrice', 'purchasePrice'] as const;
/** Percentage fields written to DECIMAL(5,2) with a 0..100 CHECK. */
const PERCENT_FIELDS = ['discountPercent', 'gst'] as const;

type MoneyField = (typeof MONEY_FIELDS)[number];
type PercentField = (typeof PERCENT_FIELDS)[number];

/**
 * DECIMAL columns must be bound as strings, otherwise pg/sequelize round-trip
 * money through a JS double. Every price/percentage write goes through here.
 */
function moneyValue(field: MoneyField, value: unknown): string {
  const parsed = toMoney(value);
  if (parsed === null) {
    throw AppError.badRequest(`${field} must be a valid non-negative decimal amount.`);
  }
  return toSqlDecimal(parsed);
}

function percentValue(field: PercentField, value: unknown): string {
  // toPercent returns null for out-of-range AND unparseable input, so this single
  // check rejects -1, 100.01, 101, NaN, Infinity and malformed decimals.
  const parsed = toPercent(value);
  if (parsed === null) {
    throw AppError.badRequest(`${field} must be a number between 0 and 100.`);
  }
  return toSqlDecimal(parsed);
}

/** Maps the model to the frontend's ProductRow shape (camelCase, numeric money). */
export function serializeProduct(product: Product): ProductRecord {
  const json = product.toJSON() as Omit<ProductRecord, 'sku' | 'category'> & { sku?: string };
  return {
    ...json,
    // The frontend column is `code`; productMasterApi exposes it as `sku`.
    // Both spellings are emitted so neither consumer has to know about the other.
    sku: json.code,
  };
}

/**
 * Pre-checks SKU uniqueness for a clean 409 message. The DB unique index is
 * still the real guarantee - this only converts the common case into a legible
 * error. A concurrent insert that slips past this check raises
 * SequelizeUniqueConstraintError, which errorHandler maps to 409.
 */
async function assertCodeAvailable(code: string, excludeId?: string): Promise<void> {
  const clash = await Product.findOne({
    where: { code, ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) },
    attributes: ['id'],
  });
  if (clash) throw AppError.conflict('A product with this SKU (code) already exists.');
}

async function assertBarcodeAvailable(barcode: string, excludeId?: string): Promise<void> {
  const clash = await Product.findOne({
    where: { barcode, ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) },
    attributes: ['id'],
  });
  if (clash) throw AppError.conflict('A product with this barcode already exists.');
}

async function assertCategoryExists(categoryId: string | null | undefined): Promise<void> {
  if (categoryId === null || categoryId === undefined) return;
  const category = await Category.findByPk(categoryId, { attributes: ['id'] });
  if (!category) throw AppError.badRequest('The specified category does not exist.');
}

const PRODUCT_INCLUDE: IncludeOptions[] = [{ model: Category, as: 'category', attributes: ['id', 'name'] }];

/**
 * Builds the shared WHERE clause for list/count/search.
 *
 * The text filter matches name / code (SKU) / barcode / brand, mirroring the
 * frontend's own search (searchProducts in productRepository matches
 * name OR code OR barcode, and ProductManager additionally filters brand).
 */
function buildProductWhere(query: ListProductsQuery): WhereOptions {
  const where: WhereOptions = {};

  const text = query.q ?? query.search;
  if (text && text.trim()) {
    const like = { [Op.iLike]: `%${text.trim()}%` };
    // Op.or is a symbol key, so the OR group is assigned through a typed alias
    // rather than an index signature.
    const orGroup = [{ name: like }, { code: like }, { barcode: like }, { brand: like }];
    (where as Record<symbol, unknown>)[Op.or] = orGroup;
  }
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.brand) where.brand = query.brand;

  if (query.status) {
    where.status = query.status;
  } else if (!query.includeInactive) {
    // Product Manager's default list shows Active products only.
    where.status = 'Active';
  }

  return where;
}

export async function listProducts(query: ListProductsQuery = {} as ListProductsQuery): Promise<Product[]> {
  return Product.findAll({
    where: buildProductWhere(query),
    include: PRODUCT_INCLUDE,
    order: [['name', 'ASC']],
    limit: query.limit,
    offset: query.offset,
  });
}

export async function countProducts(query: ListProductsQuery = {} as ListProductsQuery): Promise<number> {
  return Product.count({ where: buildProductWhere(query) });
}

export async function searchProducts(q: string, limit = 50): Promise<Product[]> {
  const term = q.trim();
  if (!term) return [];
  return Product.findAll({
    where: buildProductWhere({ q: term } as ListProductsQuery),
    include: PRODUCT_INCLUDE,
    order: [['name', 'ASC']],
    limit,
  });
}

export async function getProductOrThrow(id: string): Promise<Product> {
  const product = await Product.findByPk(id, { include: PRODUCT_INCLUDE });
  if (!product) throw AppError.notFound('Product not found.');
  return product;
}

/** Barcode scanner lookup used by the billing screen (frontend fetchProductByBarcode). */
export async function findByBarcode(barcode: string): Promise<Product | null> {
  return Product.findOne({ where: { barcode }, include: PRODUCT_INCLUDE });
}

/**
 * Creates a product. Money and percentages are re-parsed here (the Zod schema
 * only bounds the shape) so a value that survived validation but is not a
 * representable decimal still fails with a clean 400.
 */
export async function createProduct(input: Record<string, unknown>): Promise<Product> {
  const code = String(input.code).trim();
  const barcode = input.barcode === undefined ? undefined : ((input.barcode as string | null)?.trim() || null);

  await assertCodeAvailable(code);
  if (barcode) await assertBarcodeAvailable(barcode);
  await assertCategoryExists(input.categoryId as string | null | undefined);

  const values: Record<string, unknown> = {
    name: String(input.name).trim(),
    code,
    barcode: barcode ?? null,
    categoryId: (input.categoryId as string | null | undefined) ?? null,
    unit: input.unit !== undefined ? String(input.unit).trim() : 'Pcs',
    status: input.status ?? 'Active',
    minStock: input.minStock !== undefined ? (input.minStock as number) : 0,
    maxStock: (input.maxStock as number | null | undefined) ?? null,
    batch: (input.batch as string | null | undefined) ?? null,
    hsn: (input.hsn as string | null | undefined) ?? null,
    mfgDate: (input.mfgDate as string | null | undefined) ?? null,
    expiryDate: (input.expiryDate as string | null | undefined) ?? null,
    brand: (input.brand as string | null | undefined) ?? null,
    subcategory: (input.subcategory as string | null | undefined) ?? null,
    manufacturer: (input.manufacturer as string | null | undefined) ?? null,
    supplier: (input.supplier as string | null | undefined) ?? null,
    batchTrackingEnabled: input.batchTrackingEnabled !== undefined ? Boolean(input.batchTrackingEnabled) : true,
    expiryTrackingEnabled: input.expiryTrackingEnabled !== undefined ? Boolean(input.expiryTrackingEnabled) : true,
    remarks: (input.remarks as string | null | undefined) ?? null,
  };

  for (const field of MONEY_FIELDS) {
    values[field] = moneyValue(field, input[field] !== undefined ? input[field] : 0);
  }
  values.discountPercent = percentValue('discountPercent', input.discountPercent !== undefined ? input.discountPercent : 0);
  values.gst = percentValue('gst', input.gst !== undefined ? input.gst : 0);

  return Product.create(values);
}

/**
 * Partial update.
 *
 * Only keys actually present in the patch are written. This is what stops an
 * omitted `discountPercent` from being reset to 0: the attribute is never
 * mentioned, so Sequelize leaves the stored value untouched.
 */
export async function updateProduct(id: string, patch: Record<string, unknown>): Promise<Product> {
  const product = await getProductOrThrow(id);
  const values: Record<string, unknown> = {};

  if (patch.name !== undefined) values.name = String(patch.name).trim();

  if (patch.code !== undefined) {
    const code = String(patch.code).trim();
    if (code !== product.code) await assertCodeAvailable(code, id);
    values.code = code;
  }

  if (patch.barcode !== undefined) {
    const barcode = patch.barcode === null ? null : (String(patch.barcode).trim() || null);
    if (barcode && barcode !== product.barcode) await assertBarcodeAvailable(barcode, id);
    values.barcode = barcode;
  }

  if (patch.categoryId !== undefined) {
    await assertCategoryExists(patch.categoryId as string | null);
    values.categoryId = patch.categoryId;
  }

  if (patch.unit !== undefined) values.unit = String(patch.unit).trim();
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.minStock !== undefined) values.minStock = patch.minStock;
  if (patch.maxStock !== undefined) values.maxStock = patch.maxStock;
  if (patch.batch !== undefined) values.batch = patch.batch;
  if (patch.hsn !== undefined) values.hsn = patch.hsn;
  if (patch.mfgDate !== undefined) values.mfgDate = patch.mfgDate;
  if (patch.expiryDate !== undefined) values.expiryDate = patch.expiryDate;
  if (patch.brand !== undefined) values.brand = patch.brand;
  if (patch.subcategory !== undefined) values.subcategory = patch.subcategory;
  if (patch.manufacturer !== undefined) values.manufacturer = patch.manufacturer;
  if (patch.supplier !== undefined) values.supplier = patch.supplier;
  if (patch.batchTrackingEnabled !== undefined) values.batchTrackingEnabled = Boolean(patch.batchTrackingEnabled);
  if (patch.expiryTrackingEnabled !== undefined) values.expiryTrackingEnabled = Boolean(patch.expiryTrackingEnabled);
  if (patch.remarks !== undefined) values.remarks = patch.remarks;

  for (const field of MONEY_FIELDS) {
    if (patch[field] !== undefined) values[field] = moneyValue(field, patch[field]);
  }
  for (const field of PERCENT_FIELDS) {
    if (patch[field] !== undefined) values[field] = percentValue(field, patch[field]);
  }

  await product.update(values);
  return getProductOrThrow(id);
}

/**
 * Deactivation instead of deletion.
 *
 * The frontend uses an Active/Inactive `status` (productMasterApi.setProductStatus,
 * ProductManager's Deactivate/Activate buttons), and a product is permanently
 * referenced by branch_stock, stock_movements and (from Phase 5) invoice_items -
 * all FKs are ON DELETE RESTRICT, so a hard DELETE would 409 anyway. Deactivating
 * keeps history readable, which is the requirement.
 */
export async function setProductStatus(id: string, status: 'Active' | 'Inactive'): Promise<Product> {
  const product = await getProductOrThrow(id);
  await product.update({ status });
  return getProductOrThrow(id);
}

/**
 * DELETE /products/:id maps to deactivation.
 *
 * A product is never physically removed while stock or movement rows reference
 * it. Callers get a clear 409 instead of a raw FK violation.
 */
export async function deactivateProduct(id: string): Promise<Product> {
  const product = await getProductOrThrow(id);
  const [stockRows, movementRows] = await Promise.all([
    BranchStock.count({ where: { productId: id } }),
    StockMovement.count({ where: { productId: id } }),
  ]);

  if (product.status === 'Inactive' && stockRows === 0 && movementRows === 0) {
    throw AppError.conflict(
      'This product is already deactivated. It is retained permanently because stock history references it.',
    );
  }

  await product.update({ status: 'Inactive' });
  return getProductOrThrow(id);
}

/** Categories for the Product Master dropdown (frontend GET /categories). */
export async function listCategories(q?: string): Promise<Category[]> {
  const where: WhereOptions = {};
  if (q && q.trim()) where.name = { [Op.iLike]: `%${q.trim()}%` };
  return Category.findAll({ where, order: [['name', 'ASC']] });
}

/**
 * Product + per-branch stock rows, so a stock screen can render without an N+1
 * follow-up request. `branchStock` is keyed by branchId.
 */
export async function listWithStock(branchId: string, includeInactive = false): Promise<Array<{ product: Product; stock: BranchStock | null }>> {
  const products = await Product.findAll({
    where: includeInactive ? {} : { status: 'Active' },
    order: [['name', 'ASC']],
  });
  const stocks = await BranchStock.findAll({ where: { branchId } });
  const byProduct = new Map(stocks.map((s) => [s.productId, s]));
  return products.map((product) => ({ product, stock: byProduct.get(product.id) ?? null }));
}

export { Decimal, fromColumn, toJsonNumber };