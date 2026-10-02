import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

export class SalesTarget extends BaseModel {
  declare id: string;
  declare branchId: string | null;
  declare employeeId: string | null;
  declare periodType: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'CUSTOM';
  declare targetAmount: string;
  declare startDate: string;
  declare endDate: string;
  declare status: 'ACTIVE' | 'CANCELLED';
  declare notes: string | null;
  declare createdByName: string | null;
  declare createdBy: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initSalesTargetModel(sequelize: Sequelize): typeof SalesTarget {
  SalesTarget.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      branchId: { type: DataTypes.UUID, allowNull: true },
      employeeId: { type: DataTypes.UUID, allowNull: true },
      periodType: {
        type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM'),
        allowNull: false, defaultValue: 'MONTHLY',
      },
      targetAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      startDate: { type: DataTypes.STRING(10), allowNull: false },
      endDate: { type: DataTypes.STRING(10), allowNull: false },
      status: { type: DataTypes.ENUM('ACTIVE', 'CANCELLED'), allowNull: false, defaultValue: 'ACTIVE' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      createdByName: { type: DataTypes.STRING(200), allowNull: true },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize, modelName: 'SalesTarget', tableName: 'sales_targets',
      decimalAttributes: ['targetAmount'],
    }),
  );
  return SalesTarget;
}
