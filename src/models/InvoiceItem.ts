import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/**
 * Invoice line with a full price/discount/GST SNAPSHOT.
 *
 * This is the Requirement "snapshot prices" rule: once an invoice is posted its
 * line values must never be recomputed from the current Product row. If a
 * product later changes from 100/10% to 120/5%, yesterday's invoice must still
 * read 100 and 10%. `calculateItemAmounts()` in
 * frontend/src/utils/discountAllocation.js is the reference formula.
 *
 * Stored columns mirror its output:
 *   grossAmount                = quantity * sellingPrice
 *   discountAmount             = grossAmount * discountPercent / 100
 *   netAmount                  = grossAmount - discountAmount
 *   allocatedInvoiceDiscount   = pro-rata share of the invoice-level discount
 *   adjustedTaxable            = netAmount - allocatedInvoiceDiscount
 *   lineGst                    = adjustedTaxable * gstPercent / 100
 *   effectiveUnitPrice         = adjustedTaxable / quantity
 */
export class InvoiceItem extends BaseModel {
  declare id: string;
  declare invoiceId: string;
  declare productId: string | null;
  declare batchId: string | null;
  declare name: string;
  declare unit: string | null;
  declare quantity: number;
  declare sellingPrice: string;
  declare discountPercent: string;
  declare grossAmount: string;
  declare discountAmount: string;
  declare netAmount: string;
  declare allocatedInvoiceDiscount: string;
  declare adjustedTaxable: string;
  declare gstPercent: string;
  declare lineGst: string;
  declare effectiveUnitPrice: string;
  declare cutOffPrice: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initInvoiceItemModel(sequelize: Sequelize): typeof InvoiceItem {
  InvoiceItem.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      invoiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'invoices', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      productId: { type: DataTypes.UUID, allowNull: true, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      batchId: { type: DataTypes.UUID, allowNull: true, references: { model: 'stock_batches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      name: { type: DataTypes.STRING(200), allowNull: false },
      unit: { type: DataTypes.STRING(20), allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      sellingPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      discountPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      grossAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      discountAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      netAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      allocatedInvoiceDiscount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      adjustedTaxable: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      lineGst: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      effectiveUnitPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      cutOffPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'InvoiceItem',
      tableName: 'invoice_items',
      decimalAttributes: [
        'sellingPrice',
        'discountPercent',
        'grossAmount',
        'discountAmount',
        'netAmount',
        'allocatedInvoiceDiscount',
        'adjustedTaxable',
        'gstPercent',
        'lineGst',
        'effectiveUnitPrice',
        'cutOffPrice',
      ],
      indexes: [{ fields: ['invoiceId'], name: 'invoice_items_invoice_idx' }],
    }),
  );
  return InvoiceItem;
}