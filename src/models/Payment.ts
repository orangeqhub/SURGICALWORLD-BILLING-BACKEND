import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';
import { PAYMENT_METHODS } from '../constants/enums';

/** Payment against an invoice (frontend `payments`). */
export class Payment extends BaseModel {
  declare id: string;
  declare invoiceId: string;
  declare branchId: string;
  declare method: string;
  declare amount: string;
  declare reference: string | null;
  declare note: string | null;
  declare createdBy: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initPaymentModel(sequelize: Sequelize): typeof Payment {
  Payment.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      invoiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'invoices', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      method: { type: DataTypes.ENUM(...PAYMENT_METHODS), allowNull: false },
      amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      reference: { type: DataTypes.STRING(150), allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'Payment',
      tableName: 'payments',
      decimalAttributes: ['amount'],
      indexes: [
        { fields: ['invoiceId'], name: 'payments_invoice_idx' },
        { fields: ['branchId'], name: 'payments_branch_idx' },
      ],
    }),
  );
  return Payment;
}