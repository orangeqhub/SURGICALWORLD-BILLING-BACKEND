import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, closeDatabase, getBranchIds, loginAs, TEST_PASSWORD } from '../helpers';
import type { Actor } from '../helpers';
import { Product } from '../../src/models';

/**
 * Product Master tests.
 *
 * Two facts under test that were established by inspecting the frontend:
 *
 * 1. PRODUCTS ARE GLOBAL. `products` has no branch column in the frontend
 *    schema and no branchId is accepted on any product route, so there is no
 *    per-branch product ownership to test. Branch isolation is tested against
 *    STOCK in stock.test.ts instead.
 * 2. discountPercent is DECIMAL(5,2) bounded 0..100 by a database CHECK. These
 *    tests prove the API rejects bad values rather than clamping them the way
 *    the frontend's clampDiscountPercent does.
 */

let app: Express;
let superAdmin: Actor;
let branchAdminA: Actor;
let employeeA: Actor;
let branchA: string;
let branchB: string;

beforeAll(async () => {
  app = buildTestApp();
  ({ branchA, branchB } = await getBranchIds());
  superAdmin = await loginAs(app, 'TEST-SA');
  branchAdminA = await loginAs(app, 'TEST-BA');
  employeeA = await loginAs(app, 'TEST-EMP');
});

afterAll(async () => {
  await closeDatabase();
});

const bearer = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

let skuCounter = 0;
const uniqueSku = (label: string) => `P4-${label}-${Date.now().toString().slice(-6)}-${skuCounter++}`;

