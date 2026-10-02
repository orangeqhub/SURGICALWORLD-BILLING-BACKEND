import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, closeDatabase, getBranchIds, loginAs, TEST_PASSWORD } from '../helpers';
import type { Actor } from '../helpers';
import { User } from '../../src/models';
import { hashPassword } from '../../src/services/passwordService';
import { randomUUID } from 'crypto';

/**
 * Phase 7 Ledger integration tests.
 *
 * Covers:
 *  - Authorization: SUPER_ADMIN + BRANCH_ADMIN can write; EMPLOYEE cannot
 *  - Branch isolation on write and read
 *  - Validation: required fields, amount > 0, only MANUAL/ADJUSTMENT referenceType
 *  - Idempotency: duplicate (referenceType + referenceId) → 409; null referenceId allows duplicates
 *  - field mapping: request `date` → stored as entryDate → response `date`
 *  - createdBy in body ignored; JWT user is used
 *  - GET /ledger branch-scoping: BA/EMP see only own branch; SA sees all
 *  - GET /ledger filtering by partyType, partyId
 *  - GET /ledger/balance: DEBIT adds, CREDIT subtracts; cross-branch; employee can read
 *  - Balance = 0 for unknown party
 */

let app: Express;
let superAdmin: Actor;
let branchAdminA: Actor;
let branchAdminB: Actor;
let employee: Actor;
let branchA: string;
let branchB: string;

const CUSTOMER_1 = randomUUID();
const CUSTOMER_2 = randomUUID();
const SUPPLIER_1 = randomUUID();

beforeAll(async () => {
  app = buildTestApp();
  ({ branchA, branchB } = await getBranchIds());
  superAdmin = await loginAs(app, 'TEST-SA');
  branchAdminA = await loginAs(app, 'TEST-BA');
  employee = await loginAs(app, 'TEST-EMP');

  await User.create({
    role: 'BRANCH_ADMIN',
    branchId: branchB,
    loginId: 'TEST-LED-BA-B',
    name: 'Ledger Branch Admin B',
    passwordHash: await hashPassword(TEST_PASSWORD),
    permissions: [],
    status: 'active',
  } as never);
  branchAdminB = await loginAs(app, 'TEST-LED-BA-B');
});

afterAll(async () => {
  await closeDatabase();
});

const bearer = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

