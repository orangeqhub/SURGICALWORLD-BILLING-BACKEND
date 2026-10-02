import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/**
 * Multi-batch inventory per branch/product (frontend batchInventoryStore mock,
 * exposed through batchInventoryApi `GET /batches?branchId&productId`).
 *
 * `status` values EXPIRED / BLOCKED / DEPLETED are the frontend's
 * UNSELLABLE_BATCH_STATUSES (frontend/src/context/BillingContext.js) - a line
 * backed by one of these batches must be rejected at sale time.
 */
export class StockBatch extends BaseModel {
  declare id: string;
  declare branchId: string;
  declare productId: string;
  declare batchNumber: string;
  declare mfgDate: string | null;
  declare expiryDate: string | null;
  declare available: number;
  declare status: 'ACTIVE' | 'EXPIRED' | 'BLOCKED' | 'DEPLETED';
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initStockBatchModel(sequelize: Sequelize): typeof StockBatch {
  StockBatch.init(
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
      batchNumber: { type: DataTypes.STRING(100), allowNull: false },
      mfgDate: { type: DataTypes.STRING(50), allowNull: true },
      expiryDate: { type: DataTypes.STRING(50), allowNull: true },
      available: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM('ACTIVE', 'EXPIRED', 'BLOCKED', 'DEPLETED'), allowNull: false, defaultValue: 'ACTIVE' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'StockBatch',
      tableName: 'stock_batches',
      indexes: [
        { unique: true, fields: ['branchId', 'productId', 'batchNumber'], name: 'stock_batches_unique_batch' },
        { fields: ['branchId', 'productId'], name: 'stock_batches_branch_product_idx' },
      ],
    }),
  );
  return StockBatch;
}