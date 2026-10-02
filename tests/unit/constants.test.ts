import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  isPermission,
} from '../../src/constants/permissions';
import { ROLES, isRole } from '../../src/constants/roles';
import {
  ALL_TRANSFER_STATUSES,
  LEGACY_TRANSFER_STATUS_ALIASES,
  TRANSFER_STATUSES,
  TRANSFER_TRANSITIONS,
  canTransitionTransfer,
  isTransferStatus,
  normalizeTransferStatus,
} from '../../src/constants/enums';

describe('constants: roles', () => {
  it('contains exactly the three roles the frontend defines', () => {
    expect(Object.values(ROLES).sort()).toEqual(['BRANCH_ADMIN', 'EMPLOYEE', 'SUPER_ADMIN']);
  });

  it('rejects unknown role strings', () => {
    expect(isRole('SUPER_ADMIN')).toBe(true);
    expect(isRole('ADMIN')).toBe(false);
    expect(isRole('super_admin')).toBe(false);
  });
});

describe('constants: permissions', () => {
  it('exposes a non-empty, duplicate-free permission list', () => {
    expect(ALL_PERMISSIONS.length).toBeGreaterThan(0);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('includes the permissions the frontend screens gate on', () => {
    // TRANSFER_APPROVE exists in the vocabulary but is enforced by role, never
    // by a Branch Admin's permission list.
    expect(PERMISSIONS.TRANSFER_APPROVE).toBe('TRANSFER_APPROVE');
    expect(isPermission(PERMISSIONS.TRANSFER_APPROVE)).toBe(true);
    expect(isPermission(PERMISSIONS.BILLING)).toBe(true);
    expect(isPermission('NOT_A_PERMISSION')).toBe(false);
  });
});

describe('constants: canonical transfer state machine', () => {
  it('has exactly the 8 canonical statuses', () => {
    expect(Object.values(TRANSFER_STATUSES).sort()).toEqual([
      'APPROVED',
      'CANCELLED',
      'DISPATCHED',
      'DRAFT',
      'PARTIALLY_RECEIVED',
      'PENDING_APPROVAL',
      'RECEIVED',
      'REJECTED',
    ]);
  });

  it('never stores a legacy value', () => {
    for (const legacy of ['PENDING', 'IN_TRANSIT', 'COMPLETED']) {
      expect(Object.values(TRANSFER_STATUSES)).not.toContain(legacy);
      expect(isTransferStatus(legacy)).toBe(false);
    }
  });

  it('maps every legacy value to a canonical one', () => {
    expect(normalizeTransferStatus('PENDING')).toBe(TRANSFER_STATUSES.PENDING_APPROVAL);
    expect(normalizeTransferStatus('IN_TRANSIT')).toBe(TRANSFER_STATUSES.DISPATCHED);
    expect(normalizeTransferStatus('COMPLETED')).toBe(TRANSFER_STATUSES.RECEIVED);
  });

  it('passes canonical values through unchanged', () => {
    for (const status of Object.values(TRANSFER_STATUSES)) {
      expect(normalizeTransferStatus(status)).toBe(status);
    }
  });

  it('returns null for a value it cannot map', () => {
    expect(normalizeTransferStatus('NONSENSE')).toBeNull();
    expect(normalizeTransferStatus(undefined)).toBeNull();
    expect(normalizeTransferStatus(null)).toBeNull();
  });

  it('covers every legacy key in the alias table', () => {
    for (const key of Object.keys(LEGACY_TRANSFER_STATUS_ALIASES)) {
      expect(isTransferStatus(LEGACY_TRANSFER_STATUS_ALIASES[key])).toBe(true);
    }
  });

  it('accepts a lower-cased or padded value', () => {
    expect(normalizeTransferStatus('  received ')).toBe(TRANSFER_STATUSES.RECEIVED);
    expect(normalizeTransferStatus('in_transit')).toBe(TRANSFER_STATUSES.DISPATCHED);
  });
});

describe('constants: transfer transition table', () => {
  it('defines transitions for exactly the 8 canonical statuses', () => {
    expect(Object.keys(TRANSFER_TRANSITIONS).sort()).toEqual([...ALL_TRANSFER_STATUSES].sort());
  });

  it('never allows a terminal status to move again', () => {
    for (const terminal of [TRANSFER_STATUSES.RECEIVED, TRANSFER_STATUSES.REJECTED, TRANSFER_STATUSES.CANCELLED]) {
      expect(TRANSFER_TRANSITIONS[terminal]).toEqual([]);
    }
  });

  it('never transitions back into an approval state', () => {
    // Once approved, a transfer can no longer go back to pending or be rejected.
    for (const next of TRANSFER_TRANSITIONS[TRANSFER_STATUSES.APPROVED]) {
      expect([TRANSFER_STATUSES.PENDING_APPROVAL, TRANSFER_STATUSES.REJECTED]).not.toContain(next);
    }
  });

  it('exposes canTransitionTransfer as the single decision point', () => {
    expect(canTransitionTransfer(TRANSFER_STATUSES.PENDING_APPROVAL, TRANSFER_STATUSES.APPROVED)).toBe(true);
    expect(canTransitionTransfer(TRANSFER_STATUSES.PENDING_APPROVAL, TRANSFER_STATUSES.REJECTED)).toBe(true);
    expect(canTransitionTransfer(TRANSFER_STATUSES.RECEIVED, TRANSFER_STATUSES.DRAFT)).toBe(false);
    // Skipping DISPATCHED straight to RECEIVED is not a legal edge.
    expect(canTransitionTransfer(TRANSFER_STATUSES.APPROVED, TRANSFER_STATUSES.RECEIVED)).toBe(false);
  });
});