function entryBody(overrides: Record<string, unknown> = {}) {
  return {
    branchId: branchA,
    partyType: 'CUSTOMER',
    partyId: CUSTOMER_1,
    partyName: 'Test Customer',
    type: 'DEBIT',
    amount: 100,
    note: 'Test manual entry',
    referenceType: 'MANUAL',
    referenceId: null,
    date: new Date('2024-06-15T12:00:00.000Z').toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /api/ledger — authorization
// ---------------------------------------------------------------------------

describe('POST /api/ledger — authorization', () => {
  it('SUPER_ADMIN can create a manual ledger entry', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ branchId: branchA }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('DEBIT');
    expect(res.body.data.amount).toBe(100);
  });

  it('BRANCH_ADMIN can create a manual entry for their own branch', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(branchAdminA))
      .send(entryBody({ branchId: branchA }));

    expect(res.status).toBe(201);
    expect(res.body.data.branchId).toBe(branchA);
  });

  it('EMPLOYEE cannot create a ledger entry → 403', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(employee))
      .send(entryBody());

    expect(res.status).toBe(403);
  });

  it('BRANCH_ADMIN cannot create an entry for a different branch → 403', async () => {
    // branchAdminA belongs to branchA; trying to write to branchB is rejected
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(branchAdminA))
      .send(entryBody({ branchId: branchB }));

    expect(res.status).toBe(403);
  });

  it('unauthenticated request → 401', async () => {
    const res = await request(app).post('/api/ledger').send(entryBody());
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/ledger — validation
// ---------------------------------------------------------------------------

describe('POST /api/ledger — validation', () => {
  it('missing note → 400', async () => {
    const body = { ...entryBody() };
    delete (body as any).note;
    const res = await request(app).post('/api/ledger').set(bearer(superAdmin)).send(body);
    expect(res.status).toBe(400);
  });

  it('invalid partyType → 400', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ partyType: 'AGENT' }));
    expect(res.status).toBe(400);
  });

  it('amount = 0 → 400', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ amount: 0 }));
    expect(res.status).toBe(400);
  });

  it('amount negative → 400', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ amount: -50 }));
    expect(res.status).toBe(400);
  });

  it('referenceType INVOICE (auto type) → 400', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ referenceType: 'INVOICE' }));
    expect(res.status).toBe(400);
  });

  it('referenceType ADJUSTMENT is valid → 201', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ referenceType: 'ADJUSTMENT' }));
    expect(res.status).toBe(201);
    expect(res.body.data.referenceType).toBe('ADJUSTMENT');
  });

  it('invalid referenceId (non-UUID string) → 400', async () => {
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ referenceId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('missing branchId → 400', async () => {
    const body = { ...entryBody() };
    delete (body as any).branchId;
    const res = await request(app).post('/api/ledger').set(bearer(superAdmin)).send(body);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/ledger — idempotency (duplicate referenceId)
// ---------------------------------------------------------------------------

describe('POST /api/ledger — idempotency', () => {
  it('same referenceType + referenceId → second request 409', async () => {
    const refId = randomUUID();
    const body = entryBody({ referenceId: refId, referenceType: 'ADJUSTMENT' });

    const first = await request(app).post('/api/ledger').set(bearer(superAdmin)).send(body);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/ledger').set(bearer(superAdmin)).send(body);
    expect(second.status).toBe(409);
  });

  it('null referenceId allows duplicate entries', async () => {
    const body = entryBody({ referenceId: null, referenceType: 'MANUAL', partyId: CUSTOMER_2 });

    const first = await request(app).post('/api/ledger').set(bearer(superAdmin)).send(body);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/ledger').set(bearer(superAdmin)).send(body);
    expect(second.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// POST /api/ledger — field mapping
// ---------------------------------------------------------------------------

describe('POST /api/ledger — field mapping', () => {
  it('response contains `date` field (not `entryDate`)', async () => {
    const dateStr = '2024-01-15T12:00:00.000Z';
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ date: dateStr }));

    expect(res.status).toBe(201);
    expect(res.body.data.date).toBeDefined();
    expect(res.body.data).not.toHaveProperty('entryDate');
    // Date round-trips correctly
    expect(new Date(res.body.data.date).toISOString()).toBe(dateStr);
  });

  it('createdBy in body is ignored — JWT user is always used', async () => {
    const fakeUserId = randomUUID();
    const res = await request(app)
      .post('/api/ledger')
      .set(bearer(branchAdminA))
      .send(entryBody({ createdBy: fakeUserId }));

    expect(res.status).toBe(201);
    expect(res.body.data.createdBy).toBe(branchAdminA.id);
    expect(res.body.data.createdBy).not.toBe(fakeUserId);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ledger — authorization & branch isolation
// ---------------------------------------------------------------------------

describe('GET /api/ledger — authorization and branch isolation', () => {
  beforeAll(async () => {
    // Seed entries in branchA and branchB for isolation tests
    await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ branchId: branchA, partyId: randomUUID(), note: 'Branch A entry' }));

    await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ branchId: branchB, partyId: randomUUID(), note: 'Branch B entry' }));
  });

  it('SUPER_ADMIN without branchId filter sees entries from all branches', async () => {
    const res = await request(app).get('/api/ledger').set(bearer(superAdmin));
    expect(res.status).toBe(200);
    const branchIds = (res.body.data as any[]).map((e) => e.branchId);
    expect(branchIds).toContain(branchA);
    expect(branchIds).toContain(branchB);
  });

  it('SUPER_ADMIN with branchId filter sees only that branch', async () => {
    const res = await request(app).get(`/api/ledger?branchId=${branchA}`).set(bearer(superAdmin));
    expect(res.status).toBe(200);
    const branchIds = (res.body.data as any[]).map((e) => e.branchId);
    expect(branchIds.every((id) => id === branchA)).toBe(true);
  });

  it('BRANCH_ADMIN sees only their own branch entries (no branchId param needed)', async () => {
    const res = await request(app).get('/api/ledger').set(bearer(branchAdminA));
    expect(res.status).toBe(200);
    const branchIds = (res.body.data as any[]).map((e) => e.branchId);
    expect(branchIds.every((id) => id === branchA)).toBe(true);
    expect(branchIds).not.toContain(branchB);
  });

  it('EMPLOYEE sees only their own branch entries', async () => {
    const res = await request(app).get('/api/ledger').set(bearer(employee));
    expect(res.status).toBe(200);
    const branchIds = (res.body.data as any[]).map((e) => e.branchId);
    expect(branchIds.every((id) => id === branchA)).toBe(true);
  });

  it('unauthenticated → 401', async () => {
    const res = await request(app).get('/api/ledger');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ledger — filtering
// ---------------------------------------------------------------------------

describe('GET /api/ledger — filtering', () => {
  const supplierPartyId = randomUUID();

  beforeAll(async () => {
    // Seed a SUPPLIER entry to test partyType filtering
    await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(
        entryBody({
          branchId: branchA,
          partyType: 'SUPPLIER',
          partyId: supplierPartyId,
          note: 'Supplier entry for filter test',
        }),
      );
  });

  it('filter by partyType=SUPPLIER returns only supplier entries', async () => {
    const res = await request(app)
      .get(`/api/ledger?partyType=SUPPLIER`)
      .set(bearer(superAdmin));
    expect(res.status).toBe(200);
    expect((res.body.data as any[]).every((e) => e.partyType === 'SUPPLIER')).toBe(true);
  });

  it('filter by partyId returns only entries for that party', async () => {
    const res = await request(app)
      .get(`/api/ledger?partyId=${supplierPartyId}`)
      .set(bearer(superAdmin));
    expect(res.status).toBe(200);
    expect((res.body.data as any[]).every((e) => e.partyId === supplierPartyId)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('entries are ordered by date descending (newest first)', async () => {
    const res = await request(app).get('/api/ledger').set(bearer(superAdmin));
    expect(res.status).toBe(200);
    const dates = (res.body.data as any[]).map((e) => new Date(e.date).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/ledger/balance
// ---------------------------------------------------------------------------

describe('GET /api/ledger/balance', () => {
  const balancePartyId = randomUUID();

  beforeAll(async () => {
    // Create 2 DEBIT (100 each) and 1 CREDIT (30) → balance should be 170.00
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post('/api/ledger')
        .set(bearer(superAdmin))
        .send(entryBody({ branchId: branchA, partyId: balancePartyId, type: 'DEBIT', amount: 100 }));
    }
    await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ branchId: branchA, partyId: balancePartyId, type: 'CREDIT', amount: 30 }));
  });

  it('balance = DEBIT amounts minus CREDIT amounts', async () => {
    const res = await request(app)
      .get(`/api/ledger/balance?partyType=CUSTOMER&partyId=${balancePartyId}`)
      .set(bearer(superAdmin));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeCloseTo(170.0, 2);
  });

  it('balance for an unknown party is 0', async () => {
    const res = await request(app)
      .get(`/api/ledger/balance?partyType=CUSTOMER&partyId=${randomUUID()}`)
      .set(bearer(superAdmin));

    expect(res.status).toBe(200);
    expect(res.body.data).toBe(0);
  });

  it('balance is a cross-branch sum (not filtered by branch)', async () => {
    const crossPartyId = randomUUID();

    // Write 50 in branchA
    await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ branchId: branchA, partyId: crossPartyId, amount: 50, type: 'DEBIT' }));

    // Write 20 in branchB
    await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ branchId: branchB, partyId: crossPartyId, amount: 20, type: 'DEBIT' }));

    const res = await request(app)
      .get(`/api/ledger/balance?partyType=CUSTOMER&partyId=${crossPartyId}`)
      .set(bearer(superAdmin));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeCloseTo(70.0, 2);
  });

  it('EMPLOYEE can read party balance (read-only access)', async () => {
    const res = await request(app)
      .get(`/api/ledger/balance?partyType=CUSTOMER&partyId=${balancePartyId}`)
      .set(bearer(employee));

    expect(res.status).toBe(200);
    expect(typeof res.body.data).toBe('number');
  });

  it('missing partyId → 400', async () => {
    const res = await request(app)
      .get('/api/ledger/balance?partyType=CUSTOMER')
      .set(bearer(superAdmin));
    expect(res.status).toBe(400);
  });

  it('invalid partyType → 400', async () => {
    const res = await request(app)
      .get(`/api/ledger/balance?partyType=AGENT&partyId=${randomUUID()}`)
      .set(bearer(superAdmin));
    expect(res.status).toBe(400);
  });

  it('unauthenticated → 401', async () => {
    const res = await request(app)
      .get(`/api/ledger/balance?partyType=CUSTOMER&partyId=${balancePartyId}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Integration: create → appears in list → balance reflects it
// ---------------------------------------------------------------------------

describe('integration: create → list → balance', () => {
  it('new entry appears in list and updates balance', async () => {
    const partyId = randomUUID();

    const create = await request(app)
      .post('/api/ledger')
      .set(bearer(superAdmin))
      .send(entryBody({ branchId: branchA, partyId, amount: 250, type: 'DEBIT' }));
    expect(create.status).toBe(201);

    const listed = await request(app)
      .get(`/api/ledger?partyId=${partyId}`)
      .set(bearer(superAdmin));
    expect(listed.status).toBe(200);
    expect(listed.body.data.length).toBe(1);
    expect(listed.body.data[0].amount).toBe(250);
    expect(listed.body.data[0].date).toBeDefined();

    const bal = await request(app)
      .get(`/api/ledger/balance?partyType=CUSTOMER&partyId=${partyId}`)
      .set(bearer(superAdmin));
    expect(bal.status).toBe(200);
    expect(bal.body.data).toBeCloseTo(250, 2);
  });
});
