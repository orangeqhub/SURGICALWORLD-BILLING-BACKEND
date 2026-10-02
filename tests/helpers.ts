import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/config/database';
import { defineModels, Branch, User } from '../src/models';

/** Builds the app and binds models - the same wiring src/server.ts performs. */
export function buildTestApp(): Express {
  defineModels(sequelize);
  return createApp();
}

export const TEST_PASSWORD = 'Test@1234';

export interface Actor {
  token: string;
  id: string;
  role: string;
  branchId: string | null;
}

/** Logs in through the real endpoint so tokens come from the real code path. */
export async function loginAs(app: Express, loginId: string): Promise<Actor> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ loginId, password: TEST_PASSWORD });

  if (res.status !== 200) {
    throw new Error(`Login failed for ${loginId}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const row = await User.findOne({ where: { loginId } });
  return {
    token: res.body.data.token,
    id: row!.id,
    role: row!.role,
    branchId: row!.branchId,
  };
}

export async function getBranchIds(): Promise<{ branchA: string; branchB: string }> {
  const a = await Branch.findOne({ where: { code: 'T-A' } });
  const b = await Branch.findOne({ where: { code: 'T-B' } });
  if (!a || !b) throw new Error('Test branches are missing; globalSetup failed.');
  return { branchA: a.id, branchB: b.id };
}

export async function closeDatabase(): Promise<void> {
  await sequelize.close();
}