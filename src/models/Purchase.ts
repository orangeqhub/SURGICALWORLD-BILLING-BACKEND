import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/** Purchase header (frontend `purchases`). Extended in migration 004. */
export class Purchase extends BaseModel {
  declare id: string;
  declare localId: string | null;
  declare branchId: string;
  declare supplierId: string;
  declare invoiceNumber: string | null;
  declare purchaseNumber: string | null;
  declare supplierInvoiceNumber: string | null;
  declare purchaseType: string;
  declare taxType: string;
  declare totalAmount: string;
  declare subtotal: string;
  declare productDiscounts: string;
  declare invoiceDiscount: string;
  declare taxableAmount: string;
  declare cgst: string;
  declare sgst: string;
  declare igst: string;
  declare otherCharges: string;
  declare roundOff: string;
  declare netAmount: string;
  declare paidAmount: string;
  declare balanceAmount: string;
  declare notes: string | null;
  declare status: 'RECEIVED' | 'CANCELLED';
  declare purchaseDate: Date;
  declare createdBy: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initPurchaseModel(sequelize: Sequelize): typeof Purchase {
  Purchase.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      localId: { type: DataTypes.STRING(100), allowNull: true },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      supplierId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'suppliers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      invoiceNumber: { type: DataTypes.STRING(100), allowNull: true },
      purchaseNumber: { type: DataTypes.STRING(100), allowNull: true },
      supplierInvoiceNumber: { type: DataTypes.STRING(150), allowNull: true },
      purchaseType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CREDIT' },
      taxType: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INTRA' },
      totalAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      productDiscounts: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      invoiceDiscount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      taxableAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      cgst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      sgst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      igst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      otherCharges: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      roundOff: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      netAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      paidAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      balanceAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      notes: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.ENUM('RECEIVED', 'CANCELLED'), allowNull: false, defaultValue: 'RECEIVED' },
      purchaseDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      createdBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'Purchase',
      tableName: 'purchases',
      decimalAttributes: ['totalAmount', 'subtotal', 'productDiscounts', 'invoiceDiscount', 'taxableAmount', 'cgst', 'sgst', 'igst', 'otherCharges', 'roundOff', 'netAmount', 'paidAmount', 'balanceAmount'],
      indexes: [
        { fields: ['branchId', 'purchaseDate'], name: 'purchases_branch_date_idx' },
        { unique: true, fields: ['localId'], name: 'purchases_local_id_unique' },
        { unique: true, fields: ['purchaseNumber'], name: 'purchases_purchase_number_unique' },
      ],
    }),
  );
  return Purchase;
}
