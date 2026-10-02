import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * 004 – extend `purchases` and `purchase_items` with the full set of columns
 * required by the Phase 8 purchase receipt flow.
 *
 * Existing minimal rows keep their values; every new column is nullable or has
 * a sensible DEFAULT so the migration is non-destructive.
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  const qi = context;

  // ── purchases ────────────────────────────────────────────────────────────
  await qi.addColumn('purchases', 'purchase_number', { type: DataTypes.STRING(100), allowNull: true });
  await qi.addColumn('purchases', 'supplier_invoice_number', { type: DataTypes.STRING(150), allowNull: true });
  await qi.addColumn('purchases', 'purchase_type', { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CREDIT' });
  await qi.addColumn('purchases', 'tax_type', { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INTRA' });
  await qi.addColumn('purchases', 'subtotal', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'product_discounts', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'invoice_discount', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'taxable_amount', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'cgst', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'sgst', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'igst', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'other_charges', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'round_off', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'net_amount', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'paid_amount', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'balance_amount', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchases', 'notes', { type: DataTypes.TEXT, allowNull: true });
  await qi.addColumn('purchases', 'created_by', { type: DataTypes.UUID, allowNull: true });

  await qi.addConstraint('purchases', {
    fields: ['purchase_number'],
    type: 'unique',
    name: 'purchases_purchase_number_unique',
  });
  await qi.addConstraint('purchases', {
    fields: ['created_by'],
    type: 'foreign key',
    name: 'purchases_created_by_fkey',
    references: { table: 'users', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  });

  // ── purchase_items ────────────────────────────────────────────────────────
  await qi.addColumn('purchase_items', 'sku_snapshot', { type: DataTypes.STRING(100), allowNull: true });
  await qi.addColumn('purchase_items', 'hsn_snapshot', { type: DataTypes.STRING(100), allowNull: true });
  await qi.addColumn('purchase_items', 'free_quantity', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchase_items', 'selling_price_snapshot', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchase_items', 'mrp_snapshot', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchase_items', 'batch_number', { type: DataTypes.STRING(100), allowNull: true });
  await qi.addColumn('purchase_items', 'mfg_date', { type: DataTypes.DATEONLY, allowNull: true });
  await qi.addColumn('purchase_items', 'expiry_date', { type: DataTypes.DATEONLY, allowNull: true });
  await qi.addColumn('purchase_items', 'unit', { type: DataTypes.STRING(30), allowNull: true });
  await qi.addColumn('purchase_items', 'cgst', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchase_items', 'sgst', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchase_items', 'igst', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
  await qi.addColumn('purchase_items', 'adjusted_taxable', { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  const qi = context;

  // Remove purchase_items columns
  for (const col of ['adjusted_taxable', 'igst', 'sgst', 'cgst', 'unit', 'expiry_date', 'mfg_date', 'batch_number', 'mrp_snapshot', 'selling_price_snapshot', 'free_quantity', 'hsn_snapshot', 'sku_snapshot']) {
    await qi.removeColumn('purchase_items', col);
  }

  // Remove purchases constraints then columns
  await qi.removeConstraint('purchases', 'purchases_created_by_fkey');
  await qi.removeConstraint('purchases', 'purchases_purchase_number_unique');

  for (const col of ['created_by', 'notes', 'balance_amount', 'paid_amount', 'net_amount', 'round_off', 'other_charges', 'igst', 'sgst', 'cgst', 'taxable_amount', 'invoice_discount', 'product_discounts', 'subtotal', 'tax_type', 'purchase_type', 'supplier_invoice_number', 'purchase_number']) {
    await qi.removeColumn('purchases', col);
  }
}
