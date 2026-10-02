import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

export class CrmFollowUp extends BaseModel {
  declare id: string;
  declare branchId: string;
  declare customerId: string;
  declare customerName: string | null;
  declare assignedTo: string | null;
  declare followUpDate: string;
  declare followUpTime: string | null;
  declare nextFollowUpDate: string | null;
  declare status: 'PENDING' | 'FOLLOWING' | 'COMPLETED' | 'CANCELLED';
  declare notes: string | null;
  declare history: object[];
  declare createdByName: string | null;
  declare createdBy: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initCrmFollowUpModel(sequelize: Sequelize): typeof CrmFollowUp {
  CrmFollowUp.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      branchId: { type: DataTypes.UUID, allowNull: false },
      customerId: { type: DataTypes.UUID, allowNull: false },
      customerName: { type: DataTypes.STRING(200), allowNull: true },
      assignedTo: { type: DataTypes.UUID, allowNull: true },
      followUpDate: { type: DataTypes.STRING(10), allowNull: false },
      followUpTime: { type: DataTypes.STRING(5), allowNull: true },
      nextFollowUpDate: { type: DataTypes.STRING(10), allowNull: true },
      status: {
        type: DataTypes.ENUM('PENDING', 'FOLLOWING', 'COMPLETED', 'CANCELLED'),
        allowNull: false, defaultValue: 'PENDING',
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      createdByName: { type: DataTypes.STRING(200), allowNull: true },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({ sequelize, modelName: 'CrmFollowUp', tableName: 'crm_follow_ups' }),
  );
  return CrmFollowUp;
}
