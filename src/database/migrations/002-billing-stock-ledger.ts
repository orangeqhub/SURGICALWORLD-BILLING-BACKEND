import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * 002 - billing, purchasing, stock movements, batches, transfers and ledger.
 *
 * Every monetary column is DECIMAL(14,2); every discount/gst percentage column
 * is DECIMAL(5,2). No float columns anywhere.
 *
 * Invoice / invoice_item carry a full price+discount+GST snapshot so a posted
 * invoice is never re-derived from the current products row.
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  const qi = context;

  await qi.createTable('stock_batches', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    product_id: { type: DataTypes.UUID, allowNull: false },
    batch_number: { type: DataTypes.STRING(100), allowNull: false },
    mfg_date: { type: DataTypes.STRING(50) },
    expiry_date: { type: DataTypes.STRING(50) },
    available: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // EXPIRED / BLOCKED / DEPLETED are the frontend's unsellable batch states
    // (context/BillingContext.js UNSELLABLE_BATCH_STATUSES).
    status: { type: DataTypes.ENUM('ACTIVE', 'EXPIRED', 'BLOCKED', 'DEPLETED'), allowNull: false, defaultValue: 'ACTIVE' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('stock_batches', ['branch_id', 'product_id'], { name: 'stock_batches_branch_product_idx' });
  await qi.addIndex('stock_batches', ['branch_id', 'product_id', 'batch_number'], {
    name: 'stock_batches_unique_batch',
    unique: true,
  });
  await qi.sequelize.query(`ALTER TABLE stock_batches ADD CONSTRAINT stock_batches_available_non_negative CHECK (available >= 0)`);

  await qi.createTable('invoices', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    // Client-generated idempotency key (frontend invoices.localId is UNIQUE and
    // completeBill() returns the existing row on a duplicate submit).
    local_id: { type: DataTypes.STRING(100), unique: true },
    invoice_number: { type: DataTypes.STRING(100), allowNull: false },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    customer_id: { type: DataTypes.UUID },
    employee_id: { type: DataTypes.UUID },
    created_by: { type: DataTypes.UUID },
    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    item_discount_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    discount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    // PCT / AMT, mirroring frontend utils/discountAllocation.js DISCOUNT_TYPES.
    discount_type: { type: DataTypes.ENUM('PCT', 'AMT'), allowNull: false, defaultValue: 'AMT' },
    discount_value: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    gst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    grand_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    paid_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    payment_status: { type: DataTypes.ENUM('PAID', 'PARTIAL', 'CREDIT'), allowNull: false, defaultValue: 'PAID' },
    is_held: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    invoice_date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('invoices', ['branch_id', 'invoice_date'], { name: 'invoices_branch_date_idx' });
  await qi.addIndex('invoices', ['customer_id'], { name: 'invoices_customer_idx' });

  await qi.createTable('invoice_items', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    product_id: { type: DataTypes.UUID },
    batch_id: { type: DataTypes.UUID },
    name: { type: DataTypes.STRING(200), allowNull: false },
    unit: { type: DataTypes.STRING(20) },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    // --- sale-time snapshot ---
    selling_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    discount_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    gross_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    discount_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    net_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    allocated_invoice_discount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    adjusted_taxable: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    line_gst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    effective_unit_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    cut_off_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('invoice_items', ['invoice_id'], { name: 'invoice_items_invoice_idx' });
  await qi.sequelize.query(`
    ALTER TABLE invoice_items
      ADD CONSTRAINT invoice_items_discount_percent_range
      CHECK (discount_percent >= 0 AND discount_percent <= 100)
  `);
  await qi.sequelize.query(`ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_quantity_positive CHECK (quantity > 0)`);

  await qi.createTable('payments', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    method: {
      type: DataTypes.ENUM('CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'CHEQUE'),
      allowNull: false,
    },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    reference: { type: DataTypes.STRING(150) },
    note: { type: DataTypes.TEXT },
    created_by: { type: DataTypes.UUID },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('payments', ['invoice_id'], { name: 'payments_invoice_idx' });
  await qi.addIndex('payments', ['branch_id'], { name: 'payments_branch_idx' });

  await qi.createTable('purchases', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    local_id: { type: DataTypes.STRING(100), unique: true },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    supplier_id: { type: DataTypes.UUID, allowNull: false },
    invoice_number: { type: DataTypes.STRING(100) },
    total_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('RECEIVED', 'CANCELLED'), allowNull: false, defaultValue: 'RECEIVED' },
    purchase_date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('purchases', ['branch_id', 'purchase_date'], { name: 'purchases_branch_date_idx' });

  await qi.createTable('purchase_items', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    purchase_id: { type: DataTypes.UUID, allowNull: false },
    product_id: { type: DataTypes.UUID },
    name: { type: DataTypes.STRING(200), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    purchase_price: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    discount_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    discount_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    net_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    line_gst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    line_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('purchase_items', ['purchase_id'], { name: 'purchase_items_purchase_idx' });

  await qi.createTable('stock_movements', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    product_id: { type: DataTypes.UUID, allowNull: false },
    batch_id: { type: DataTypes.UUID },
    // Signed: negative = stock out, positive = stock in.
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    type: {
      type: DataTypes.ENUM('SALE', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'SALE_RETURN', 'PURCHASE_RETURN'),
      allowNull: false,
    },
    reference_type: { type: DataTypes.STRING(50) },
    reference_id: { type: DataTypes.UUID },
    note: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('stock_movements', ['branch_id', 'product_id'], { name: 'stock_movements_branch_product_idx' });
  await qi.addIndex('stock_movements', ['reference_type', 'reference_id'], { name: 'stock_movements_reference_idx' });

  await qi.createTable('stock_transfers', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    local_id: { type: DataTypes.STRING(100), unique: true },
    transfer_number: { type: DataTypes.STRING(100), allowNull: false },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    from_branch_id: { type: DataTypes.UUID, allowNull: false },
    to_branch_id: { type: DataTypes.UUID, allowNull: false },
    // CANONICAL 8-value state machine (services/transferService.ts + constants/enums.ts):
    //   DRAFT -> PENDING_APPROVAL -> APPROVED -> DISPATCHED -> [PARTIALLY_RECEIVED] -> RECEIVED
    //   PENDING_APPROVAL -> REJECTED ;  DRAFT|PENDING_APPROVAL|APPROVED -> CANCELLED
    // The legacy simple-transfer values PENDING / IN_TRANSIT / COMPLETED are
    // translated at the service boundary and are deliberately absent here so a
    // single, unambiguous state machine is enforced by the database.
    status: {
      type: DataTypes.ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
    transfer_date: { type: DataTypes.STRING(20), allowNull: false },
    // requested_by (Branch Admin) and approved_by (Super Admin) are separate
    // columns so approving never overwrites the original requester.
    requested_by: { type: DataTypes.UUID },
    approved_by: { type: DataTypes.UUID },
    approved_at: { type: DataTypes.DATE },
    rejected_by: { type: DataTypes.UUID },
    rejected_at: { type: DataTypes.DATE },
    rejection_reason: { type: DataTypes.TEXT },
    dispatch_date: { type: DataTypes.STRING(20) },
    received_date: { type: DataTypes.STRING(20) },
    remarks: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('stock_transfers', ['from_branch_id'], { name: 'stock_transfers_from_branch_idx' });
  await qi.addIndex('stock_transfers', ['to_branch_id'], { name: 'stock_transfers_to_branch_idx' });
  await qi.addIndex('stock_transfers', ['status'], { name: 'stock_transfers_status_idx' });
  await qi.sequelize.query(`
    ALTER TABLE stock_transfers
      ADD CONSTRAINT stock_transfers_distinct_branches
      CHECK (from_branch_id <> to_branch_id)
  `);
  // An approval can only ever exist together with the approver's id and time.
  await qi.sequelize.query(`
    ALTER TABLE stock_transfers
      ADD CONSTRAINT stock_transfers_approval_complete
      CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
  `);

  await qi.createTable('stock_transfer_items', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    transfer_id: { type: DataTypes.UUID, allowNull: false },
    product_id: { type: DataTypes.UUID },
    batch_id: { type: DataTypes.UUID },
    batch_number: { type: DataTypes.STRING(100) },
    expiry_date: { type: DataTypes.STRING(50) },
    transfer_qty: { type: DataTypes.INTEGER, allowNull: false },
    received_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    damaged_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    remarks: { type: DataTypes.STRING(255) },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('stock_transfer_items', ['transfer_id'], { name: 'stock_transfer_items_transfer_idx' });
  await qi.sequelize.query(`
    ALTER TABLE stock_transfer_items
      ADD CONSTRAINT stock_transfer_items_receipt_bounds
      CHECK (received_qty >= 0 AND damaged_qty >= 0 AND received_qty + damaged_qty <= transfer_qty)
  `);

  await qi.createTable('ledger_entries', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    party_type: { type: DataTypes.ENUM('CUSTOMER', 'SUPPLIER'), allowNull: false },
    party_id: { type: DataTypes.UUID, allowNull: false },
    party_name: { type: DataTypes.STRING(200) },
    // DEBIT increases the party balance, CREDIT decreases it.
    type: { type: DataTypes.ENUM('DEBIT', 'CREDIT'), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    note: { type: DataTypes.TEXT },
    // INVOICE/PURCHASE/PAYMENT/RECEIPT are automatic; MANUAL/ADJUSTMENT are
    // admin-created (frontend LedgerEntryManager.jsx REFERENCE_TYPES).
    reference_type: {
      type: DataTypes.ENUM('INVOICE', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'ADJUSTMENT', 'MANUAL'),
      allowNull: false,
    },
    reference_id: { type: DataTypes.UUID },
    entry_date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_by: { type: DataTypes.UUID },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('ledger_entries', ['branch_id', 'party_type', 'party_id'], { name: 'ledger_entries_party_idx' });
  await qi.addIndex('ledger_entries', ['branch_id'], { name: 'ledger_entries_branch_idx' });
  await qi.addIndex('ledger_entries', ['entry_date'], { name: 'ledger_entries_date_idx' });
  // Partial unique index - de-duplicates automatic entries by reference while
  // leaving reference-less MANUAL entries free to repeat.
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX ledger_entries_reference_unique
      ON ledger_entries (reference_type, reference_id)
     WHERE reference_id IS NOT NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_amount_positive
      CHECK (amount > 0)
  `);

  await qi.createTable('app_settings', {
    key: { type: DataTypes.STRING(100), primaryKey: true },
    value: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // --- Foreign keys -----------------------------------------------------
  const fk = (table: string, column: string, name: string, refTable: string, onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL'): Promise<void> =>
    qi.addConstraint(table, {
      fields: [column],
      type: 'foreign key',
      name,
      references: { table: refTable, field: 'id' },
      onUpdate: 'CASCADE',
      onDelete,
    });

  await fk('stock_batches', 'branch_id', 'stock_batches_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('stock_batches', 'product_id', 'stock_batches_product_id_fkey', 'products', 'RESTRICT');

  await fk('invoices', 'branch_id', 'invoices_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('invoices', 'customer_id', 'invoices_customer_id_fkey', 'customers', 'SET NULL');
  await fk('invoices', 'employee_id', 'invoices_employee_id_fkey', 'users', 'SET NULL');
  await fk('invoices', 'created_by', 'invoices_created_by_fkey', 'users', 'SET NULL');

  await fk('invoice_items', 'invoice_id', 'invoice_items_invoice_id_fkey', 'invoices', 'CASCADE');
  await fk('invoice_items', 'product_id', 'invoice_items_product_id_fkey', 'products', 'SET NULL');
  await fk('invoice_items', 'batch_id', 'invoice_items_batch_id_fkey', 'stock_batches', 'SET NULL');

  await fk('payments', 'invoice_id', 'payments_invoice_id_fkey', 'invoices', 'CASCADE');
  await fk('payments', 'branch_id', 'payments_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('payments', 'created_by', 'payments_created_by_fkey', 'users', 'SET NULL');

  await fk('purchases', 'branch_id', 'purchases_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('purchases', 'supplier_id', 'purchases_supplier_id_fkey', 'suppliers', 'RESTRICT');
  await fk('purchase_items', 'purchase_id', 'purchase_items_purchase_id_fkey', 'purchases', 'CASCADE');
  await fk('purchase_items', 'product_id', 'purchase_items_product_id_fkey', 'products', 'SET NULL');

  await fk('stock_movements', 'branch_id', 'stock_movements_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('stock_movements', 'product_id', 'stock_movements_product_id_fkey', 'products', 'RESTRICT');
  await fk('stock_movements', 'batch_id', 'stock_movements_batch_id_fkey', 'stock_batches', 'SET NULL');

  await fk('stock_transfers', 'branch_id', 'stock_transfers_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('stock_transfers', 'from_branch_id', 'stock_transfers_from_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('stock_transfers', 'to_branch_id', 'stock_transfers_to_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('stock_transfers', 'requested_by', 'stock_transfers_requested_by_fkey', 'users', 'SET NULL');
  await fk('stock_transfers', 'approved_by', 'stock_transfers_approved_by_fkey', 'users', 'SET NULL');
  await fk('stock_transfers', 'rejected_by', 'stock_transfers_rejected_by_fkey', 'users', 'SET NULL');
  await fk('stock_transfer_items', 'transfer_id', 'stock_transfer_items_transfer_id_fkey', 'stock_transfers', 'CASCADE');
  await fk('stock_transfer_items', 'product_id', 'stock_transfer_items_product_id_fkey', 'products', 'SET NULL');
  await fk('stock_transfer_items', 'batch_id', 'stock_transfer_items_batch_id_fkey', 'stock_batches', 'SET NULL');

  await fk('ledger_entries', 'branch_id', 'ledger_entries_branch_id_fkey', 'branches', 'RESTRICT');
  await fk('ledger_entries', 'created_by', 'ledger_entries_created_by_fkey', 'users', 'SET NULL');
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.dropTable('app_settings');
  await context.dropTable('ledger_entries');
  await context.dropTable('stock_transfer_items');
  await context.dropTable('stock_transfers');
  await context.dropTable('stock_movements');
  await context.dropTable('purchase_items');
  await context.dropTable('purchases');
  await context.dropTable('payments');
  await context.dropTable('invoice_items');
  await context.dropTable('invoices');
  await context.dropTable('stock_batches');

  // DROP TABLE does NOT drop the enum types Sequelize created for ENUM columns,
  // so they must be removed explicitly or a re-run of `up` fails with
  // "type ... already exists" (this is what makes `npm run db:reset` repeatable).
  await context.sequelize.query('DROP TYPE IF EXISTS enum_ledger_entries_party_type');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_ledger_entries_type');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_ledger_entries_reference_type');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_invoices_status');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_invoices_payment_method');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_payments_method');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_purchases_status');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_stock_movements_movement_type');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_stock_transfers_status');
}