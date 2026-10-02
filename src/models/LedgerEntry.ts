import { DataTypes, Op, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';
import { LEDGER_ENTRY_TYPES, LEDGER_PARTY_TYPES, LEDGER_REFERENCE_TYPES } from '../constants/enums';

/**
 * The single ledger table. Manual entries (referenceType MANUAL/ADJUSTMENT) and
 * automatic entries (INVOICE/PURCHASE/PAYMENT/RECEIPT) are rows in this same
 * table - there is deliberately no separate manual-ledger model, so balances,
 * receivables and payables are derived from one consistent source.
 *
 * Convention (frontend/src/services/mock/ledgerStore.js:43):
 *   DEBIT  increases the party balance
 *   CREDIT decreases it
 * A customer's DEBIT balance is a receivable (they owe us); a supplier's CREDIT
 * balance is a payable we owe them.
 *
 * Duplicate protection: a PARTIAL unique index on
 * (reference_type, reference_id) WHERE reference_id IS NOT NULL mirrors
 * ledgerStore.createLedgerEntry's reference-dedupe. Entries with a null
 * referenceId - the normal case for MANUAL - are deliberately outside the index,
 * so independent manual adjustments are always allowed.
 *
 * Balance is never stored: it is derived as the party's signed opening balance
 * plus SUM(DEBIT - CREDIT), exactly as ledgerStore.getPartyBalance does.
 */
export const LEDGER_REFERENCE_UNIQUE_INDEX = 'ledger_entries_reference_unique';

export class LedgerEntry extends BaseModel {
  declare id: string;
  declare branchId: string;
  declare partyType: 'CUSTOMER' | 'SUPPLIER';
  declare partyId: string;
  /** Denormalised display name; the party row stays the source of truth. */
  declare partyName: string | null;
  declare type: 'DEBIT' | 'CREDIT';
  declare amount: string;
  declare note: string | null;
  declare referenceType: 'INVOICE' | 'PURCHASE' | 'PAYMENT' | 'RECEIPT' | 'ADJUSTMENT' | 'MANUAL';
  declare referenceId: string | null;
  declare entryDate: Date;
  declare createdBy: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initLedgerEntryModel(sequelize: Sequelize): typeof LedgerEntry {
  LedgerEntry.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      partyType: { type: DataTypes.ENUM(...LEDGER_PARTY_TYPES), allowNull: false },
      partyId: { type: DataTypes.UUID, allowNull: false },
      partyName: { type: DataTypes.STRING(200), allowNull: true },
      type: { type: DataTypes.ENUM(...LEDGER_ENTRY_TYPES), allowNull: false },
      amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
      referenceType: { type: DataTypes.ENUM(...LEDGER_REFERENCE_TYPES), allowNull: false },
      referenceId: { type: DataTypes.UUID, allowNull: true },
      entryDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      createdBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'LedgerEntry',
      tableName: 'ledger_entries',
      decimalAttributes: ['amount'],
      indexes: [
        { fields: ['branchId', 'partyType', 'partyId'], name: 'ledger_entries_party_idx' },
        { fields: ['branchId'], name: 'ledger_entries_branch_idx' },
        { fields: ['entryDate'], name: 'ledger_entries_date_idx' },
        // Partial unique index - only rows carrying a referenceId are deduped.
        // Note: `fields`/`where` use ATTRIBUTE names (camelCase); Sequelize maps
        // them to reference_type/reference_id.
        {
          name: LEDGER_REFERENCE_UNIQUE_INDEX,
          unique: true,
          fields: ['referenceType', 'referenceId'],
          where: { referenceId: { [Op.ne]: null } },
        },
      ],
    }),
  );
  return LedgerEntry;
}