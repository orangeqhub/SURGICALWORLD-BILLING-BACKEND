import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/** Purchase line with full snapshot (frontend `purchase_items`). Extended in migration 004. */
export class PurchaseItem extends BaseModel {
  declare id: string;
  declare purchaseId: string;
  declare productId: string | null;
  declare name: string;
  declare skuSnapshot: string | null;
  declare hsnSnapshot: string | null;
  declare quantity: number;
  declare freeQuantity: number;
  declare unit: string | null;
  declare purchasePrice: string;
  declare sellingPriceSnapshot: string;
  declare mrpSnapshot: string;
  declare discountPercent: string;
  declare discountAmount: string;
  declare netAmount: string;
  declare allocatedInvoiceDiscount: string;
  declare adjustedTaxable: string;
  declare gstPercent: string;
  declare cgst: string;
  declare sgst: string;
  declare igst: string;
  declare lineGst: string;
  declare lineTotal: string;
  declare batchNumber: string | null;
  declare mfgDate: string | null;
  declare expiryDate: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initPurchaseItemModel(sequelize: Sequelize): typeof PurchaseItem {
  PurchaseItem.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      purchaseId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'purchases', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      productId: { type: DataTypes.UUID, allowNull: true, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      name: { type: DataTypes.STRING(200), allowNull: false },
      skuSnapshot: { type: DataTypes.STRING(100), allowNull: true },
      hsnSnapshot: { type: DataTypes.STRING(100), allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      freeQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      unit: { type: DataTypes.STRING(30), allowNull: true },
      purchasePrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      sellingPriceSnapshot: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      mrpSnapshot: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      discountPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      discountAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      netAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      adjustedTaxable: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      cgst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      sgst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      igst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      lineGst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      lineTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      batchNumber: { type: DataTypes.STRING(100), allowNull: true },
      mfgDate: { type: DataTypes.DATEONLY, allowNull: true },
      expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'PurchaseItem',
      tableName: 'purchase_items',
      decimalAttributes: ['purchasePrice', 'sellingPriceSnapshot', 'mrpSnapshot', 'discountPercent', 'discountAmount', 'netAmount', 'adjustedTaxable', 'gstPercent', 'cgst', 'sgst', 'igst', 'lineGst', 'lineTotal'],
      indexes: [{ fields: ['purchaseId'], name: 'purchase_items_purchase_idx' }],
    }),
  );
  return PurchaseItem;
}
