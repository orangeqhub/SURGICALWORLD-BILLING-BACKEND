import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

export class CrmNote extends BaseModel {
  declare id: string;
  declare branchId: string;
  declare customerId: string;
  declare note: string;
  declare createdBy: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initCrmNoteModel(sequelize: Sequelize): typeof CrmNote {
  CrmNote.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      branchId: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' } },
      customerId: { type: DataTypes.UUID, allowNull: false, references: { model: 'customers', key: 'id' } },
      note: { type: DataTypes.TEXT, allowNull: false },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({ sequelize, modelName: 'CrmNote', tableName: 'crm_notes' }),
  );
  return CrmNote;
}