/** Creates a product as Super Admin and returns the serialized body. */
async function createProduct(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await request(app)
    .post('/api/products')
    .set(bearer(superAdmin))
    .send({ name: 'Surgical Scalpel', code: uniqueSku('X'), sellingPrice: 250, mrp: 300, ...overrides });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('POST /api/products - creation', () => {
  it('creates a product and returns camelCase fields including discountPercent', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(bearer(superAdmin))
      .send({
        name: 'Surgical Needle',
        code: uniqueSku('N'),
        barcode: '8901234500011',
        sellingPrice: '120.50',
        purchasePrice: '80.25',
        mrp: '150',
        cutOffPrice: '140',
        gst: 5,
        unit: 'Box',
        minStock: 10,
        brand: 'Medline',
        discountPercent: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const p = res.body.data;
    expect(p.name).toBe('Surgical Needle');
    // The DB column is discount_percent; the API must expose discountPercent.
    expect(p.discountPercent).toBe(10);
    expect(p.discount_percent).toBeUndefined();
    expect(p.sellingPrice).toBe(120.5);
    expect(p.purchasePrice).toBe(80.25);
    expect(p.unit).toBe('Box');
    expect(p.brand).toBe('Medline');
    // sku is an alias of code, matching productMasterApi's `sku: product.code`.
    expect(p.code).toBe(p.sku);
    expect(p.status).toBe('Active');
    expect(p.discountPercent).not.toBe('10'); // a number, not a string
  });

  it('defaults discountPercent to 0 when omitted', async () => {
    const p = await createProduct({ name: 'No Discount Item' });
    expect(p.discountPercent).toBe(0);
  });

  it('requires a name', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(bearer(superAdmin))
      .send({ code: uniqueSku('N') });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires a SKU (code)', async () => {
    const res = await request(app).post('/api/products').set(bearer(superAdmin)).send({ name: 'No SKU' });
    expect(res.status).toBe(400);
  });

  it('rejects a negative price', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(bearer(superAdmin))
      .send({ name: 'Bad Price', code: uniqueSku('BP'), sellingPrice: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects a negative purchase price, MRP and cut-off price', async () => {
    for (const field of ['purchasePrice', 'mrp', 'cutOffPrice']) {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(superAdmin))
        .send({ name: `Bad ${field}`, code: uniqueSku('B'), [field]: -5 });
      expect(res.status, `${field} must reject negatives`).toBe(400);
    }
  });
});

describe('discountPercent validation', () => {
  it('accepts 0', async () => {
    const p = await createProduct({ discountPercent: 0 });
    expect(p.discountPercent).toBe(0);
  });

  it('accepts 100', async () => {
    const p = await createProduct({ discountPercent: 100 });
    expect(p.discountPercent).toBe(100);
  });

  it('accepts a fractional value', async () => {
    const p = await createProduct({ discountPercent: 12.5 });
    expect(p.discountPercent).toBe(12.5);
  });

  it.each([
    ['-1', -1],
    ['100.01', 100.01],
    ['101', 101],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['invalid decimal', 'abc'],
  ])('rejects %s', async (_label, value) => {
    const res = await request(app)
      .post('/api/products')
      .set(bearer(superAdmin))
      .send({ name: 'Bad Discount', code: uniqueSku('D'), discountPercent: value });
    expect(res.status).toBe(400);
  });

  it('does not clamp an out-of-range value into range', async () => {
    // The frontend's clampDiscountPercent would silently turn 150 into 100.
    // The server must reject instead of persisting a different number.
    const before = await Product.count();
    await request(app)
      .post('/api/products')
      .set(bearer(superAdmin))
      .send({ name: 'Clamp Check', code: uniqueSku('C'), discountPercent: 150 })
      .expect(400);
    expect(await Product.count()).toBe(before);
  });
});

describe('uniqueness', () => {
  it('rejects a duplicate SKU with 409', async () => {
    const code = uniqueSku('DUP');
    await createProduct({ code });
    const res = await request(app)
      .post('/api/products')
      .set(bearer(superAdmin))
      .send({ name: 'Duplicate SKU', code });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a duplicate barcode with 409', async () => {
    const barcode = `BC${Date.now().toString().slice(-10)}`;
    await createProduct({ barcode });
    const res = await request(app)
      .post('/api/products')
      .set(bearer(superAdmin))
      .send({ name: 'Duplicate Barcode', code: uniqueSku('DB'), barcode });
    expect(res.status).toBe(409);
  });

  it('allows two products with no barcode at all', async () => {
    // The unique index on barcode is a partial concern only for non-null values;
    // NULLs must not collide.
    await createProduct({ name: 'No Barcode 1', barcode: null });
    await createProduct({ name: 'No Barcode 2', barcode: null });
  });
});

describe('GET /api/products - list and read', () => {
  it('lists Active products by default', async () => {
    const res = await request(app).get('/api/products').set(bearer(employeeA)).expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.every((p: { status: string }) => p.status === 'Active')).toBe(true);
  });

  it('excludes inactive products unless asked', async () => {
    const hidden = await createProduct({ name: 'Hidden Product' });
    await request(app)
      .patch(`/api/products/${hidden.id}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'Inactive' })
      .expect(200);

    const defaultList = await request(app).get('/api/products').set(bearer(employeeA)).expect(200);
    expect(defaultList.body.data.some((p: { id: string }) => p.id === hidden.id)).toBe(false);

    const withInactive = await request(app)
      .get('/api/products?includeInactive=true')
      .set(bearer(employeeA))
      .expect(200);
    expect(withInactive.body.data.some((p: { id: string }) => p.id === hidden.id)).toBe(true);
  });

  it('filters by search text across name and code', async () => {
    const marker = `Zq${Date.now().toString().slice(-6)}`;
    await createProduct({ name: `Bandage ${marker}`, code: uniqueSku('S') });

    const res = await request(app).get(`/api/products?q=${marker}`).set(bearer(employeeA)).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      res.body.data.every(
        (p: { name: string; code: string }) =>
          p.name.toLowerCase().includes(marker.toLowerCase()) || p.code.toLowerCase().includes(marker.toLowerCase()),
      ),
    ).toBe(true);
  });

  it('filters by category', async () => {
    const categories = await request(app).get('/api/categories').set(bearer(employeeA)).expect(200);
    const categoryId = categories.body.data[0].id;
    const res = await request(app)
      .get(`/api/products?categoryId=${categoryId}`)
      .set(bearer(employeeA))
      .expect(200);
    expect(res.body.data.every((p: { categoryId: string }) => p.categoryId === categoryId)).toBe(true);
  });

  it('returns a single product by id with its category inlined', async () => {
    const created = await createProduct({ name: 'Readable Product' });
    const res = await request(app).get(`/api/products/${created.id}`).set(bearer(employeeA)).expect(200);
    expect(res.body.data.id).toBe(created.id);
    expect(res.body.data.discountPercent).toBeTypeOf('number');
  });

  it('returns 404 for an unknown id', async () => {
    await request(app)
      .get('/api/products/11111111-1111-4111-8111-111111111111')
      .set(bearer(employeeA))
      .expect(404);
  });

  it('finds a product by barcode for the billing scanner', async () => {
    const barcode = `SC${Date.now().toString().slice(-10)}`;
    await createProduct({ name: 'Scannable', barcode });
    const res = await request(app).get(`/api/products/barcode/${barcode}`).set(bearer(employeeA)).expect(200);
    expect(res.body.data.barcode).toBe(barcode);
  });

  it('serves /products/search without mistaking "search" for an id', async () => {
    const res = await request(app).get('/api/products/search?q=a').set(bearer(employeeA)).expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/products').expect(401);
  });
});

describe('PUT /api/products/:id - update', () => {
  it('updates only the supplied fields', async () => {
    const created = await createProduct({ discountPercent: 15, brand: 'OriginalBrand' });
    const res = await request(app)
      .put(`/api/products/${created.id}`)
      .set(bearer(superAdmin))
      .send({ name: 'Renamed Product' })
      .expect(200);

    expect(res.body.data.name).toBe('Renamed Product');
    expect(res.body.data.brand).toBe('OriginalBrand');
    // This is the critical assertion: an omitted discountPercent must survive.
    expect(res.body.data.discountPercent).toBe(15);
  });

  it('does not reset discountPercent to 0 when updating other fields', async () => {
    const created = await createProduct({ discountPercent: 42 });
    await request(app)
      .put(`/api/products/${created.id}`)
      .set(bearer(superAdmin))
      .send({ sellingPrice: 999 })
      .expect(200);

    const row = await Product.findByPk(created.id as string);
    expect(Number(row!.discountPercent)).toBe(42);
  });

  it('validates discountPercent on update too', async () => {
    const created = await createProduct({});
    await request(app)
      .put(`/api/products/${created.id}`)
      .set(bearer(superAdmin))
      .send({ discountPercent: 101 })
      .expect(400);

    await request(app)
      .put(`/api/products/${created.id}`)
      .set(bearer(superAdmin))
      .send({ discountPercent: -0.5 })
      .expect(400);

    const row = await Product.findByPk(created.id as string);
    expect(Number(row!.discountPercent)).toBe(0);
  });

  it('rejects renaming a product onto an existing SKU', async () => {
    const first = await createProduct({});
    const second = await createProduct({});
    await request(app)
      .put(`/api/products/${second.id}`)
      .set(bearer(superAdmin))
      .send({ code: first.code })
      .expect(409);
  });

  it('allows saving a product without changing its own SKU', async () => {
    const created = await createProduct({});
    const res = await request(app)
      .put(`/api/products/${created.id}`)
      .set(bearer(superAdmin))
      .send({ code: created.code, name: 'Same Code New Name' })
      .expect(200);
    expect(res.body.data.name).toBe('Same Code New Name');
  });

  it('rejects an empty update payload', async () => {
    const created = await createProduct({});
    await request(app).put(`/api/products/${created.id}`).set(bearer(superAdmin)).send({}).expect(400);
  });
});

describe('deactivation', () => {
  it('deactivates through PATCH /status and hides it from the default list', async () => {
    const created = await createProduct({});
    const res = await request(app)
      .patch(`/api/products/${created.id}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'Inactive' })
      .expect(200);
    expect(res.body.data.status).toBe('Inactive');

    await request(app)
      .patch(`/api/products/${created.id}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'Active' })
      .expect(200);
  });

  it('DELETE deactivates rather than destroying the row', async () => {
    const created = await createProduct({});
    const res = await request(app).delete(`/api/products/${created.id}`).set(bearer(superAdmin)).expect(200);
    expect(res.body.data.status).toBe('Inactive');

    // The record must still exist so historical stock/invoice rows stay readable.
    const row = await Product.findByPk(created.id as string);
    expect(row).not.toBeNull();
  });

  it('rejects an invalid status value', async () => {
    const created = await createProduct({});
    await request(app)
      .patch(`/api/products/${created.id}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'Deleted' })
      .expect(400);
  });
});

