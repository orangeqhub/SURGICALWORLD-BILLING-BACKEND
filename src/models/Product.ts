import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/**
 * Product Master. Combines the frontend's real `products` table columns
 * (schema.ts / databaseTypes.ts ProductRow) with the extended profile fields
 * the frontend keeps in AsyncStorage (productProfileStore) - so on the server
 * these become first-class columns rather than a side-car.
 *
 * `discountPercent` is the Requirement 1 field. DECIMAL(5,2), NOT NULL DEFAULT 0,
 * CHECK (0..100): every pre-existing product that never had a discount reads
 * back as 0, so nothing becomes invalid.
 */
export class Product extends BaseModel {
  declare id: string;
  declare name: string;
  declare code: string;
  declare barcode: string | null;
  declare categoryId: string | null;
  declare mrp: string;
  declare cutOffPrice: string;
  declare sellingPrice: string;
  declare purchasePrice: string;
  declare discountPercent: string;
  declare gst: string;
  declare unit: string;
  declare minStock: number;
  declare maxStock: number | null;
  declare batch: string | null;
  declare hsn: string | null;
  declare mfgDate: string | null;
  declare expiryDate: string | null;
  declare brand: string | null;
  declare subcategory: string | null;
  declare manufacturer: string | null;
  declare supplier: string | null;
  declare batchTrackingEnabled: boolean;
  declare expiryTrackingEnabled: boolean;
  declare status: string;
  declare remarks: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initProductModel(sequelize: Sequelize): typeof Product {
  Product.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      name: { type: DataTypes.STRING(200), allowNull: false },
      code: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      barcode: { type: DataTypes.STRING(100), allowNull: true },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      mrp: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      cutOffPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      sellingPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      purchasePrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      discountPercent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 100,
        },
      },
      gst: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Pcs' },
      minStock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      maxStock: { type: DataTypes.INTEGER, allowNull: true },
      batch: { type: DataTypes.STRING(100), allowNull: true },
      hsn: { type: DataTypes.STRING(50), allowNull: true },
      mfgDate: { type: DataTypes.STRING(50), allowNull: true },
      expiryDate: { type: DataTypes.STRING(50), allowNull: true },
      brand: { type: DataTypes.STRING(100), allowNull: true },
      subcategory: { type: DataTypes.STRING(100), allowNull: true },
      manufacturer: { type: DataTypes.STRING(150), allowNull: true },
      supplier: { type: DataTypes.STRING(150), allowNull: true },
      batchTrackingEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      expiryTrackingEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Active' },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'Product',
      tableName: 'products',
      decimalAttributes: ['mrp', 'cutOffPrice', 'sellingPrice', 'purchasePrice', 'discountPercent', 'gst'],
      indexes: [{ unique: true, fields: ['barcode'], name: 'products_barcode_unique' }, { fields: ['name'], name: 'products_name_idx' }],
    }),
  );
  return Product;
}