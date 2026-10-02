import Decimal from 'decimal.js';

/**
 * Financial arithmetic. Every rupee amount and percentage in this codebase goes
 * through these helpers - never bare JS float math - so 99.999999 style errors
 * cannot occur in an invoice, ledger or balance.
 *
 * Decimal.js is configured once, globally, to match the frontend's round-to-2
 * decimals convention (frontend/src/utils/discountAllocation.js round2) and to
 * reject NaN/Infinity rather than silently producing garbage.
 *
 * DECIMAL / MONEY SCALE
 *   - money columns:      DECIMAL(14,2)  - up to 12 whole rupees, 2 dp
 *   - percentage columns: DECIMAL(5,2)   - 0.00 .. 100.00
 */
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -21,
  toExpPos: 21,
});

export { Decimal };

/** Largest value a DECIMAL(14,2) money column can hold. */
export const MONEY_MAX = new Decimal('999999999999.99');
/** Inclusive bounds for a DECIMAL(5,2) percentage column. */
export const PERCENT_MIN = new Decimal(0);
export const PERCENT_MAX = new Decimal(100);

/**
 * Parses an untrusted value (JSON body, query string) into a Decimal.
 * Returns null for anything that is not a finite decimal number - NaN,
 * Infinity, '', null, booleans, arrays and objects all become null so callers
 * can turn them into a 400 rather than corrupting a total.
 */
export function toDecimal(value: unknown): Decimal | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Decimal) return Number.isFinite(value.toNumber()) ? value : null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new Decimal(value);
  }

  if (typeof value === 'bigint') return new Decimal(value.toString());

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    // Reject anything that is not a plain decimal number: '10abc', '1,000',
    // 'NaN', 'Infinity', '1e', '--5', '0x10', '  '.
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) return null;
    const parsed = new Decimal(trimmed);
    return parsed.isFinite() ? parsed : null;
  }

  return null;
}

/**
 * Parses to a money Decimal rounded to 2 dp, or null if unparseable.
 * Also rejects values outside DECIMAL(14,2) range.
 */
export function toMoney(value: unknown): Decimal | null {
  const parsed = toDecimal(value);
  if (parsed === null) return null;
  const rounded = parsed.toDecimalPlaces(2);
  if (rounded.abs().gt(MONEY_MAX)) return null;
  return rounded;
}

/** Same as toMoney but requires > 0. Used for ledger amounts. */
export function toPositiveMoney(value: unknown): Decimal | null {
  const money = toMoney(value);
  if (money === null || money.lte(0)) return null;
  return money;
}

/**
 * Parses to a percentage Decimal rounded to 2 dp, requiring
 * 0 <= value <= 100. Returns null for out-of-range or unparseable input so the
 * caller responds 400 instead of clamping a bad value into the database.
 */
export function toPercent(value: unknown): Decimal | null {
  const parsed = toDecimal(value);
  if (parsed === null) return null;
  const rounded = parsed.toDecimalPlaces(2);
  if (rounded.lt(PERCENT_MIN) || rounded.gt(PERCENT_MAX)) return null;
  return rounded;
}

/** Rounds to 2 dp using ROUND_HALF_UP, matching the frontend's round2. */
export function round2(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2);
}

/**
 * Converts to the string PostgreSQL expects for a DECIMAL column.
 * Sequelize/pg bind parameters must receive strings for exact decimal storage.
 */
export function toSqlDecimal(value: Decimal): string {
  return value.toFixed(2);
}

/**
 * Serializes a Decimal for a JSON API response as a JS number.
 * Safe because these are 2-dp values well inside Number.MAX_SAFE_INTEGER.
 */
export function toJsonNumber(value: Decimal | string | number): number {
  return round2(new Decimal(value)).toNumber();
}

/**
 * Resolves pg/sequelize model output into Decimal.
 * With dialectOptions.decimalNumbers:false, DECIMAL columns arrive as strings.
 */
export function fromColumn(value: Decimal | string | number | null | undefined, fallback = new Decimal(0)): Decimal {
  if (value === null || value === undefined) return fallback;
  return new Decimal(value.toString());
}

/**
 * The frontend's clampDiscountPercent, preserved for parity checks in tests.
 * Server-side validation REJECTS out-of-range values instead of clamping them;
 * this exists only so a test can assert the two behaviours agree on the happy path.
 */
export function clampPercent(value: unknown): Decimal {
  const parsed = toDecimal(value);
  if (parsed === null) return new Decimal(0);
  if (parsed.lt(0)) return new Decimal(0);
  if (parsed.gt(100)) return new Decimal(100);
  return parsed.toDecimalPlaces(2);
}