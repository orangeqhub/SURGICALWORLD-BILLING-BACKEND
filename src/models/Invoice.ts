import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';
import { DISCOUNT_TYPES, INVOICE_PAYMENT_STATUSES } from '../constants/enums';

/**
 * Invoice header. `localId` is the client-generated idempotency key: the
 * frontend's offline SQLite `invoices.localId` is UNIQUE
 * (schema.ts:131) and completeBill() returns the existing row instead of
 * inserting a duplicate on a double-tap (invoiceRepository.ts:41). The server
 * honours the same key so a retried sync cannot double-post a sale.
 *
 * All monetary columns are server-computed. The client's subtotal/discount/
 * gst/grandTotal are accepted only so a mismatch can be reported - never
 * trusted as authoritative.
 */
export class Invoice extends BaseModel {
  declare id: string;
  declare localId: string | null;
  declare invoiceNumber: string;
  declare branchId: string;
  declare customerId: string | null;
  declare employeeId: string | null;
  declare createdBy: string | null;
  declare subtotal: string;
  declare itemDiscountTotal: string;
  declare discount: string;
  declare discountType: string;
  declare discountValue: string;
  declare gst: string;
  declare grandTotal: string;
  declare paidTotal: string;
  declare paymentStatus: 'PAID' | 'PARTIAL' | 'CREDIT';
  declare isHeld: boolean;
  declare invoiceDate: Date;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initInvoiceModel(sequelize: Sequelize): typeof Invoice {
  Invoice.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      localId: { type: DataTypes.STRING(100), allowNull: true },
      invoiceNumber: { type: DataTypes.STRING(100), allowNull: false },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      customerId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'customers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      employeeId: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      createdBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      itemDiscountTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      discount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      discountType: { type: DataTypes.ENUM(...Object.values(DISCOUNT_TYPES)), allowNull: false, defaultValue: DISCOUNT_TYPES.AMOUNT },
      discountValue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      gst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      grandTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      paidTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      paymentStatus: { type: DataTypes.ENUM(...INVOICE_PAYMENT_STATUSES), allowNull: false, defaultValue: 'PAID' },
      isHeld: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      invoiceDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'Invoice',
      tableName: 'invoices',
      decimalAttributes: ['subtotal', 'itemDiscountTotal', 'discount', 'discountValue', 'gst', 'grandTotal', 'paidTotal'],
      indexes: [
        { fields: ['branchId', 'invoiceDate'], name: 'invoices_branch_date_idx' },
        { fields: ['customerId'], name: 'invoices_customer_idx' },
        { unique: true, fields: ['localId'], name: 'invoices_local_id_unique' },
      ],
    }),
  );
  return Invoice;
}