import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

export class Attendance extends BaseModel {
  declare id: string;
  declare employeeId: string;
  declare employeeName: string | null;
  declare branchId: string;
  declare date: string;
  declare status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY';
  declare checkInTime: string | null;
  declare checkOutTime: string | null;
  declare workingHours: string;
  declare remarks: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initAttendanceModel(sequelize: Sequelize): typeof Attendance {
  Attendance.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      employeeId: { type: DataTypes.UUID, allowNull: false },
      employeeName: { type: DataTypes.STRING(150), allowNull: true },
      branchId: { type: DataTypes.UUID, allowNull: false },
      date: { type: DataTypes.STRING(10), allowNull: false },
      status: {
        type: DataTypes.ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY'),
        allowNull: false, defaultValue: 'PRESENT',
      },
      checkInTime: { type: DataTypes.STRING(5), allowNull: true },
      checkOutTime: { type: DataTypes.STRING(5), allowNull: true },
      workingHours: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize, modelName: 'Attendance', tableName: 'attendance',
      decimalAttributes: ['workingHours'],
    }),
  );
  return Attendance;
}
