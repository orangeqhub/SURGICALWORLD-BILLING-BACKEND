import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

/** Key/value app settings (frontend `app_settings`, settingsApi `PUT /settings/:key`). */
export class Setting extends BaseModel {
  declare key: string;
  declare value: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initSettingModel(sequelize: Sequelize): typeof Setting {
  Setting.init(
    {
      key: { type: DataTypes.STRING(100), primaryKey: true },
      value: { type: DataTypes.TEXT, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({ sequelize, modelName: 'Setting', tableName: 'app_settings' }),
  );
  return Setting;
}