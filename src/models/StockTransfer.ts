import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, defineModelOptions } from './BaseModel';
import { TRANSFER_STATUSES } from '../constants/enums';

/**
 * Branch stock transfer, matching the live Advanced Transfer Editor flow in
 * frontend/src/services/api/transferFrontendApi.js and
 * frontend/src/components/transfers/TransferManager.jsx STATUS_ACTIONS:
 *
 *   DRAFT -> PENDING_APPROVAL -> APPROVED -> DISPATCHED -> [PARTIALLY_RECEIVED] -> RECEIVED
 *   PENDING_APPROVAL -> REJECTED ;  DRAFT|PENDING_APPROVAL|APPROVED -> CANCELLED
 *
 * The column is a native PostgreSQL ENUM over exactly these 8 values - the
 * legacy PENDING/IN_TRANSIT/COMPLETED values are translated at the service
 * boundary (see constants/enums.ts LEGACY_TRANSFER_STATUS_ALIASES) and are
 * never stored.
 *
 * Audit fields requestedBy / approvedBy are set from the authenticated JWT
 * (`req.user.id`), never from the request body. requestedBy is deliberately a
 * separate column from approvedBy so the original requester is preserved when
 * a Super Admin approves a Branch Admin's transfer.
 */
export class StockTransfer extends BaseModel {
  declare id: string;
  declare localId: string | null;
  declare transferNumber: string;
  declare branchId: string;
  declare fromBranchId: string;
  declare toBranchId: string;
  declare status: string;
  declare transferDate: string;
  /** Id of the user who created/submitted the transfer (Branch Admin). */
  declare requestedBy: string | null;
  /** Id of the Super Admin who approved. Null until approved. */
  declare approvedBy: string | null;
  declare approvedAt: Date | null;
  declare rejectedBy: string | null;
  declare rejectedAt: Date | null;
  declare rejectionReason: string | null;
  declare dispatchDate: string | null;
  /** Id of the user who dispatched (set at DISPATCHED transition). */
  declare dispatchedBy: string | null;
  declare dispatchedAt: Date | null;
  declare receivedDate: string | null;
  /** Id of the user who received (set at RECEIVED / PARTIALLY_RECEIVED). */
  declare receivedBy: string | null;
  declare receivedAt: Date | null;
  declare remarks: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initStockTransferModel(sequelize: Sequelize): typeof StockTransfer {
  StockTransfer.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      localId: { type: DataTypes.STRING(100), allowNull: true },
      transferNumber: { type: DataTypes.STRING(100), allowNull: false },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      fromBranchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      toBranchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: DataTypes.ENUM(...Object.values(TRANSFER_STATUSES)),
        allowNull: false,
        defaultValue: TRANSFER_STATUSES.DRAFT,
      },
      transferDate: { type: DataTypes.STRING(20), allowNull: false },
      requestedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      approvedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      rejectedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      rejectedAt: { type: DataTypes.DATE, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      dispatchDate: { type: DataTypes.STRING(20), allowNull: true },
      dispatchedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      dispatchedAt: { type: DataTypes.DATE, allowNull: true },
      receivedDate: { type: DataTypes.STRING(20), allowNull: true },
      receivedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      receivedAt: { type: DataTypes.DATE, allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    defineModelOptions({
      sequelize,
      modelName: 'StockTransfer',
      tableName: 'stock_transfers',
      indexes: [
        { fields: ['fromBranchId'], name: 'stock_transfers_from_branch_idx' },
        { fields: ['toBranchId'], name: 'stock_transfers_to_branch_idx' },
        { fields: ['status'], name: 'stock_transfers_status_idx' },
        { unique: true, fields: ['localId'], name: 'stock_transfers_local_id_unique' },
      ],
    }),
  );
  return StockTransfer;
}