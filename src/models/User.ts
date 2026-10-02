import { DataTypes, Sequelize } from 'sequelize';
import { ROLES, type Role } from '../constants/roles';
import { ALL_PERMISSIONS, type Permission } from '../constants/permissions';
import { BaseModel, defineModelOptions } from './BaseModel';

/**
 * Authenticated principal. Mirrors frontend `verified_users`
 * (frontend/src/database/schema.ts) plus `status`, and adds the
 * `password_hash` the server owns exclusively.
 *
 * SUPER_ADMIN has branchId = NULL by design (frontend/src/database/databaseTypes.ts
 * VerifiedUserRow.branchId is nullable, and authApi.js seeds super admins with a
 * null branchId), which is what makes them global rather than branch-scoped.
 */
export class User extends BaseModel {
  declare id: string;
  declare role: Role;
  declare branchId: string | null;
  declare loginId: string;
  declare employeeId: string | null;
  declare name: string;
  declare email: string | null;
  declare phone: string | null;
  declare passwordHash: string;
  /** JSON array of Permission strings; only meaningful for EMPLOYEE. */
  declare permissions: Permission[];
  declare status: 'active' | 'inactive';
  declare lastLoginAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      role: {
        type: DataTypes.ENUM(...Object.values(ROLES)),
        allowNull: false,
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      // The frontend logs in with a loginId that is not an email
      // (e.g. 'SA-001', 'BA-001', 'EMP-001'), so loginId is the credential key.
      loginId: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      employeeId: { type: DataTypes.STRING(100), allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      email: { type: DataTypes.STRING(150), allowNull: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      permissions: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        validate: {
          isValidArray(value: unknown) {
            if (!Array.isArray(value)) throw new Error('permissions must be an array');
            const allowed = new Set<string>(ALL_PERMISSIONS);
            for (const entry of value) {
              if (typeof entry !== 'string' || !allowed.has(entry)) {
                throw new Error(`unknown permission: ${String(entry)}`);
              }
            }
            return true;
          },
        },
      },
      status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({ sequelize, modelName: 'User', tableName: 'users' }),
  );

  /** Never let a password hash reach a serialized response. */
  User.prototype.toJSON = function toJSON(this: User) {
    const values = this.get({ plain: true }) as Record<string, unknown>;
    delete values.passwordHash;
    delete values.password_hash;
    return values;
  };

  return User;
}