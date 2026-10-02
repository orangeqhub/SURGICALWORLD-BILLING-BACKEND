import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

export class Expense extends BaseModel {
  declare id: string;
  declare branchId: string;
  declare date: string;
  declare category: string;
  declare amount: string;
  declare paymentMethod: string | null;
  declare reference: string | null;
  declare note: string | null;
  declare createdBy: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initExpenseModel(sequelize: Sequelize): typeof Expense {
  Expense.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      branchId: { type: DataTypes.UUID, allowNull: false },
      date: { type: DataTypes.STRING(10), allowNull: false },
      category: { type: DataTypes.STRING(100), allowNull: false },
      amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      paymentMethod: { type: DataTypes.STRING(50), allowNull: true },
      reference: { type: DataTypes.STRING(150), allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize, modelName: 'Expense', tableName: 'expenses',
      decimalAttributes: ['amount'],
    }),
  );
  return Expense;
}
