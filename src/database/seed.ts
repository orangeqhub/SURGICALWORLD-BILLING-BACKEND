import 'dotenv/config';
import { sequelize } from '../config/database';
import { defineModels, Branch, User, Category, Product, BranchStock, Customer, Supplier } from '../models';
import { hashPassword } from '../services/passwordService';
import { logError, logInfo } from '../config/logger';
import { ROLES } from '../constants/roles';
import { toSqlDecimal, Decimal } from '../utils/money';
import { ALL_PERMISSIONS } from '../constants/permissions';

/**
 * Development seeder. Idempotent: re-running updates nothing and creates no
 * duplicates, so it is safe against an already-seeded database.
 *
 * Credentials come from environment variables (see .env.example) and are never
 * hardcoded to a production value.
 */
async function seed(): Promise<void> {
  defineModels(sequelize);

  const superAdminLoginId = process.env.SEED_SUPER_ADMIN_LOGIN_ID ?? 'SA-001';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe@123';
  const superAdminName = process.env.SEED_SUPER_ADMIN_NAME ?? 'Super Admin';

  const branchCode = process.env.SEED_BRANCH_CODE ?? 'BR-001';
  const branchName = process.env.SEED_BRANCH_NAME ?? 'Main Branch';
  const branchAdminLoginId = process.env.SEED_BRANCH_ADMIN_LOGIN_ID ?? 'BA-001';
  const branchAdminPassword = process.env.SEED_BRANCH_ADMIN_PASSWORD ?? 'ChangeMe@123';
  const branchAdminName = process.env.SEED_BRANCH_ADMIN_NAME ?? 'Branch Admin';

  const employeeLoginId = process.env.SEED_EMPLOYEE_LOGIN_ID ?? 'EMP-001';
  const employeePassword = process.env.SEED_EMPLOYEE_PASSWORD ?? 'ChangeMe@123';
  const employeeName = process.env.SEED_EMPLOYEE_NAME ?? 'Sample Employee';

  await sequelize.transaction(async (transaction) => {
    // --- Branch ---------------------------------------------------------
    const [branch] = await Branch.findOrCreate({
      where: { code: branchCode },
      defaults: { code: branchCode, name: branchName, status: 'Active' },
      transaction,
    });

    // A second branch exists so branch-isolation behaviour can be exercised.
    const [otherBranch] = await Branch.findOrCreate({
      where: { code: 'BR-002' },
      defaults: { code: 'BR-002', name: 'Second Branch', status: 'Active' },
      transaction,
    });

    // --- Users ----------------------------------------------------------
    // SUPER_ADMIN has branchId = null (the users_branch_required_by_role CHECK
    // requires it), which is what makes them global rather than branch-scoped.
    const [superAdmin] = await User.findOrCreate({
      where: { loginId: superAdminLoginId },
      defaults: {
        role: ROLES.SUPER_ADMIN,
        branchId: null,
        loginId: superAdminLoginId,
        name: superAdminName,
        passwordHash: await hashPassword(superAdminPassword),
        permissions: [],
        status: 'active',
      },
      transaction,
    });

    const [branchAdmin] = await User.findOrCreate({
      where: { loginId: branchAdminLoginId },
      defaults: {
        role: ROLES.BRANCH_ADMIN,
        branchId: branch.id,
        loginId: branchAdminLoginId,
        name: branchAdminName,
        passwordHash: await hashPassword(branchAdminPassword),
        permissions: [],
        status: 'active',
      },
      transaction,
    });

    const [employee] = await User.findOrCreate({
      where: { loginId: employeeLoginId },
      defaults: {
        role: ROLES.EMPLOYEE,
        branchId: branch.id,
        loginId: employeeLoginId,
        employeeId: employeeLoginId,
        name: employeeName,
        passwordHash: await hashPassword(employeePassword),
        // A cashier-equivalent: billing + dashboard only.
        permissions: ['BILLING', 'HOLD_BILL', 'DASHBOARD_VIEW'],
        status: 'active',
      },
      transaction,
    });

    // --- Catalogue ------------------------------------------------------
    const [surgical] = await Category.findOrCreate({ where: { name: 'Surgical Instruments' }, defaults: { name: 'Surgical Instruments' }, transaction });
    const [consumable] = await Category.findOrCreate({ where: { name: 'Consumables' }, defaults: { name: 'Consumables' }, transaction });

    // discountPercent 10 on the first product, 0 (the pre-existing default) on
    // the others, so both paths are represented in a fresh database.
    const [scissors] = await Product.findOrCreate({
      where: { code: 'PRD-0001' },
      defaults: {
        name: 'Surgical Scissors',
        code: 'PRD-0001',
        barcode: '890000000001',
        categoryId: surgical.id,
        mrp: toSqlDecimal(new Decimal(120)),
        cutOffPrice: toSqlDecimal(new Decimal(70)),
        sellingPrice: toSqlDecimal(new Decimal(100)),
        purchasePrice: toSqlDecimal(new Decimal(60)),
        discountPercent: toSqlDecimal(new Decimal(10)),
        gst: toSqlDecimal(new Decimal(18)),
        unit: 'Pcs',
        minStock: 5,
        hsn: '9018',
        status: 'Active',
      },
      transaction,
    });

    const [gloves] = await Product.findOrCreate({
      where: { code: 'PRD-0002' },
      defaults: {
        name: 'Exam Gloves (Box)',
        code: 'PRD-0002',
        barcode: '890000000002',
        categoryId: consumable.id,
        mrp: toSqlDecimal(new Decimal(500)),
        cutOffPrice: toSqlDecimal(new Decimal(0)),
        sellingPrice: toSqlDecimal(new Decimal(450)),
        purchasePrice: toSqlDecimal(new Decimal(380)),
        discountPercent: toSqlDecimal(new Decimal(0)),
        gst: toSqlDecimal(new Decimal(5)),
        unit: 'Box',
        minStock: 10,
        hsn: '4015',
        status: 'Active',
      },
      transaction,
    });

    // --- Stock ----------------------------------------------------------
    for (const product of [scissors, gloves]) {
      for (const target of [branch, otherBranch]) {
        await BranchStock.findOrCreate({
          where: { branchId: target.id, productId: product.id },
          defaults: { branchId: target.id, productId: product.id, available: 100, minStock: 5, status: 'IN_STOCK' },
          transaction,
        });
      }
    }

    // --- Parties (one per branch, so cross-branch access can be tested) ----
    await Customer.findOrCreate({
      where: { branchId: branch.id, name: 'Walk-in Retail Customer' },
      defaults: {
        branchId: branch.id,
        name: 'Walk-in Retail Customer',
        mobile: '9000000001',
        type: 'RETAIL',
        openingBalance: toSqlDecimal(new Decimal(0)),
        openingBalanceType: 'DEBIT',
        status: 'Active',
      },
      transaction,
    });
    await Customer.findOrCreate({
      where: { branchId: otherBranch.id, name: 'Second Branch Customer' },
      defaults: { branchId: otherBranch.id, name: 'Second Branch Customer', type: 'RETAIL', status: 'Active' },
      transaction,
    });

    await Supplier.findOrCreate({
      where: { branchId: branch.id, name: 'Medline Supplies' },
      defaults: { branchId: branch.id, name: 'Medline Supplies', mobile: '9000000002', status: 'Active' },
      transaction,
    });
    await Supplier.findOrCreate({
      where: { branchId: otherBranch.id, name: 'Second Branch Supplier' },
      defaults: { branchId: otherBranch.id, name: 'Second Branch Supplier', status: 'Active' },
      transaction,
    });

    logInfo('Seed complete.', {
      branches: [branch.code, otherBranch.code],
      users: [
        `${superAdmin.role}:${superAdmin.loginId}`,
        `${branchAdmin.role}:${branchAdmin.loginId}`,
        `${employee.role}:${employee.loginId}`,
      ],
      products: [scissors.code, gloves.code],
      permissionsAvailable: ALL_PERMISSIONS.length,
    });
  });
}

seed()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logError('Seed failed', { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    await sequelize.close();
    process.exit(1);
  });