import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/**
 * Per-branch stock for a product (frontend `branch_stock`).
 * Composite PK (branch_id, product_id) mirrors the frontend exactly.
 * `available` is never allowed negative - the CHECK is the last line of defence
 * behind the row lock taken during a sale.
 */
export class BranchStock extends BaseModel {
  declare branchId: string;
  declare productId: string;
  declare available: number;
  declare minStock: number;
  declare status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initBranchStockModel(sequelize: Sequelize): typeof BranchStock {
  BranchStock.init(
    {
      branchId: {
        type: DataTypes.UUID,
        primaryKey: true,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      productId: {
        type: DataTypes.UUID,
        primaryKey: true,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      available: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
      minStock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
      status: { type: DataTypes.ENUM('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'), allowNull: false, defaultValue: 'IN_STOCK' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({ sequelize, modelName: 'BranchStock', tableName: 'branch_stock', timestamps: true }),
  );
  return BranchStock;
}