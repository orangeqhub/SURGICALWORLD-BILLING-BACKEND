import type { Request } from 'express';
import { Setting } from '../models';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { AppError } from '../utils/AppError';

export async function upsertSetting(req: Request, key: string, value: string): Promise<Setting> {
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.BRANCH_ADMIN) {
    throw AppError.forbidden('Only admins can change settings.');
  }
  const [setting] = await Setting.upsert({ key, value } as never);
  return setting;
}
