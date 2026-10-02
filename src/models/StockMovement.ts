import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/**
 * Immutable stock ledger (frontend `stock_movements`). Every change to
 * BranchStock/StockBatch writes exactly one row here so movements can be
 * audited and replayed. Signed `quantity`: negative = out, positive = in.
 */
export class StockMovement extends BaseModel {
  declare id: string;
  declare branchId: string;
  declare productId: string;
  declare batchId: string | null;
  declare quantity: number;
  declare type: 'SALE' | 'PURCHASE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT' | 'SALE_RETURN' | 'PURCHASE_RETURN';
  declare referenceType: string | null;
  declare referenceId: string | null;
  declare note: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initStockMovementModel(sequelize: Sequelize): typeof StockMovement {
  StockMovement.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      batchId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'stock_batches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      type: {
        type: DataTypes.ENUM('SALE', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'SALE_RETURN', 'PURCHASE_RETURN'),
        allowNull: false,
      },
      referenceType: { type: DataTypes.STRING(50), allowNull: true },
      referenceId: { type: DataTypes.UUID, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'StockMovement',
      tableName: 'stock_movements',
      indexes: [
        { fields: ['branchId', 'productId'], name: 'stock_movements_branch_product_idx' },
        { fields: ['referenceType', 'referenceId'], name: 'stock_movements_reference_idx' },
      ],
    }),
  );
  return StockMovement;
}