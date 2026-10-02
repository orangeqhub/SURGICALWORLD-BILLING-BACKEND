import type { Options } from 'sequelize';

/**
 * Single source of truth for database configuration, consumed by both the
 * running application (src/config/database.ts) and the migration runner
 * (src/database/migrate.ts). Migrations can therefore never drift from the
 * connection the app actually uses.
 */
export interface DatabaseConfig extends Options {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export function buildConfig(
  overrides: Partial<DatabaseConfig> = {},
  env: {
    DB_HOST: string;
    DB_PORT: number;
    DB_NAME: string;
    DB_USER: string;
    DB_PASSWORD: string;
    DB_LOGGING: boolean;
  },
): DatabaseConfig {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    dialect: 'postgres',
    // Server-authoritative financial values: DECIMAL columns are returned as
    // strings by pg so no IEEE-754 rounding is ever introduced by the driver.
    // src/utils/money.ts parses them into Decimal.js for arithmetic.
    dialectOptions: {
      decimalNumbers: false,
    },
    define: {
      underscored: true,
      freezeTableName: true,
      timestamps: true,
    },
    logging: env.DB_LOGGING ? (sql: string) => console.log(sql) : false,
    pool: { max: 10, min: 0, idle: 10_000, acquire: 30_000 },
    ...overrides,
  };
}

export default buildConfig;