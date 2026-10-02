import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';
import { CUSTOMER_TYPES } from '../constants/enums';

/**
 * Customer Master. `openingBalance` + `openingBalanceType` come from the
 * frontend's customerProfileStore (customerMasterApi.js:26) and are the seed of
 * every ledger balance (frontend ledgerStore.js getPartyOpeningBalance negates
 * a CREDIT opening). They live on the Customer row on the server so the ledger
 * balance is fully derivable.
 */
export class Customer extends BaseModel {
  declare id: string;
  declare localId: string | null;
  declare branchId: string;
  declare name: string;
  declare mobile: string | null;
  declare email: string | null;
  declare address: string | null;
  declare gst: string | null;
  declare doctor: string | null;
  declare type: string;
  declare customerCode: string | null;
  declare creditLimit: string;
  declare openingBalance: string;
  declare openingBalanceType: 'DEBIT' | 'CREDIT';
  declare status: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initCustomerModel(sequelize: Sequelize): typeof Customer {
  Customer.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      /** Client-generated offline id (frontend customers.localId), for sync reconciliation. */
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
      doctor: { type: DataTypes.STRING(150), allowNull: true },
      type: { type: DataTypes.ENUM(...CUSTOMER_TYPES), allowNull: false, defaultValue: 'RETAIL' },
      customerCode: { type: DataTypes.STRING(50), allowNull: true },
      creditLimit: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      openingBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      openingBalanceType: { type: DataTypes.ENUM('DEBIT', 'CREDIT'), allowNull: false, defaultValue: 'DEBIT' },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Active' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'Customer',
      tableName: 'customers',
      decimalAttributes: ['creditLimit', 'openingBalance'],
      indexes: [
        { fields: ['branchId', 'name'], name: 'customers_branch_name_idx' },
        { fields: ['mobile'], name: 'customers_mobile_idx' },
        { unique: true, fields: ['localId'], name: 'customers_local_id_unique' },
      ],
    }),
  );
  return Customer;
}