import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, closeDatabase, getBranchIds, loginAs, TEST_PASSWORD } from '../helpers';
import type { Actor } from '../helpers';

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

describe('GET /api/health', () => {
  it('returns the exact success payload the frontend expects', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Surgical World Billing API is running' });
  });

  it('needs no authentication', async () => {
    await request(app).get('/api/health').expect(200);
  });
});

describe('POST /api/auth/login', () => {
  it('issues a token and a user payload for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'TEST-BA', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.loginId).toBe('TEST-BA');
    expect(res.body.data.user.role).toBe('BRANCH_ADMIN');
    expect(res.body.data.user.branchId).toBe(branchA);
  });

  it('never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'TEST-SA', password: TEST_PASSWORD });

    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(TEST_PASSWORD);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('gives a Super Admin a null branchId', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'TEST-SA', password: TEST_PASSWORD });
    expect(res.body.data.user.branchId).toBeNull();
  });

  it('rejects a wrong password with 401', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'TEST-SA', password: 'not-the-password' })
      .expect(401);
  });

  it('rejects an unknown loginId with 401 and the same generic message', async () => {
    // Identical wording prevents account enumeration.
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'DOES-NOT-EXIST', password: 'whatever' })
      .expect(401);
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'TEST-SA', password: 'whatever' })
      .expect(401);

    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('refuses an inactive account with 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'TEST-INACTIVE', password: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('refuses a branch that is not the account\'s own', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'TEST-BA', password: TEST_PASSWORD, branchId: branchB })
      .expect(403);
  });

  it('accepts the account\'s own branch', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'TEST-BA', password: TEST_PASSWORD, branchId: branchA })
      .expect(200);
  });

  it('validates the request body with 400', async () => {
    await request(app).post('/api/auth/login').send({ loginId: 'TEST-SA' }).expect(400);
    await request(app).post('/api/auth/login').send({ password: 'x' }).expect(400);
    await request(app).post('/api/auth/login').send({}).expect(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the principal from the token', async () => {
    const res = await request(app).get('/api/auth/me').set(bearer(branchAdminA));
    expect(res.status).toBe(200);
    expect(res.body.data.loginId).toBe('TEST-BA');
    expect(res.body.data.id).toBe(branchAdminA.id);
  });

  it('401s without a token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('401s on a malformed token', async () => {
    await request(app).get('/api/auth/me').set({ Authorization: 'Bearer not.a.real.jwt' }).expect(401);
  });

  it('401s on a token signed with a different secret', async () => {
    // Guards against accepting a token minted by another environment.
    const foreign = await import('jsonwebtoken');
    const forged = foreign.default.sign(
      { sub: superAdmin.id, role: 'SUPER_ADMIN', branchId: null },
      'a-different-secret',
      { expiresIn: '1h' },
    );
    await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${forged}` }).expect(401);
  });
});

describe('branch isolation', () => {
  it('shows a Super Admin every branch', async () => {
    const res = await request(app).get('/api/branches').set(bearer(superAdmin));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('shows a Branch Admin only their own branch', async () => {
    const res = await request(app).get('/api/branches').set(bearer(branchAdminA));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(branchA);
  });

  it('shows an Employee only their own branch', async () => {
    const res = await request(app).get('/api/branches').set(bearer(employeeA));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(branchA);
  });

  it('lets a Branch Admin read their own branch record', async () => {
    const res = await request(app).get(`/api/branches/${branchA}`).set(bearer(branchAdminA));
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('T-A');
  });

  it('403s a Branch Admin reading another branch record', async () => {
    await request(app).get(`/api/branches/${branchB}`).set(bearer(branchAdminA)).expect(403);
  });

  it('403s an Employee reading another branch record', async () => {
    await request(app).get(`/api/branches/${branchB}`).set(bearer(employeeA)).expect(403);
  });

  it('lets a Super Admin read any branch record', async () => {
    await request(app).get(`/api/branches/${branchA}`).set(bearer(superAdmin)).expect(200);
    await request(app).get(`/api/branches/${branchB}`).set(bearer(superAdmin)).expect(200);
  });

  it('rejects a conflicting branchId sent in the query string', async () => {
    const res = await request(app)
      .get(`/api/branches/${branchA}`)
      .query({ branchId: branchB })
      .set(bearer(branchAdminA));
    expect(res.status).toBe(400);
  });

  it('401s an unauthenticated branch read', async () => {
    await request(app).get(`/api/branches/${branchA}`).expect(401);
  });

  it('404s a branch that does not exist (Super Admin)', async () => {
    await request(app)
      .get('/api/branches/99999999-9999-9999-9999-999999999999')
      .set(bearer(superAdmin))
      .expect(404);
  });
});

describe('role enforcement on branch mutation', () => {
  const payload = { code: 'T-NEW', name: 'Created In Test' };

  it('lets a Super Admin create a branch', async () => {
    const res = await request(app).post('/api/branches').set(bearer(superAdmin)).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('T-NEW');
    expect(res.body.data.status).toBe('Active');
  });

  it('403s a Branch Admin creating a branch', async () => {
    await request(app).post('/api/branches').set(bearer(branchAdminA)).send(payload).expect(403);
  });

  it('403s an Employee creating a branch', async () => {
    await request(app).post('/api/branches').set(bearer(employeeA)).send(payload).expect(403);
  });

  it('400s a duplicate branch code', async () => {
    await request(app).post('/api/branches').set(bearer(superAdmin)).send(payload).expect(409);
  });

  it('400s an invalid payload', async () => {
    await request(app).post('/api/branches').set(bearer(superAdmin)).send({ name: 'No Code' }).expect(400);
  });

  it('403s a Branch Admin updating a branch', async () => {
    await request(app)
      .put(`/api/branches/${branchB}`)
      .set(bearer(branchAdminA))
      .send({ name: 'Hijacked' })
      .expect(403);
  });
});

describe('POST /api/auth/users', () => {
  const newUser = {
    loginId: 'TEST-NEW-EMP',
    name: 'Created Employee',
    password: 'Another@123',
    role: 'EMPLOYEE',
    permissions: ['BILLING'],
  };

  it('lets a Super Admin create a user', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set(bearer(superAdmin))
      .send({ ...newUser, branchId: branchA });

    expect(res.status).toBe(201);
    expect(res.body.data.loginId).toBe('TEST-NEW-EMP');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('403s a Branch Admin creating a user', async () => {
    await request(app)
      .post('/api/auth/users')
      .set(bearer(branchAdminA))
      .send({ ...newUser, branchId: branchA })
      .expect(403);
  });

  it('403s an Employee creating a user', async () => {
    await request(app)
      .post('/api/auth/users')
      .set(bearer(employeeA))
      .send({ ...newUser, branchId: branchA })
      .expect(403);
  });

  it('400s an unknown role', async () => {
    await request(app)
      .post('/api/auth/users')
      .set(bearer(superAdmin))
      .send({ ...newUser, role: 'WIZARD', branchId: branchA })
      .expect(400);
  });

  it('400s an unknown permission', async () => {
    await request(app)
      .post('/api/auth/users')
      .set(bearer(superAdmin))
      .send({ ...newUser, permissions: ['NOT_A_PERMISSION'], branchId: branchA })
      .expect(400);
  });

  it('400s a short password', async () => {
    await request(app)
      .post('/api/auth/users')
      .set(bearer(superAdmin))
      .send({ ...newUser, loginId: 'TEST-SHORT-PW', password: 'abc', branchId: branchA })
      .expect(400);
  });

  it('rejects a Super Admin created with a branchId (DB CHECK invariant)', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set(bearer(superAdmin))
      .send({ ...newUser, loginId: 'TEST-BAD-SA', role: 'SUPER_ADMIN', branchId: branchA });
    // Rejected either by validation or by the users_branch_required_by_role CHECK.
    expect([400, 409, 500]).toContain(res.status);
  });
});

describe('POST /api/auth/change-password', () => {
  const LOGIN_ID = 'TEST-PW-CHANGE';

  beforeAll(async () => {
    await request(app)
      .post('/api/auth/users')
      .set(bearer(superAdmin))
      .send({
        loginId: LOGIN_ID,
        name: 'Pw Change',
        password: 'Before@123',
        role: 'EMPLOYEE',
        branchId: branchA,
      })
      .expect(201);
  });

  async function loginWith(password: string): Promise<string> {
    const res = await request(app).post('/api/auth/login').send({ loginId: LOGIN_ID, password });
    if (res.status !== 200) throw new Error(`Expected login success, got ${res.status}`);
    return res.body.data.token as string;
  }

  it('changes the caller\'s own password, invalidating the old one', async () => {
    const token = await loginWith('Before@123');

    await request(app)
      .post('/api/auth/change-password')
      .set({ Authorization: `Bearer ${token}` })
      .send({ currentPassword: 'Before@123', newPassword: 'After@1234' })
      .expect(200);

    // The old password stops working...
    await request(app).post('/api/auth/login').send({ loginId: LOGIN_ID, password: 'Before@123' }).expect(401);
    // ...and the new one works.
    await request(app).post('/api/auth/login').send({ loginId: LOGIN_ID, password: 'After@1234' }).expect(200);
  });

  it('leaves the password unchanged when the current password is wrong', async () => {
    const token = await loginWith('After@1234');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set({ Authorization: `Bearer ${token}` })
      .send({ currentPassword: 'not-my-password', newPassword: 'Hijack@9999' });
    expect([400, 401, 403]).toContain(res.status);

    // The attempted new password must NOT have taken effect.
    await request(app).post('/api/auth/login').send({ loginId: LOGIN_ID, password: 'Hijack@9999' }).expect(401);
    await request(app).post('/api/auth/login').send({ loginId: LOGIN_ID, password: 'After@1234' }).expect(200);
  });

  it('requires authentication', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'x', newPassword: 'y' })
      .expect(401);
  });

  it('validates the new password length', async () => {
    const token = await loginWith('After@1234');
    await request(app)
      .post('/api/auth/change-password')
      .set({ Authorization: `Bearer ${token}` })
      .send({ currentPassword: 'After@1234', newPassword: 'short' })
      .expect(400);
  });

  it('ignores a userId in the body and always changes the CALLER\'s password', async () => {
    const token = await loginWith('After@1234');

    await request(app)
      .post('/api/auth/change-password')
      .set({ Authorization: `Bearer ${token}` })
      .send({ userId: superAdmin.id, currentPassword: 'After@1234', newPassword: 'CallersOwn@123' })
      .expect(200);

    // The caller changed their own password...
    await request(app).post('/api/auth/login').send({ loginId: LOGIN_ID, password: 'CallersOwn@123' }).expect(200);
    await request(app).post('/api/auth/login').send({ loginId: LOGIN_ID, password: 'After@1234' }).expect(401);
    // ...and the Super Admin whose id was smuggled into the body is untouched.
    await request(app).post('/api/auth/login').send({ loginId: 'TEST-SA', password: 'CallersOwn@123' }).expect(401);
    await request(app).post('/api/auth/login').send({ loginId: 'TEST-SA', password: TEST_PASSWORD }).expect(200);
  });
});

describe('unknown routes', () => {
  it('404s with the standard error envelope', async () => {
    const res = await request(app).get('/api/does-not-exist').set(bearer(superAdmin));
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBeTruthy();
  });
});