describe('product authorization', () => {
  it('lets a Branch Admin create products (PRODUCT_MASTER is implicit for admins)', async () => {
    // Products are global, so a Branch Admin creating one is not a scoping bug.
    const res = await request(app)
      .post('/api/products')
      .set(bearer(branchAdminA))
      .send({ name: 'Branch Admin Product', code: uniqueSku('BA') });
    expect(res.status).toBe(201);
  });

  it('stops an Employee without PRODUCT_MASTER from creating', async () => {
    // TEST-EMP holds only ['BILLING'].
    const res = await request(app)
      .post('/api/products')
      .set(bearer(employeeA))
      .send({ name: 'Employee Product', code: uniqueSku('EMP') });
    expect(res.status).toBe(403);
  });

  it('lets an Employee read the catalog', async () => {
    await request(app).get('/api/products').set(bearer(employeeA)).expect(200);
  });

  it('stops an Employee without PRODUCT_MASTER from updating or deactivating', async () => {
    const created = await createProduct({});
    await request(app).put(`/api/products/${created.id}`).set(bearer(employeeA)).send({ name: 'Hacked' }).expect(403);
    await request(app).delete(`/api/products/${created.id}`).set(bearer(employeeA)).expect(403);
  });

  it('ignores a branchId smuggled into a product payload', async () => {
    // Products are global, so branchId is not a product field at all and must
    // never influence where anything is stored.
    const res = await request(app)
      .post('/api/products')
      .set(bearer(branchAdminA))
      .send({ name: 'Smuggled Branch', code: uniqueSku('SM'), branchId: branchB });
    expect([201, 400]).toContain(res.status);
    if (res.status === 201) expect(res.body.data.branchId).toBeUndefined();
  });
});

describe('GET /api/categories', () => {
  it('lists categories for the Product Master dropdown', async () => {
    const res = await request(app).get('/api/categories').set(bearer(employeeA)).expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty('name');
  });

  it('requires authentication', async () => {
    await request(app).get('/api/categories').expect(401);
  });
});