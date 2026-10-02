import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';

export class Payroll extends BaseModel {
  declare id: string;
  declare employeeId: string;
  declare employeeName: string | null;
  declare branchId: string;
  declare month: string;
  declare basicSalary: string;
  declare allowances: string;
  declare bonus: string;
  declare deductions: string;
  declare advance: string;
  declare presentDays: string;
  declare absentDays: string;
  declare halfDays: string;
  declare leaveDays: string;
  declare workingDays: string;
  declare perDayRate: string;
  declare attendanceDeduction: string;
  declare grossSalary: string;
  declare netSalary: string;
  declare paymentStatus: 'PENDING' | 'PAID';
  declare paymentDate: Date | null;
  declare remarks: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initPayrollModel(sequelize: Sequelize): typeof Payroll {
  Payroll.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      employeeId: { type: DataTypes.UUID, allowNull: false },
      employeeName: { type: DataTypes.STRING(150), allowNull: true },
      branchId: { type: DataTypes.UUID, allowNull: false },
      month: { type: DataTypes.STRING(7), allowNull: false },
      basicSalary: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      allowances: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      bonus: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      deductions: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      advance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      presentDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      absentDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      halfDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      leaveDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      workingDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      perDayRate: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      attendanceDeduction: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      grossSalary: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      netSalary: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      paymentStatus: { type: DataTypes.ENUM('PENDING', 'PAID'), allowNull: false, defaultValue: 'PENDING' },
      paymentDate: { type: DataTypes.DATE, allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize, modelName: 'Payroll', tableName: 'payroll',
      decimalAttributes: [
        'basicSalary', 'allowances', 'bonus', 'deductions', 'advance',
        'presentDays', 'absentDays', 'halfDays', 'leaveDays', 'workingDays',
        'perDayRate', 'attendanceDeduction', 'grossSalary', 'netSalary',
      ],
    }),
  );
  return Payroll;
}
