import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, closeDatabase, getBranchIds, loginAs } from '../helpers';
import type { Actor } from '../helpers';
import { BranchStock, Product, StockMovement } from '../../src/models';

/**
 * Stock tests.
 *
 * The behaviour under test was derived from the frontend, not invented:
 *   - available/min_stock/quantity are INTEGER (schema.ts)
 *   - the status rule is available <= 0 -> OUT_OF_STOCK,
 *     available <= minStock -> LOW_STOCK, else IN_STOCK
 *     (frontend/src/database/repositories/stockRepository.ts)
 *   - the frontend clamps stock at zero with MAX(available + ?, 0), so
 *     negative stock is prohibited
 *   - /branches/:branchId/stock-adjust takes { productId, delta, reason }
 *     (frontend/src/services/api/inventoryApi.js)
 *
 * The concurrency test at the bottom is the reason every write path takes a
 * row lock: without it, two concurrent sales of the last unit both read the
 * same quantity and one unit disappears.
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

let counter = 0;
async function makeProduct(overrides: Record<string, unknown> = {}): Promise<Product> {
  const suffix = `${Date.now().toString().slice(-6)}-${counter++}`;
  return Product.create({
    name: `Stock Product ${suffix}`,
    code: `STK-${suffix}`,
    mrp: 100,
    cutOffPrice: 90,
    sellingPrice: 80,
    purchasePrice: 50,
    discountPercent: 0,
    gst: 0,
    unit: 'Pcs',
    minStock: 0,
    batchTrackingEnabled: true,
    expiryTrackingEnabled: true,
    status: 'Active',
    ...overrides,
  } as never);
}

describe('branch stock isolation', () => {
  it('gives each branch an independent quantity for the same product', async () => {
    const product = await makeProduct();

    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 10, reason: 'Opening count' })
      .expect(200);

    const asSuper = await request(app)
      .post(`/api/stock/adjust`)
      .set(bearer(superAdmin))
      .send({ branchId: branchB, productId: product.id, delta: 4, reason: 'Opening count' })
      .expect(200);

    expect(asSuper.body.data.stock.available).toBe(4);

    const branchAStock = await request(app)
      .get(`/api/branches/${branchA}/stock/${product.id}`)
      .set(bearer(branchAdminA))
      .expect(200);
    expect(branchAStock.body.data.available).toBe(10);

    const branchBStock = await request(app)
      .get(`/api/branches/${branchB}/stock/${product.id}`)
      .set(bearer(superAdmin))
      .expect(200);
    expect(branchBStock.body.data.available).toBe(4);
  });

  it('stops a Branch Admin reading another branch stock', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchB}/stock-adjust`)
      .set(bearer(superAdmin))
      .send({ productId: product.id, delta: 5, reason: 'Opening count' })
      .expect(200);

    await request(app).get(`/api/branches/${branchB}/inventory`).set(bearer(branchAdminA)).expect(403);
    await request(app).get(`/api/branches/${branchB}/stock`).set(bearer(branchAdminA)).expect(403);
    await request(app)
      .get(`/api/branches/${branchB}/stock/${product.id}`)
      .set(bearer(branchAdminA))
      .expect(403);
    await request(app).get(`/api/branches/${branchB}/stock-movements`).set(bearer(branchAdminA)).expect(403);
  });

  it('stops a Branch Admin adjusting another branch stock', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post(`/api/branches/${branchB}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 1, reason: 'Sneaky' });
    expect(res.status).toBe(403);

    // The rejected request must not have created a row anywhere.
    const rows = await BranchStock.findAll({ where: { branchId: branchB, productId: product.id } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a conflicting branchId in the body of a branch-scoped route', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ branchId: branchB, productId: product.id, delta: 1, reason: 'Sneaky' });
    // 400, not 403: the request names two different branches at once, which is
    // a malformed request regardless of who sent it. This matches the existing
    // Phase 1-3 behaviour for a conflicting branchId in a query string
    // (tests/integration/auth.test.ts).
    expect(res.status).toBe(400);
    const rows = await BranchStock.findAll({ where: { branchId: branchA, productId: product.id } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a conflicting branchId when SUPER_ADMIN sends two branches', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(superAdmin))
      .send({ branchId: branchB, productId: product.id, delta: 1, reason: 'Conflicting' });
    expect(res.status).toBe(400);
  });

  it('confines a Branch Admin to their own branch when listing all stock', async () => {
    const res = await request(app).get('/api/stock').set(bearer(branchAdminA)).expect(200);
    expect(res.body.data.every((s: { branchId: string }) => s.branchId === branchA)).toBe(true);
  });

  it('lets a Super Admin see every branch', async () => {
    const res = await request(app).get('/api/stock').set(bearer(superAdmin)).expect(200);
    const branches = new Set(res.body.data.map((s: { branchId: string }) => s.branchId));
    expect(branches.has(branchA)).toBe(true);
    expect(branches.has(branchB)).toBe(true);
  });

  it('rejects a stock adjustment for an unknown product', async () => {
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: '11111111-1111-4111-8111-111111111111', delta: 1, reason: 'Ghost' })
      .expect(404);
  });

  it('rejects a stock adjustment for an unknown branch', async () => {
    const product = await makeProduct();
    await request(app)
      .post('/api/branches/11111111-1111-4111-8111-111111111111/stock-adjust')
      .set(bearer(superAdmin))
      .send({ productId: product.id, delta: 1, reason: 'Ghost branch' })
      .expect(400);
  });
});

describe('stock adjustments and movements', () => {
  it('applies a positive delta and records one movement', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 25, reason: 'Physical count' })
      .expect(200);

    expect(res.body.data.stock.available).toBe(25);
    // `quantity` mirrors `available` so either spelling works.
    expect(res.body.data.stock.quantity).toBe(25);
    expect(res.body.data.movement.quantity).toBe(25);
    expect(res.body.data.movement.type).toBe('ADJUSTMENT');

    const movements = await StockMovement.findAll({ where: { productId: product.id, branchId: branchA } });
    expect(movements).toHaveLength(1);
    expect(movements[0].note).toContain('Physical count');
  });

  it('applies a negative delta', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 10, reason: 'In' })
      .expect(200);

    const res = await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: -4, reason: 'Damaged' })
      .expect(200);

    expect(res.body.data.stock.available).toBe(6);
    expect(res.body.data.movement.quantity).toBe(-4);
  });

  it('creates the stock row on first adjustment', async () => {
    const product = await makeProduct();
    expect(await BranchStock.count({ where: { productId: product.id } })).toBe(0);

    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 3, reason: 'First count' })
      .expect(200);

    expect(await BranchStock.count({ where: { productId: product.id } })).toBe(1);
  });

  it('initialises opening stock explicitly', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post(`/api/branches/${branchA}/stock/init`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, available: 50, minStock: 10, reason: 'Opening balance' })
      .expect(201);

    expect(res.body.data.stock.available).toBe(50);
    expect(res.body.data.stock.minStock).toBe(10);
    expect(res.body.data.movement.quantity).toBe(50);
  });

  it('refuses to initialise a product that already has a stock record', async () => {
    const product = await makeProduct();
    const payload = { productId: product.id, available: 5, reason: 'Opening' };
    await request(app).post(`/api/branches/${branchA}/stock/init`).set(bearer(branchAdminA)).send(payload).expect(201);
    await request(app).post(`/api/branches/${branchA}/stock/init`).set(bearer(branchAdminA)).send(payload).expect(409);
  });

  it('sets an absolute quantity and records the difference', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 30, reason: 'In' })
      .expect(200);

    const res = await request(app)
      .put(`/api/branches/${branchA}/stock`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, newTotal: 18, reason: 'Recount' })
      .expect(200);

    expect(res.body.data.stock.available).toBe(18);
    // The movement records the -12 change, not the new total.
    expect(res.body.data.movement.quantity).toBe(-12);
  });

  it('lists movements newest first for the branch', async () => {
    const product = await makeProduct();
    for (const delta of [5, 3, -2]) {
      await request(app)
        .post(`/api/branches/${branchA}/stock-adjust`)
        .set(bearer(branchAdminA))
        .send({ productId: product.id, delta, reason: `Adjust ${delta}` })
        .expect(200);
    }

    const res = await request(app)
      .get(`/api/branches/${branchA}/stock-movements?productId=${product.id}`)
      .set(bearer(branchAdminA))
      .expect(200);

    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].quantity).toBe(-2);
  });
});

describe('stock validation', () => {
  it('rejects a zero delta', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 0, reason: 'Nothing' })
      .expect(400);
  });

  it('rejects a fractional delta instead of truncating it', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 2.5, reason: 'Fractional' });
    expect(res.status).toBe(400);

    // Truncating 2.5 to 2 would silently corrupt stock, so nothing was written.
    const rows = await BranchStock.findAll({ where: { productId: product.id } });
    expect(rows).toHaveLength(0);
  });

  it('requires a reason for every adjustment', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 1 })
      .expect(400);
  });

  it('rejects negative stock with 409 INSUFFICIENT_STOCK', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 5, reason: 'In' })
      .expect(200);

    const res = await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: -6, reason: 'Too much out' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

    // The failed adjustment must not have changed the quantity or logged a movement.
    const row = await BranchStock.findOne({ where: { branchId: branchA, productId: product.id } });
    expect(row!.available).toBe(5);
    expect(await StockMovement.count({ where: { productId: product.id } })).toBe(1);
  });

  it('allows stock to reach exactly zero but not below', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 4, reason: 'In' })
      .expect(200);

    const res = await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: -4, reason: 'All sold' })
      .expect(200);

    expect(res.body.data.stock.available).toBe(0);
    expect(res.body.data.stock.status).toBe('OUT_OF_STOCK');
  });

  it('rejects a negative newTotal', async () => {
    const product = await makeProduct();
    await request(app)
      .put(`/api/branches/${branchA}/stock`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, newTotal: -1, reason: 'Bad' })
      .expect(400);
  });

  it('refuses a batch-level adjustment rather than recording a lying movement', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({
        productId: product.id,
        delta: 1,
        reason: 'Batch tweak',
        batchId: '11111111-1111-4111-8111-111111111111',
      });
    expect(res.status).toBe(409);
    expect(await StockMovement.count({ where: { productId: product.id } })).toBe(0);
  });
});

describe('stock status rule', () => {
  it('uses the frontend thresholds', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 20, minStock: 5, reason: 'In' })
      .expect(200);

    const read = async () =>
      (await request(app).get(`/api/branches/${branchA}/stock/${product.id}`).set(bearer(branchAdminA)).expect(200))
        .body.data;

    expect((await read()).status).toBe('IN_STOCK');

    // available === minStock counts as LOW_STOCK, matching the frontend's <=.
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: -15, reason: 'Sold' })
      .expect(200);
    expect((await read()).status).toBe('LOW_STOCK');

    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: -5, reason: 'Sold out' })
      .expect(200);
    expect((await read()).status).toBe('OUT_OF_STOCK');
  });

  it('lists low and out-of-stock products', async () => {
    const product = await makeProduct({ minStock: 10 });
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 3, minStock: 10, reason: 'In' })
      .expect(200);

    const res = await request(app)
      .get(`/api/stock/low?branchId=${branchA}`)
      .set(bearer(branchAdminA))
      .expect(200);

    const found = res.body.data.find((s: { productId: string }) => s.productId === product.id);
    expect(found).toBeDefined();
    expect(['LOW_STOCK', 'OUT_OF_STOCK']).toContain(found.status);
  });

  it('reports zero stock for a product with no row yet', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .get(`/api/branches/${branchA}/stock/${product.id}`)
      .set(bearer(branchAdminA))
      .expect(200);
    expect(res.body.data.available).toBe(0);
    expect(res.body.data.hasRecord).toBe(false);
    expect(res.body.data.status).toBe('OUT_OF_STOCK');
  });
});

describe('stock authorization', () => {
  it('stops an Employee without STOCK_ADJUST from adjusting', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(employeeA))
      .send({ productId: product.id, delta: 1, reason: 'Unauthorised' })
      .expect(403);
  });

  it('lets an Employee read stock so they can sell', async () => {
    await request(app).get(`/api/branches/${branchA}/inventory`).set(bearer(employeeA)).expect(200);
    await request(app).get('/api/stock').set(bearer(employeeA)).expect(200);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/stock').expect(401);
    await request(app).get(`/api/branches/${branchA}/inventory`).expect(401);
  });
});

describe('stock concurrency', () => {
  /**
   * The whole point of the row lock. Eight concurrent -1 adjustments against a
   * stock of 5 must leave exactly 0 with three rejected, never a negative
   * quantity and never a lost unit.
   */
  it('serialises concurrent adjustments without corrupting the total', async () => {
    const product = await makeProduct();
    await request(app)
      .post(`/api/branches/${branchA}/stock-adjust`)
      .set(bearer(branchAdminA))
      .send({ productId: product.id, delta: 5, reason: 'Opening' })
      .expect(200);

    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post(`/api/branches/${branchA}/stock-adjust`)
          .set(bearer(branchAdminA))
          .send({ productId: product.id, delta: -1, reason: 'Concurrent sale' }),
      ),
    );

    const succeeded = attempts.filter((r) => r.status === 200);
    const rejected = attempts.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(5);
    expect(rejected).toHaveLength(3);

    const row = await BranchStock.findOne({ where: { branchId: branchA, productId: product.id } });
    expect(row!.available).toBe(0);
    expect(row!.status).toBe('OUT_OF_STOCK');

    // Exactly the five successful movements were persisted.
    const movements = await StockMovement.findAll({
      where: { branchId: branchA, productId: product.id, quantity: -1 },
    });
    expect(movements).toHaveLength(5);
  });

  it('concurrent positive adjustments all land', async () => {
    const product = await makeProduct();
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post(`/api/branches/${branchA}/stock-adjust`)
          .set(bearer(branchAdminA))
          .send({ productId: product.id, delta: 2, reason: 'Concurrent in' }),
      ),
    );

    expect(attempts.every((r) => r.status === 200)).toBe(true);
    const row = await BranchStock.findOne({ where: { branchId: branchA, productId: product.id } });
    expect(row!.available).toBe(20);
  });

  it('creates the row exactly once when concurrent first-time adjustments race', async () => {
    const product = await makeProduct();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/branches/${branchA}/stock-adjust`)
          .set(bearer(branchAdminA))
          .send({ productId: product.id, delta: 1, reason: 'Race to create' }),
      ),
    );

    expect(await BranchStock.count({ where: { branchId: branchA, productId: product.id } })).toBe(1);
    const row = await BranchStock.findOne({ where: { branchId: branchA, productId: product.id } });
    expect(row!.available).toBe(5);
  });
});

describe('batches (read-only in Phase 4)', () => {
  it('returns an empty list rather than failing when no batches exist', async () => {
    const res = await request(app)
      .get(`/api/batches?branchId=${branchA}`)
      .set(bearer(branchAdminA))
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('scopes batches to the caller branch', async () => {
    const res = await request(app).get('/api/batches').set(bearer(branchAdminA)).expect(200);
    expect(res.body.data.every((b: { branchId: string }) => b.branchId === branchA)).toBe(true);
  });
});