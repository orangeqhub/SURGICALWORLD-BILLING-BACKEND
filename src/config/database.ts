import { Sequelize } from 'sequelize';
import { env, isTest } from './env';
import { buildConfig } from './sequelizeConfig';

export const sequelize = new Sequelize(buildConfig({ database: isTest ? env.DB_NAME_TEST : env.DB_NAME }, env));

/**
 * Verifies connectivity at boot so a misconfigured database fails fast and
 * loudly at startup instead of on the first request.
 */
export async function assertDatabaseConnection(): Promise<void> {
  await sequelize.authenticate();
}