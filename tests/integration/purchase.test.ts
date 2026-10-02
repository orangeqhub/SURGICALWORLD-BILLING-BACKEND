import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, closeDatabase, getBranchIds, loginAs, TEST_PASSWORD } from '../helpers';
import type { Actor } from '../helpers';
import { Product, Supplier, User } from '../../src/models';
import { hashPassword } from '../../src/services/passwordService';
import { randomUUID } from 'crypto';

/**
 * Phase 8 Purchase integration tests.
 *
 * Covers:
 *  - Authorization: SA + BA can create; EMPLOYEE needs PURCHASE_MANAGE
 *  - Branch isolation on create (BA can't create for other branch)
 *  - Validation: required fields, empty items, invalid product/supplier
 *  - Server-authoritative calculation: INTRA/INTER GST, invoice discount allocation, round off
 *  - Idempotency: same localId → 201 with existing purchase (no duplicate)
 *  - Stock receipt: available increases by qty + freeQty
 *  - Supplier ledger entry created atomically (DEBIT, PURCHASE referenceType)
 *  - Paid amount clamping (paidAmount > netAmount → clamped to netAmount)
 *  - GET /branches/:branchId/purchases (branch-scoped)
 *  - GET /purchases/:id/items (by UUID or localId)
 *  - Branch isolation on reads
 */

let app: Express;
let superAdmin: Actor;
let branchAdmin: Actor;
let branchAdminB: Actor;
let employeeNoPerm: Actor;
let employeeWithPerm: Actor;
let branchA: string;
let branchB: string;
let productId: string;
let supplierAId: string;

beforeAll(async () => {
  app = buildTestApp();
  ({ branchA, branchB } = await getBranchIds());

  superAdmin = await loginAs(app, 'TEST-SA');
  branchAdmin = await loginAs(app, 'TEST-BA');
  employeeNoPerm = await loginAs(app, 'TEST-EMP');

  const password = await hashPassword(TEST_PASSWORD);
  await User.bulkCreate([
    {
      role: 'EMPLOYEE',
      branchId: branchA,
      loginId: 'TEST-PUR-EMP-PERM',
      name: 'Purchase Employee',
      passwordHash: password,
      permissions: ['PURCHASE_MANAGE'],
      status: 'active',
    },
    {
      role: 'BRANCH_ADMIN',
      branchId: branchB,
      loginId: 'TEST-PUR-BA-B',
      name: 'Purchase Branch Admin B',
      passwordHash: password,
      permissions: [],
      status: 'active',
    },
  ] as never[]);

  employeeWithPerm = await loginAs(app, 'TEST-PUR-EMP-PERM');
  branchAdminB = await loginAs(app, 'TEST-PUR-BA-B');

  // Resolve the seed product
  const product = await Product.findOne({ where: { code: 'TEST-P1' } });
  if (!product) throw new Error('Seed product TEST-P1 is missing.');
  productId = product.id;

  // Create a supplier for branch A
  const supplierA = await Supplier.create({
    name: 'Test Supplier A',
    branchId: branchA,
    status: 'Active',
    openingBalance: 0,
    openingBalanceType: 'DEBIT',
  } as never);
  supplierAId = supplierA.id;
});

afterAll(async () => {
  await closeDatabase();
});

const bearer = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

