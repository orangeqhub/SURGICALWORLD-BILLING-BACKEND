import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

export class SupplierPayment extends BaseModel {
  declare id: string;
  declare branchId: string;
  declare supplierId: string | null;
  declare supplierName: string | null;
  declare amount: string;
  declare method: string | null;
  declare reference: string | null;
  declare note: string | null;
  declare date: Date;
  declare status: string;
  declare createdBy: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initSupplierPaymentModel(sequelize: Sequelize): typeof SupplierPayment {
  SupplierPayment.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      branchId: { type: DataTypes.UUID, allowNull: false },
      supplierId: { type: DataTypes.UUID, allowNull: true },
      supplierName: { type: DataTypes.STRING(200), allowNull: true },
      amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      method: { type: DataTypes.STRING(50), allowNull: true },
      reference: { type: DataTypes.STRING(150), allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'RECORDED' },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize, modelName: 'SupplierPayment', tableName: 'supplier_payments',
      decimalAttributes: ['amount'],
    }),
  );
  return SupplierPayment;
}
