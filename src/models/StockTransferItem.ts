import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/** Transfer line (frontend `stock_transfer_items` + TransferManager line shape). */
export class StockTransferItem extends BaseModel {
  declare id: string;
  declare transferId: string;
  declare productId: string | null;
  declare batchId: string | null;
  declare batchNumber: string | null;
  declare expiryDate: string | null;
  declare transferQty: number;
  declare receivedQty: number;
  declare damagedQty: number;
  declare remarks: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initStockTransferItemModel(sequelize: Sequelize): typeof StockTransferItem {
  StockTransferItem.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      transferId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'stock_transfers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      productId: { type: DataTypes.UUID, allowNull: true, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      batchId: { type: DataTypes.UUID, allowNull: true, references: { model: 'stock_batches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      batchNumber: { type: DataTypes.STRING(100), allowNull: true },
      expiryDate: { type: DataTypes.STRING(50), allowNull: true },
      transferQty: { type: DataTypes.INTEGER, allowNull: false },
      receivedQty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      damagedQty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      remarks: { type: DataTypes.STRING(255), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'StockTransferItem',
      tableName: 'stock_transfer_items',
      indexes: [{ fields: ['transferId'], name: 'stock_transfer_items_transfer_idx' }],
    }),
  );
  return StockTransferItem;
}