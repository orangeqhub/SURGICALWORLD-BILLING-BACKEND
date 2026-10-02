import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * 003 – add dispatched_by / dispatched_at / received_by / received_at to
 * stock_transfers.
 *
 * These four columns were absent from migration 002 but are required by the
 * Phase 6 transfer workflow: the service layer sets them when a transfer
 * transitions to DISPATCHED or RECEIVED so the audit trail is complete.
 *
 * Foreign keys to users(id) are nullable with ON DELETE SET NULL so that
 * deleting a user does not cascade into transfer history.
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  const qi = context;

  await qi.addColumn('stock_transfers', 'dispatched_by', {
    type: DataTypes.UUID,
    allowNull: true,
  });
  await qi.addColumn('stock_transfers', 'dispatched_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await qi.addColumn('stock_transfers', 'received_by', {
    type: DataTypes.UUID,
    allowNull: true,
  });
  await qi.addColumn('stock_transfers', 'received_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await qi.addConstraint('stock_transfers', {
    fields: ['dispatched_by'],
    type: 'foreign key',
    name: 'stock_transfers_dispatched_by_fkey',
    references: { table: 'users', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  });
  await qi.addConstraint('stock_transfers', {
    fields: ['received_by'],
    type: 'foreign key',
    name: 'stock_transfers_received_by_fkey',
    references: { table: 'users', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  const qi = context;
  await qi.removeConstraint('stock_transfers', 'stock_transfers_received_by_fkey');
  await qi.removeConstraint('stock_transfers', 'stock_transfers_dispatched_by_fkey');
  await qi.removeColumn('stock_transfers', 'received_at');
  await qi.removeColumn('stock_transfers', 'received_by');
  await qi.removeColumn('stock_transfers', 'dispatched_at');
  await qi.removeColumn('stock_transfers', 'dispatched_by');
}
