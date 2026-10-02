import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Sequelize, type QueryInterface } from 'sequelize';
import { Umzug, SequelizeStorage, type MigrationFn } from 'umzug';
import { env, isTest } from '../config/env';
import { buildConfig } from '../config/sequelizeConfig';
import { logError, logInfo } from '../config/logger';

export const MIGRATIONS_PATH = join(__dirname, 'migrations');

/**
 * Umzug + SequelizeStorage tracks applied migrations in a `SequelizeMeta`
 * table, so `npm run db:migrate` is idempotent and safe to re-run.
 *
 * The resolver returns `{ name, up, down }` (not the result of calling `up`):
 * Umzug invokes up/down itself and is what decides whether to run `down`.
 */
export function createMigrationRunner(sequelize: Sequelize): Umzug<QueryInterface> {
  return new Umzug<QueryInterface>({
    migrations: {
      glob: ['migrations/*.{ts,js}', { cwd: __dirname }],
      resolve: ({ name, path }) => {
        if (!path) throw new Error(`Migration "${name}" was globbed without a file path.`);
        // Required lazily so each migration module is only evaluated when it runs.
        const mod = require(path) as { up: MigrationFn<QueryInterface>; down: MigrationFn<QueryInterface> };
        return { name, path, up: mod.up, down: mod.down };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize, tableName: 'SequelizeMeta' }),
    logger: {
      // Umzug's LogFn receives an object, not a string, so it has to be
      // formatted or every line prints as "[object Object]".
      info: (msg) => logInfo(`[migrate] ${formatLog(msg)}`),
      warn: (msg) => logWarn(`[migrate] ${formatLog(msg)}`),
      error: (msg) => logError(`[migrate] ${formatLog(msg)}`),
      debug: () => undefined,
    },
  });
}

function formatLog(msg: Record<string, unknown>): string {
  return Object.entries(msg)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
}

function logWarn(message: string): void {
  console.warn(`[migrate] ${message}`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';
  const sequelize = new Sequelize(buildConfig({ database: isTest ? env.DB_NAME_TEST : env.DB_NAME }, env));

  try {
    const umzug = createMigrationRunner(sequelize);
    const available = readdirSync(MIGRATIONS_PATH)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .sort();
    logInfo(`Database: ${isTest ? env.DB_NAME_TEST : env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT ?? 5432}`);
    logInfo(`Available migrations (${available.length}): ${available.join(', ') || '(none)'}`);

    switch (command) {
      case 'up': {
        const applied = await umzug.up();
        logInfo(`Applied ${applied.length} migration(s).`);
        break;
      }
      case 'down': {
        const reverted = await umzug.down();
        logInfo(`Reverted ${reverted.length} migration(s).`);
        break;
      }
      case 'status': {
        const executed = await umzug.executed();
        const pending = await umzug.pending();
        logInfo(`Executed (${executed.length}):`);
        for (const item of executed) logInfo(`  [x] ${item.name}`);
        logInfo(`Pending (${pending.length}):`);
        for (const item of pending) logInfo(`  [ ] ${item.name}`);
        break;
      }
      default:
        logError(`Unknown command "${command}". Use: up | down | status`);
        process.exitCode = 1;
    }
  } catch (error) {
    logError(`Migration "${command}" failed`, { message: (error as Error).message });
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  void main();
}