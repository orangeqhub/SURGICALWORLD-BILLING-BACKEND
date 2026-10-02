import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * 001 - foundation: branches, categories, users, products, customers, suppliers
 * and per-branch stock.
 *
 * Field names and enum values follow the frontend contract:
 *   branches   <- schema.ts branches_cache
 *   users      <- schema.ts verified_users (loginId credential, nullable branchId)
 *   products   <- schema.ts products + productProfileStore extended fields,
 *                 including the new discount_percent DECIMAL(5,2) DEFAULT 0
 *   customers  <- schema.ts customers + customerProfileStore opening balance
 *   suppliers  <- schema.ts suppliers + supplierProfileStore opening balance
 *
 * Note on ids: DataTypes.UUIDV4 renders as PostgreSQL's gen_random_uuid(),
 * which is built into core from PG13 onward (no pgcrypto extension required).
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  const qi = context;

  await qi.createTable('branches', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    address: { type: DataTypes.TEXT, allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    gst: { type: DataTypes.STRING(50), allowNull: true },
    manager: { type: DataTypes.STRING(150), allowNull: true },
    opening: { type: DataTypes.STRING(20), allowNull: true },
    closing: { type: DataTypes.STRING(20), allowNull: true },
    status: { type: DataTypes.ENUM('Active', 'Inactive'), allowNull: false, defaultValue: 'Active' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await qi.createTable('categories', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await qi.createTable('users', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    // Exactly the three roles the frontend defines (constants/roles.js).
    role: { type: DataTypes.ENUM('SUPER_ADMIN', 'BRANCH_ADMIN', 'EMPLOYEE'), allowNull: false },
    // Nullable by design: SUPER_ADMIN has branch_id = NULL, which is what makes
    // them global rather than branch-scoped.
    branch_id: { type: DataTypes.UUID, allowNull: true },
    // The frontend logs in with a loginId that is not an email
    // (e.g. 'SA-001', 'BA-001', 'EMP-001'), so login_id is the credential key.
    login_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    employee_id: { type: DataTypes.STRING(100), allowNull: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('users', ['branch_id'], { name: 'users_branch_id_idx' });
  // A Branch Admin or Employee must belong to a branch; a Super Admin must not.
  await qi.sequelize.query(`
    ALTER TABLE users
      ADD CONSTRAINT users_branch_required_by_role
      CHECK (
        (role = 'SUPER_ADMIN' AND branch_id IS NULL)
        OR (role IN ('BRANCH_ADMIN', 'EMPLOYEE') AND branch_id IS NOT NULL)
      )
  `);

  await qi.createTable('products', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(200), allowNull: false },
    code: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    barcode: { type: DataTypes.STRING(100), allowNull: true },
    category_id: { type: DataTypes.UUID, allowNull: true },
    mrp: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    cut_off_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    selling_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    purchase_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    // Requirement 1: DECIMAL(5,2), default 0, constrained to 0..100 so a
    // product with no discount reads back as exactly 0.
    discount_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    gst: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Pcs' },
    min_stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_stock: { type: DataTypes.INTEGER, allowNull: true },
    batch: { type: DataTypes.STRING(100), allowNull: true },
    hsn: { type: DataTypes.STRING(50), allowNull: true },
    mfg_date: { type: DataTypes.STRING(50), allowNull: true },
    expiry_date: { type: DataTypes.STRING(50), allowNull: true },
    brand: { type: DataTypes.STRING(100), allowNull: true },
    subcategory: { type: DataTypes.STRING(100), allowNull: true },
    manufacturer: { type: DataTypes.STRING(150), allowNull: true },
    supplier: { type: DataTypes.STRING(150), allowNull: true },
    batch_tracking_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    expiry_tracking_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Active' },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  // NULLs are distinct in PostgreSQL, so many products may have no barcode.
  await qi.addIndex('products', ['barcode'], { name: 'products_barcode_unique', unique: true });
  await qi.addIndex('products', ['name'], { name: 'products_name_idx' });
  await qi.sequelize.query(`
    ALTER TABLE products
      ADD CONSTRAINT products_discount_percent_range
      CHECK (discount_percent >= 0 AND discount_percent <= 100)
  `);
  await qi.sequelize.query(`
    ALTER TABLE products
      ADD CONSTRAINT products_gst_range
      CHECK (gst >= 0 AND gst <= 100)
  `);

  await qi.createTable('customers', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    local_id: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    mobile: { type: DataTypes.STRING(50), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    gst: { type: DataTypes.STRING(50), allowNull: true },
    doctor: { type: DataTypes.STRING(150), allowNull: true },
    type: {
      type: DataTypes.ENUM('RETAIL', 'WHOLESALE', 'HOSPITAL', 'CLINIC', 'DISTRIBUTOR'),
      allowNull: false,
      defaultValue: 'RETAIL',
    },
    customer_code: { type: DataTypes.STRING(50), allowNull: true },
    credit_limit: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    opening_balance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    opening_balance_type: { type: DataTypes.ENUM('DEBIT', 'CREDIT'), allowNull: false, defaultValue: 'DEBIT' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Active' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('customers', ['branch_id', 'name'], { name: 'customers_branch_name_idx' });
  await qi.addIndex('customers', ['mobile'], { name: 'customers_mobile_idx' });

  await qi.createTable('suppliers', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    local_id: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    mobile: { type: DataTypes.STRING(50), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    gst: { type: DataTypes.STRING(50), allowNull: true },
    supplier_code: { type: DataTypes.STRING(50), allowNull: true },
    opening_balance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    opening_balance_type: { type: DataTypes.ENUM('DEBIT', 'CREDIT'), allowNull: false, defaultValue: 'DEBIT' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Active' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('suppliers', ['branch_id', 'name'], { name: 'suppliers_branch_name_idx' });

  await qi.createTable('branch_stock', {
    branch_id: { type: DataTypes.UUID, primaryKey: true },
    product_id: { type: DataTypes.UUID, primaryKey: true },
    // Never negative: the row lock inside a sale is the first line of defence,
    // this CHECK is the hard backstop.
    available: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'),
      allowNull: false,
      defaultValue: 'IN_STOCK',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.sequelize.query(`ALTER TABLE branch_stock ADD CONSTRAINT branch_stock_available_non_negative CHECK (available >= 0)`);

  // Foreign keys are added after all referenced tables exist.
  await qi.addConstraint('users', {
    fields: ['branch_id'],
    type: 'foreign key',
    name: 'users_branch_id_fkey',
    references: { table: 'branches', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
  await qi.addConstraint('products', {
    fields: ['category_id'],
    type: 'foreign key',
    name: 'products_category_id_fkey',
    references: { table: 'categories', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  });
  await qi.addConstraint('customers', {
    fields: ['branch_id'],
    type: 'foreign key',
    name: 'customers_branch_id_fkey',
    references: { table: 'branches', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
  await qi.addConstraint('suppliers', {
    fields: ['branch_id'],
    type: 'foreign key',
    name: 'suppliers_branch_id_fkey',
    references: { table: 'branches', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
  await qi.addConstraint('branch_stock', {
    fields: ['branch_id'],
    type: 'foreign key',
    name: 'branch_stock_branch_id_fkey',
    references: { table: 'branches', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
  await qi.addConstraint('branch_stock', {
    fields: ['product_id'],
    type: 'foreign key',
    name: 'branch_stock_product_id_fkey',
    references: { table: 'products', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.dropTable('branch_stock');
  await context.dropTable('suppliers');
  await context.dropTable('customers');
  await context.dropTable('products');
  await context.dropTable('users');
  await context.dropTable('categories');
  await context.dropTable('branches');

  // DROP TABLE leaves the enum types behind; drop them so `up` can be re-run.
  await context.sequelize.query('DROP TYPE IF EXISTS enum_branches_status');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_users_role');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_users_status');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_customers_type');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_customers_opening_balance_type');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_suppliers_opening_balance_type');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_branch_stock_status');
}