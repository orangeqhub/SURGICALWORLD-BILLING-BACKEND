import { DataTypes, Sequelize } from 'sequelize';
import { ROLES, type Role } from '../constants/roles';
import { BaseModel, defineModelOptions } from './BaseModel';

export class Branch extends BaseModel {
  declare id: string;
  declare code: string;
  declare name: string;
  declare address: string | null;
  declare phone: string | null;
  declare gst: string | null;
  declare manager: string | null;
  declare opening: string | null;
  declare closing: string | null;
  declare status: 'Active' | 'Inactive';
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initBranchModel(sequelize: Sequelize): typeof Branch {
  Branch.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      address: { type: DataTypes.TEXT, allowNull: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },
      gst: { type: DataTypes.STRING(50), allowNull: true },
      manager: { type: DataTypes.STRING(150), allowNull: true },
      opening: { type: DataTypes.STRING(20), allowNull: true },
      closing: { type: DataTypes.STRING(20), allowNull: true },
      status: { type: DataTypes.ENUM('Active', 'Inactive'), allowNull: false, defaultValue: 'Active' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({ sequelize, modelName: 'Branch', tableName: 'branches' }),
  );
  return Branch;
}