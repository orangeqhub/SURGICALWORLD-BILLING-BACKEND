import { QueryInterface, Sequelize } from 'sequelize';
import { Umzug, SequelizeStorage } from 'umzug';
import { buildConfig } from '../src/config/sequelizeConfig';

/**
 * Runs the migrations once against the TEST database before the suite starts.
 *
 * The test database is rebuilt from scratch so a stale schema can never make a
 * run pass or fail for the wrong reason. Migrations are the single source of
 * truth for the schema - `sequelize.sync()` is deliberately never used.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
  }
  // import env AFTER NODE_ENV is set so config/env.ts picks the test database.
  const { env } = await import('../src/config/env');

  const sequelize = new Sequelize(buildConfig({ database: env.DB_NAME_TEST }, env));

  // Reset the schema so a run never inherits stale objects.
  await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

  const runner = new Umzug<QueryInterface>({
    migrations: {
      glob: ['migrations/*.{ts,js}', { cwd: `${__dirname}/../src/database` }],
      resolve: ({ name, path }) => {
        if (!path) throw new Error(`Migration "${name}" has no path.`);
        const mod = require(path) as {
          up: (p: { context: QueryInterface }) => Promise<void>;
          down: (p: { context: QueryInterface }) => Promise<void>;
        };
        return { name, path, up: mod.up, down: mod.down };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize, tableName: 'SequelizeMeta' }),
    logger: undefined,
  });

  // The connection must stay open for the whole run: SequelizeStorage.syncModel
  // needs it to create/verify SequelizeMeta.
  await runner.up();
  await seedTestData();
  await sequelize.close();
}

/** Creates the two branches and three users the integration tests rely on. */
async function seedTestData(): Promise<void> {
  const { sequelize } = await import('../src/config/database');
  const { defineModels, Branch, User, Product, Category } = await import('../src/models');
  const { hashPassword } = await import('../src/services/passwordService');

  defineModels(sequelize);

  const branchA = await Branch.create({ code: 'T-A', name: 'Test Branch A', status: 'Active' });
  const branchB = await Branch.create({ code: 'T-B', name: 'Test Branch B', status: 'Active' });

  const password = await hashPassword('Test@1234');
  await User.bulkCreate([
    {
      role: 'SUPER_ADMIN',
      branchId: null,
      loginId: 'TEST-SA',
      name: 'Test Super Admin',
      passwordHash: password,
      permissions: [],
      status: 'active',
    },
    {
      role: 'BRANCH_ADMIN',
      branchId: branchA.id,
      loginId: 'TEST-BA',
      name: 'Test Branch Admin',
      passwordHash: password,
      permissions: [],
      status: 'active',
    },
    {
      role: 'EMPLOYEE',
      branchId: branchA.id,
      loginId: 'TEST-EMP',
      name: 'Test Employee',
      passwordHash: password,
      permissions: ['BILLING'],
      status: 'active',
    },
    {
      role: 'EMPLOYEE',
      branchId: branchA.id,
      loginId: 'TEST-INACTIVE',
      name: 'Test Inactive',
      passwordHash: password,
      permissions: [],
      status: 'inactive',
    },
  ]);

  const category = await Category.create({ name: 'Test Category' });
  await Product.create({
    name: 'Test Product',
    code: 'TEST-P1',
    discountPercent: 0,
    gst: 0,
    sellingPrice: 10,
    mrp: 10,
    cutOffPrice: 0,
    purchasePrice: 0,
    unit: 'Pcs',
    minStock: 0,
    batchTrackingEnabled: true,
    expiryTrackingEnabled: true,
    status: 'Active',
    categoryId: category.id,
  });

  await sequelize.close();
}