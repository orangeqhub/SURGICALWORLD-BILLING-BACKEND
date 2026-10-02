import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * 005 - operations: crm_notes, crm_follow_ups, attendance, payroll,
 * sales_targets, expenses, receipts, supplier_payments.
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  const qi = context;

  await qi.createTable('crm_notes', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: false },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('crm_notes', ['customer_id'], { name: 'crm_notes_customer_id_idx' });
  await qi.addConstraint('crm_notes', {
    fields: ['branch_id'], type: 'foreign key', name: 'crm_notes_branch_id_fkey',
    references: { table: 'branches', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });
  await qi.addConstraint('crm_notes', {
    fields: ['customer_id'], type: 'foreign key', name: 'crm_notes_customer_id_fkey',
    references: { table: 'customers', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
  });

  await qi.createTable('crm_follow_ups', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    customer_name: { type: DataTypes.STRING(200), allowNull: true },
    assigned_to: { type: DataTypes.UUID, allowNull: true },
    follow_up_date: { type: DataTypes.STRING(10), allowNull: false },
    follow_up_time: { type: DataTypes.STRING(5), allowNull: true },
    next_follow_up_date: { type: DataTypes.STRING(10), allowNull: true },
    status: {
      type: DataTypes.ENUM('PENDING', 'FOLLOWING', 'COMPLETED', 'CANCELLED'),
      allowNull: false, defaultValue: 'PENDING',
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
    history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    created_by_name: { type: DataTypes.STRING(200), allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('crm_follow_ups', ['branch_id', 'follow_up_date'], { name: 'crm_follow_ups_branch_date_idx' });
  await qi.addIndex('crm_follow_ups', ['customer_id'], { name: 'crm_follow_ups_customer_id_idx' });
  await qi.addConstraint('crm_follow_ups', {
    fields: ['branch_id'], type: 'foreign key', name: 'crm_follow_ups_branch_id_fkey',
    references: { table: 'branches', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });
  await qi.addConstraint('crm_follow_ups', {
    fields: ['customer_id'], type: 'foreign key', name: 'crm_follow_ups_customer_id_fkey',
    references: { table: 'customers', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });

  await qi.createTable('attendance', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    employee_name: { type: DataTypes.STRING(150), allowNull: true },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.STRING(10), allowNull: false },
    status: {
      type: DataTypes.ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY'),
      allowNull: false, defaultValue: 'PRESENT',
    },
    check_in_time: { type: DataTypes.STRING(5), allowNull: true },
    check_out_time: { type: DataTypes.STRING(5), allowNull: true },
    working_hours: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('attendance', ['employee_id', 'date'], { unique: true, name: 'attendance_employee_date_unique' });
  await qi.addIndex('attendance', ['branch_id', 'date'], { name: 'attendance_branch_date_idx' });
  await qi.addConstraint('attendance', {
    fields: ['employee_id'], type: 'foreign key', name: 'attendance_employee_id_fkey',
    references: { table: 'users', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });
  await qi.addConstraint('attendance', {
    fields: ['branch_id'], type: 'foreign key', name: 'attendance_branch_id_fkey',
    references: { table: 'branches', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });

  await qi.createTable('payroll', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    employee_name: { type: DataTypes.STRING(150), allowNull: true },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    month: { type: DataTypes.STRING(7), allowNull: false },
    basic_salary: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    allowances: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    bonus: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    deductions: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    advance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    present_days: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    absent_days: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    half_days: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    leave_days: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    working_days: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    per_day_rate: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    attendance_deduction: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    gross_salary: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    net_salary: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    payment_status: { type: DataTypes.ENUM('PENDING', 'PAID'), allowNull: false, defaultValue: 'PENDING' },
    payment_date: { type: DataTypes.DATE, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('payroll', ['employee_id', 'month'], { unique: true, name: 'payroll_employee_month_unique' });
  await qi.addIndex('payroll', ['branch_id', 'month'], { name: 'payroll_branch_month_idx' });
  await qi.addConstraint('payroll', {
    fields: ['employee_id'], type: 'foreign key', name: 'payroll_employee_id_fkey',
    references: { table: 'users', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });
  await qi.addConstraint('payroll', {
    fields: ['branch_id'], type: 'foreign key', name: 'payroll_branch_id_fkey',
    references: { table: 'branches', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });

  await qi.createTable('sales_targets', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    employee_id: { type: DataTypes.UUID, allowNull: true },
    period_type: {
      type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM'),
      allowNull: false, defaultValue: 'MONTHLY',
    },
    target_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    start_date: { type: DataTypes.STRING(10), allowNull: false },
    end_date: { type: DataTypes.STRING(10), allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE', 'CANCELLED'), allowNull: false, defaultValue: 'ACTIVE' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by_name: { type: DataTypes.STRING(200), allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('sales_targets', ['branch_id', 'status'], { name: 'sales_targets_branch_status_idx' });

  await qi.createTable('expenses', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.STRING(10), allowNull: false },
    category: { type: DataTypes.STRING(100), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    payment_method: { type: DataTypes.STRING(50), allowNull: true },
    reference: { type: DataTypes.STRING(150), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('expenses', ['branch_id', 'date'], { name: 'expenses_branch_date_idx' });
  await qi.addConstraint('expenses', {
    fields: ['branch_id'], type: 'foreign key', name: 'expenses_branch_id_fkey',
    references: { table: 'branches', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });

  await qi.createTable('receipts', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    customer_id: { type: DataTypes.UUID, allowNull: true },
    customer_name: { type: DataTypes.STRING(200), allowNull: true },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    method: { type: DataTypes.STRING(50), allowNull: false },
    reference: { type: DataTypes.STRING(150), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'RECORDED' },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('receipts', ['branch_id'], { name: 'receipts_branch_id_idx' });
  await qi.addConstraint('receipts', {
    fields: ['branch_id'], type: 'foreign key', name: 'receipts_branch_id_fkey',
    references: { table: 'branches', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });

  await qi.createTable('supplier_payments', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    supplier_id: { type: DataTypes.UUID, allowNull: true },
    supplier_name: { type: DataTypes.STRING(200), allowNull: true },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    method: { type: DataTypes.STRING(50), allowNull: true },
    reference: { type: DataTypes.STRING(150), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'RECORDED' },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('supplier_payments', ['branch_id'], { name: 'supplier_payments_branch_id_idx' });
  await qi.addConstraint('supplier_payments', {
    fields: ['branch_id'], type: 'foreign key', name: 'supplier_payments_branch_id_fkey',
    references: { table: 'branches', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.dropTable('supplier_payments');
  await context.dropTable('receipts');
  await context.dropTable('expenses');
  await context.dropTable('sales_targets');
  await context.dropTable('payroll');
  await context.dropTable('attendance');
  await context.dropTable('crm_follow_ups');
  await context.dropTable('crm_notes');

  await context.sequelize.query('DROP TYPE IF EXISTS enum_crm_follow_ups_status');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_attendance_status');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_payroll_payment_status');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_sales_targets_period_type');
  await context.sequelize.query('DROP TYPE IF EXISTS enum_sales_targets_status');
}
