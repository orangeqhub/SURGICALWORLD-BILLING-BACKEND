import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/** Supplier Master. Same opening-balance/branch-isolation rules as Customer. */
export class Supplier extends BaseModel {
  declare id: string;
  declare localId: string | null;
  declare branchId: string;
  declare name: string;
  declare mobile: string | null;
  declare email: string | null;
  declare address: string | null;
  declare gst: string | null;
  declare supplierCode: string | null;
  declare openingBalance: string;
  declare openingBalanceType: 'DEBIT' | 'CREDIT';
  declare status: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initSupplierModel(sequelize: Sequelize): typeof Supplier {
  Supplier.init(
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
      name: { type: DataTypes.STRING(200), allowNull: false },
      mobile: { type: DataTypes.STRING(50), allowNull: true },
      email: { type: DataTypes.STRING(150), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      gst: { type: DataTypes.STRING(50), allowNull: true },
      supplierCode: { type: DataTypes.STRING(50), allowNull: true },
      openingBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      openingBalanceType: { type: DataTypes.ENUM('DEBIT', 'CREDIT'), allowNull: false, defaultValue: 'DEBIT' },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Active' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'Supplier',
      tableName: 'suppliers',
      decimalAttributes: ['openingBalance'],
      indexes: [
        { fields: ['branchId', 'name'], name: 'suppliers_branch_name_idx' },
        { unique: true, fields: ['localId'], name: 'suppliers_local_id_unique' },
      ],
    }),
  );
  return Supplier;
}