function purchaseBody(overrides: Record<string, unknown> = {}) {
  return {
    branchId: branchA,
    supplierId: supplierAId,
    supplierInvoiceNumber: 'INV-001',
    taxType: 'INTRA',
    purchaseType: 'CREDIT',
    items: [
      {
        productId,
        productName: 'Test Product',
        quantity: 10,
        freeQuantity: 0,
        purchasePrice: 50,
        sellingPrice: 80,
        mrp: 100,
        discountPercent: 0,
        gstPercent: 12,
      },
    ],
    invoiceDiscount: 0,
    otherCharges: 0,
    paidAmount: 0,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/purchases — authorization
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/purchases — authorization', () => {
  it('SUPER_ADMIN can create a purchase', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(superAdmin))
      .send(purchaseBody({ branchId: branchA }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('RECEIVED');
  });

  it('BRANCH_ADMIN can create a purchase for own branch', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(purchaseBody());

    expect(res.status).toBe(201);
    expect(res.body.data.branchId).toBe(branchA);
  });

  it('BRANCH_ADMIN cannot create a purchase for a different branch', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(purchaseBody({ branchId: branchB }));

    expect(res.status).toBe(403);
  });

  it('EMPLOYEE without PURCHASE_MANAGE is denied', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(employeeNoPerm))
      .send(purchaseBody());

    expect(res.status).toBe(403);
  });

  it('EMPLOYEE with PURCHASE_MANAGE can create a purchase', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(employeeWithPerm))
      .send(purchaseBody());

    expect(res.status).toBe(201);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .send(purchaseBody());

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/purchases — validation
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/purchases — validation', () => {
  it('rejects missing supplierId', async () => {
    const body = purchaseBody();
    delete (body as Record<string, unknown>).supplierId;
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(body);

    expect(res.status).toBe(400);
  });

  it('rejects empty items array', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(purchaseBody({ items: [] }));

    expect(res.status).toBe(400);
  });

  it('rejects item with quantity <= 0', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 0, purchasePrice: 50, gstPercent: 12, discountPercent: 0 }],
        }),
      );

    expect(res.status).toBe(400);
  });

  it('rejects item with negative purchasePrice', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 5, purchasePrice: -10, gstPercent: 12, discountPercent: 0 }],
        }),
      );

    expect(res.status).toBe(400);
  });

  it('rejects supplier not in this branch', async () => {
    const otherSupplier = await Supplier.create({
      name: 'Supplier B',
      branchId: branchB,
      status: 'Active',
      openingBalance: 0,
      openingBalanceType: 'DEBIT',
    } as never);

    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(purchaseBody({ supplierId: otherSupplier.id }));

    expect(res.status).toBe(404);
  });

  it('rejects unknown productId', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId: randomUUID(), quantity: 5, purchasePrice: 50, gstPercent: 12, discountPercent: 0 }],
        }),
      );

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/purchases — calculation correctness
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/purchases — calculation', () => {
  it('computes INTRA GST (CGST + SGST) correctly', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 10, purchasePrice: 100, discountPercent: 0, gstPercent: 18 }],
          taxType: 'INTRA',
          invoiceDiscount: 0,
          otherCharges: 0,
        }),
      );

    expect(res.status).toBe(201);
    const d = res.body.data;
    // grossAmount = 1000, taxableAmount = 1000, gst18% = 180, cgst = 90, sgst = 90
    expect(d.taxableAmount).toBe(1000);
    expect(d.cgst).toBe(90);
    expect(d.sgst).toBe(90);
    expect(d.igst).toBe(0);
    expect(d.netAmount).toBe(1180);
  });

  it('computes INTER GST (IGST only) correctly', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 5, purchasePrice: 200, discountPercent: 0, gstPercent: 12 }],
          taxType: 'INTER',
          invoiceDiscount: 0,
          otherCharges: 0,
        }),
      );

    expect(res.status).toBe(201);
    const d = res.body.data;
    // grossAmount = 1000, taxable = 1000, igst 12% = 120
    expect(d.cgst).toBe(0);
    expect(d.sgst).toBe(0);
    expect(d.igst).toBe(120);
    expect(d.netAmount).toBe(1120);
  });

  it('applies item-level discount before GST', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 10, purchasePrice: 100, discountPercent: 10, gstPercent: 12 }],
          taxType: 'INTRA',
          invoiceDiscount: 0,
          otherCharges: 0,
        }),
      );

    expect(res.status).toBe(201);
    const d = res.body.data;
    // grossAmount=1000, discountAmount=100, taxable=900, gst=108, net=1008
    expect(d.subtotal).toBe(1000);
    expect(d.productDiscounts).toBe(100);
    expect(d.taxableAmount).toBe(900);
    expect(d.netAmount).toBe(1008);
  });

  it('allocates invoice discount proportionally and computes correct totals', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [
            { productId, quantity: 10, purchasePrice: 100, discountPercent: 0, gstPercent: 0 },
          ],
          invoiceDiscount: 100,
          otherCharges: 0,
          taxType: 'INTRA',
        }),
      );

    expect(res.status).toBe(201);
    const d = res.body.data;
    // grossAmount=1000, invDisc=100 (allocated to single line), adjustedTaxable=900, no GST → net=900
    expect(d.invoiceDiscount).toBe(100);
    expect(d.taxableAmount).toBe(900);
    expect(d.netAmount).toBe(900);
  });

  it('adds otherCharges post-tax (not taxed)', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 1, purchasePrice: 1000, discountPercent: 0, gstPercent: 0 }],
          invoiceDiscount: 0,
          otherCharges: 50,
          taxType: 'INTRA',
        }),
      );

    expect(res.status).toBe(201);
    const d = res.body.data;
    // taxable=1000, no GST, otherCharges=50 → net=1050
    expect(d.otherCharges).toBe(50);
    expect(d.netAmount).toBe(1050);
  });

  it('computes round-off for fractional totals', async () => {
    // 3 items at 33.33 each = 99.99, gst 12% = 11.9988 → net before round = 111.9988 → rounded = 112, roundOff = 0.00
    // Use a case that actually produces a fractional total
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 1, purchasePrice: 99.99, discountPercent: 0, gstPercent: 5 }],
          invoiceDiscount: 0,
          otherCharges: 0,
          taxType: 'INTRA',
        }),
      );

    expect(res.status).toBe(201);
    const d = res.body.data;
    // taxable=99.99, gst5%=5.00, net=105 (rounded from 104.9895)
    expect(typeof d.roundOff).toBe('number');
    expect(typeof d.netAmount).toBe('number');
    // netAmount must be a whole integer
    expect(d.netAmount).toBe(Math.round(d.netAmount));
  });

  it('clamps paidAmount to netAmount', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 10, purchasePrice: 100, discountPercent: 0, gstPercent: 0 }],
          paidAmount: 99999,
        }),
      );

    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.paidAmount).toBe(d.netAmount);
    expect(d.balanceAmount).toBe(0);
  });

  it('ignores client-supplied totals and uses server calculations', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send({
        ...purchaseBody(),
        netAmount: 9999,  // wrong client value – server should ignore
        cgst: 9999,
      });

    expect(res.status).toBe(201);
    // qty=10, price=50, gst=12%, taxable=500, cgst=30, net=560
    expect(res.body.data.cgst).toBe(30);
    expect(res.body.data.netAmount).toBe(560);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/purchases — idempotency', () => {
  it('same localId returns 201 with the original purchase (no duplicate)', async () => {
    const localId = `TEST-IDEM-${Date.now()}`;

    const first = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(purchaseBody({ id: localId }));
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(purchaseBody({ id: localId }));
    expect(second.status).toBe(201);

    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('requests without localId always create new purchases', async () => {
    const body = purchaseBody();
    delete (body as Record<string, unknown>).id;

    const first = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(body);
    const second = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.id).not.toBe(second.body.data.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stock receipt
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/purchases — stock receipt', () => {
  it('increases stock by the purchased quantity', async () => {
    const stockBefore = await request(app)
      .get(`/api/branches/${branchA}/stock/${productId}`)
      .set(bearer(branchAdmin));

    const availBefore = stockBefore.body.data?.available ?? 0;

    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(purchaseBody({ items: [{ productId, quantity: 25, freeQuantity: 0, purchasePrice: 50, gstPercent: 0, discountPercent: 0 }] }));

    expect(res.status).toBe(201);

    const stockAfter = await request(app)
      .get(`/api/branches/${branchA}/stock/${productId}`)
      .set(bearer(branchAdmin));

    expect(stockAfter.body.data.available).toBe(availBefore + 25);
  });

  it('increases stock by qty + freeQuantity', async () => {
    const stockBefore = await request(app)
      .get(`/api/branches/${branchA}/stock/${productId}`)
      .set(bearer(branchAdmin));

    const availBefore = stockBefore.body.data?.available ?? 0;

    await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 10, freeQuantity: 5, purchasePrice: 50, gstPercent: 0, discountPercent: 0 }],
        }),
      );

    const stockAfter = await request(app)
      .get(`/api/branches/${branchA}/stock/${productId}`)
      .set(bearer(branchAdmin));

    expect(stockAfter.body.data.available).toBe(availBefore + 15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Supplier ledger entry
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/purchases — supplier ledger', () => {
  it('creates a DEBIT ledger entry for the supplier', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          items: [{ productId, quantity: 5, purchasePrice: 200, gstPercent: 0, discountPercent: 0 }],
        }),
      );

    expect(res.status).toBe(201);
    const purchaseId = res.body.data.id;
    const netAmount = res.body.data.netAmount;

    const balance = await request(app)
      .get(`/api/ledger/balance?partyType=SUPPLIER&partyId=${supplierAId}`)
      .set(bearer(branchAdmin));

    expect(balance.status).toBe(200);
    // Balance should be positive (DEBIT increases payable)
    expect(balance.body.data).toBeGreaterThan(0);

    // Verify the referenceId links to the purchase
    const ledger = await request(app)
      .get(`/api/ledger?partyType=SUPPLIER&partyId=${supplierAId}`)
      .set(bearer(branchAdmin));

    const entry = (ledger.body.data as Array<Record<string, unknown>>).find(
      (e) => e.referenceId === purchaseId,
    );
    expect(entry).toBeDefined();
    expect(entry!.type).toBe('DEBIT');
    expect(entry!.referenceType).toBe('PURCHASE');
    expect(Number(entry!.amount)).toBe(netAmount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/branches/:branchId/purchases
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/branches/:branchId/purchases', () => {
  it('returns purchases for the branch', async () => {
    const res = await request(app)
      .get(`/api/branches/${branchA}/purchases`)
      .set(bearer(branchAdmin));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('BRANCH_ADMIN cannot list purchases of another branch', async () => {
    const res = await request(app)
      .get(`/api/branches/${branchA}/purchases`)
      .set(bearer(branchAdminB));

    expect(res.status).toBe(403);
  });

  it('SUPER_ADMIN can list purchases for any branch', async () => {
    const res = await request(app)
      .get(`/api/branches/${branchA}/purchases`)
      .set(bearer(superAdmin));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns purchases with expected fields', async () => {
    const res = await request(app)
      .get(`/api/branches/${branchA}/purchases`)
      .set(bearer(branchAdmin));

    expect(res.status).toBe(200);
    const first = res.body.data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('purchaseNumber');
    expect(first).toHaveProperty('netAmount');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('purchaseDate');
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app)
      .get(`/api/branches/${branchA}/purchases`);

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/purchases/:id/items
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/purchases/:id/items', () => {
  let purchaseId: string;
  let purchaseLocalId: string;

  beforeAll(async () => {
    const lid = `TEST-ITEMS-${Date.now()}`;
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(
        purchaseBody({
          id: lid,
          items: [
            {
              productId,
              productName: 'Test Product',
              sku: 'SKU-123',
              hsn: 'HSN-001',
              quantity: 5,
              freeQuantity: 2,
              purchasePrice: 100,
              sellingPrice: 150,
              mrp: 200,
              discountPercent: 5,
              gstPercent: 12,
              batchNumber: 'BATCH-A1',
              mfgDate: '2024-01-01',
              expiryDate: '2026-12-31',
            },
          ],
        }),
      );

    purchaseId = res.body.data.id;
    purchaseLocalId = lid;
  });

  it('returns items for purchase by UUID', async () => {
    const res = await request(app)
      .get(`/api/purchases/${purchaseId}/items`)
      .set(bearer(branchAdmin));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  it('returns items for purchase by localId', async () => {
    const res = await request(app)
      .get(`/api/purchases/${purchaseLocalId}/items`)
      .set(bearer(branchAdmin));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('returns full item snapshot fields', async () => {
    const res = await request(app)
      .get(`/api/purchases/${purchaseId}/items`)
      .set(bearer(branchAdmin));

    const item = res.body.data[0];
    expect(item.skuSnapshot).toBe('SKU-123');
    expect(item.hsnSnapshot).toBe('HSN-001');
    expect(item.freeQuantity).toBe(2);
    expect(item.batchNumber).toBe('BATCH-A1');
    expect(item.mfgDate).toBe('2024-01-01');
    expect(item.expiryDate).toBe('2026-12-31');
    expect(typeof item.adjustedTaxable).toBe('number');
    expect(typeof item.cgst).toBe('number');
    expect(typeof item.sgst).toBe('number');
  });

  it('BRANCH_ADMIN from another branch cannot get items', async () => {
    const res = await request(app)
      .get(`/api/purchases/${purchaseId}/items`)
      .set(bearer(branchAdminB));

    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown purchase identifier', async () => {
    const res = await request(app)
      .get(`/api/purchases/${randomUUID()}/items`)
      .set(bearer(branchAdmin));

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Response shape
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/purchases — response shape', () => {
  it('returns all required fields in the response', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send(purchaseBody());

    expect(res.status).toBe(201);
    const d = res.body.data;

    expect(d).toHaveProperty('id');
    expect(d).toHaveProperty('purchaseNumber');
    expect(d).toHaveProperty('branchId');
    expect(d).toHaveProperty('supplierId');
    expect(d).toHaveProperty('taxType');
    expect(d).toHaveProperty('purchaseType');
    expect(d).toHaveProperty('subtotal');
    expect(d).toHaveProperty('productDiscounts');
    expect(d).toHaveProperty('invoiceDiscount');
    expect(d).toHaveProperty('taxableAmount');
    expect(d).toHaveProperty('cgst');
    expect(d).toHaveProperty('sgst');
    expect(d).toHaveProperty('igst');
    expect(d).toHaveProperty('otherCharges');
    expect(d).toHaveProperty('roundOff');
    expect(d).toHaveProperty('netAmount');
    expect(d).toHaveProperty('totalAmount');
    expect(d).toHaveProperty('paidAmount');
    expect(d).toHaveProperty('balanceAmount');
    expect(d).toHaveProperty('status');
    expect(d).toHaveProperty('createdAt');
    expect(d.status).toBe('RECEIVED');
    expect(d.purchaseNumber).toMatch(/T-A\/PO\//);
  });

  it('createdBy is set from JWT (not from body)', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set(bearer(branchAdmin))
      .send({ ...purchaseBody(), createdBy: randomUUID() });

    expect(res.status).toBe(201);
    expect(res.body.data.createdBy).toBe(branchAdmin.id);
    expect(res.body.data.createdBy).not.toBeNull();
  });
});
