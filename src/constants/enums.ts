/**
 * Enum values shared with the frontend. Every constant below cites the exact
 * frontend source it was taken from, because these are wire-format contracts.
 */

/** frontend/src/utils/discountAllocation.js DISCOUNT_TYPES */
export const DISCOUNT_TYPES = {
  PERCENT: 'PCT',
  AMOUNT: 'AMT',
} as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[keyof typeof DISCOUNT_TYPES];
export const ALL_DISCOUNT_TYPES: DiscountType[] = Object.values(DISCOUNT_TYPES);

/**
 * Stock transfer lifecycle.
 *
 * Source of truth: frontend/src/services/api/transferFrontendApi.js and
 * frontend/src/components/transfers/TransferManager.jsx STATUS_ACTIONS / the
 * status filter list - this is the Advanced batch-level Transfer Editor that
 * both (super-admin)/transfers.js and (branch-admin)/transfers.js render.
 *
 *   DRAFT -> PENDING_APPROVAL -> APPROVED -> DISPATCHED -> RECEIVED
 *   PENDING_APPROVAL -> REJECTED
 *   any pre-receipt state -> CANCELLED
 *
 * The legacy simple transfer (frontend/src/database/databaseTypes.ts
 * StockTransferRow, driven by transferApi.js `PUT /:id/status`) used PENDING /
 * IN_TRANSIT / COMPLETED. Those three are retained as ALIASES on input so an
 * older client keeps working, but they are normalized to the canonical values
 * above on write - they are never persisted.
 */
export const TRANSFER_STATUSES = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DISPATCHED: 'DISPATCHED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[keyof typeof TRANSFER_STATUSES];
export const ALL_TRANSFER_STATUSES: TransferStatus[] = Object.values(TRANSFER_STATUSES);

/** Legacy simple-transfer statuses -> canonical advanced values. */
export const LEGACY_TRANSFER_STATUS_ALIASES: Record<string, TransferStatus> = {
  PENDING: TRANSFER_STATUSES.PENDING_APPROVAL,
  IN_TRANSIT: TRANSFER_STATUSES.DISPATCHED,
  COMPLETED: TRANSFER_STATUSES.RECEIVED,
};

/** Type guard: is this already a canonical, persistable transfer status? */
export function isTransferStatus(value: unknown): value is TransferStatus {
  return typeof value === 'string' && (ALL_TRANSFER_STATUSES as string[]).includes(value);
}

/**
 * Translates any accepted client value (canonical or legacy) into the canonical
 * status to persist, or null if it cannot be mapped. This is the ONLY place a
 * legacy value is allowed to be converted, so the database enum can stay a
 * single, unambiguous state machine.
 */
export function normalizeTransferStatus(value: unknown): TransferStatus | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  if (isTransferStatus(trimmed)) return trimmed;
  return LEGACY_TRANSFER_STATUS_ALIASES[trimmed] ?? null;
}

/** True when `to` is a legal next state from `from`. */
export function canTransitionTransfer(from: TransferStatus, to: TransferStatus): boolean {
  return TRANSFER_TRANSITIONS[from].includes(to);
}

/** Allowed transitions. Anything not listed here is rejected with 400. */
export const TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  DRAFT: [TRANSFER_STATUSES.PENDING_APPROVAL, TRANSFER_STATUSES.CANCELLED],
  PENDING_APPROVAL: [TRANSFER_STATUSES.APPROVED, TRANSFER_STATUSES.REJECTED, TRANSFER_STATUSES.CANCELLED],
  APPROVED: [TRANSFER_STATUSES.DISPATCHED, TRANSFER_STATUSES.CANCELLED],
  DISPATCHED: [TRANSFER_STATUSES.RECEIVED, TRANSFER_STATUSES.PARTIALLY_RECEIVED],
  PARTIALLY_RECEIVED: [TRANSFER_STATUSES.RECEIVED, TRANSFER_STATUSES.PARTIALLY_RECEIVED],
  RECEIVED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** frontend/src/database/databaseTypes.ts PaymentRow.method + frontendModels.ts PaymentMode */
export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'CHEQUE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** frontend/src/database/databaseTypes.ts InvoiceRow.paymentStatus */
export const INVOICE_PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'CREDIT'] as const;
export type InvoicePaymentStatus = (typeof INVOICE_PAYMENT_STATUSES)[number];

/** frontend/src/database/databaseTypes.ts StockMovementRow.type */
export const STOCK_MOVEMENT_TYPES = ['SALE', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'SALE_RETURN', 'PURCHASE_RETURN'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** frontend/src/database/databaseTypes.ts BranchStockRow.status */
export const STOCK_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

/**
 * frontend/src/types/frontendModels.ts LedgerReferenceType. MANUAL entries are
 * created by the Manual Ledger Entry screen (LedgerEntryManager.jsx), which
 * also offers ADJUSTMENT; neither collides with the four automatic types.
 */
export const LEDGER_REFERENCE_TYPES = ['INVOICE', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'ADJUSTMENT', 'MANUAL'] as const;
export type LedgerReferenceType = (typeof LEDGER_REFERENCE_TYPES)[number];

export const MANUAL_LEDGER_REFERENCE_TYPES: LedgerReferenceType[] = ['MANUAL', 'ADJUSTMENT'];

/** frontend/src/types/frontendModels.ts LedgerEntryType / ledgerStore.js balance convention */
export const LEDGER_ENTRY_TYPES = ['DEBIT', 'CREDIT'] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** DEBIT increases the party balance; CREDIT decreases it. */
export const LEDGER_BALANCE_EFFECT: Record<LedgerEntryType, 1 | -1> = { DEBIT: 1, CREDIT: -1 };

/** frontend/src/types/frontendModels.ts LedgerPartyType */
export const LEDGER_PARTY_TYPES = ['CUSTOMER', 'SUPPLIER'] as const;
export type LedgerPartyType = (typeof LEDGER_PARTY_TYPES)[number];

/** frontend/src/database/databaseTypes.ts CustomerRow.type */
export const CUSTOMER_TYPES = ['RETAIL', 'WHOLESALE', 'HOSPITAL', 'CLINIC', 'DISTRIBUTOR'] as const;

/** frontend/src/database/databaseTypes.ts BranchCacheRow.status */
export const BRANCH_STATUSES = ['Active', 'Inactive'] as const;

/** frontend/src/database/databaseTypes.ts VerifiedUserRow - lowercase compare, matches authApi.normalize() */
export const USER_STATUSES = ['active', 'inactive'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** frontend BillingContext.js UNSELLABLE_BATCH_STATUSES */
export const UNSELLABLE_BATCH_STATUSES = ['EXPIRED', 'BLOCKED', 'DEPLETED'] as const;

/** frontend/src/services/api/inventoryApi.js stock-adjust `reason` values are free text; these are the movement types it can produce. */
export const ADJUSTMENT_REASONS = ['DAMAGE', 'EXPIRY', 'THEFT', 'CORRECTION', 'RETURN', 'OTHER'] as const;