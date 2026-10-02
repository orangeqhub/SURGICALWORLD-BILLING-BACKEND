import { describe, expect, it } from 'vitest';
import {
  MONEY_MAX,
  clampPercent,
  fromColumn,
  round2,
  toDecimal,
  toJsonNumber,
  toMoney,
  toPercent,
  toPositiveMoney,
  toSqlDecimal,
} from '../../src/utils/money';

/**
 * Money must never touch IEEE-754 arithmetic. These tests pin the behaviour the
 * billing engine will depend on.
 */
describe('money: toDecimal', () => {
  it('parses the shapes pg and JS actually hand us', () => {
    expect(toDecimal('1234.50')?.toFixed(2)).toBe('1234.50');
    expect(toDecimal('0')?.toFixed(2)).toBe('0.00');
    expect(toDecimal(99.99)?.toFixed(2)).toBe('99.99');
    expect(toDecimal('  12.5  ')?.toFixed(2)).toBe('12.50');
    expect(toDecimal('-7')?.toFixed(2)).toBe('-7.00');
    // 0.1 is not representable in binary; Decimal reads the shortest form.
    expect(toDecimal(0.1)?.toFixed(2)).toBe('0.10');
  });

  it('returns null for anything unparseable instead of NaN', () => {
    for (const bad of [null, undefined, '', '   ', 'abc', '12abc', '1,000', 'NaN', 'Infinity', '-Infinity', '0x10', '--5', '1e', {}, [], true]) {
      expect(toDecimal(bad), `input: ${String(bad)}`).toBeNull();
    }
  });
});

describe('money: rounding', () => {
  it('rounds half-up to 2dp, matching the frontend round2', () => {
    expect(round2('2.345').toFixed(2)).toBe('2.35');
    expect(round2('2.344').toFixed(2)).toBe('2.34');
    expect(round2('2.355').toFixed(2)).toBe('2.36');
    expect(round2('-2.345').toFixed(2)).toBe('-2.35');
    expect(round2('0.005').toFixed(2)).toBe('0.01');
  });

  it('does not drift when summing values a float would break on', () => {
    // Plain JS: 0.1 + 0.2 === 0.30000000000000004
    const sum = ['0.1', '0.2'].reduce((acc, v) => acc.plus(v), toDecimal(0)!);
    expect(sum.toFixed(2)).toBe('0.30');

    const many = ['0.1', '0.2', '0.3', '0.4'].reduce((acc, v) => acc.plus(v), toDecimal(0)!);
    expect(many.toFixed(2)).toBe('1.00');
  });
});

describe('money: range validation', () => {
  it('accepts values inside DECIMAL(14,2)', () => {
    expect(toMoney(MONEY_MAX.toFixed(2))?.toFixed(2)).toBe(MONEY_MAX.toFixed(2));
    expect(toMoney('999999999999.99')?.toFixed(2)).toBe('999999999999.99');
  });

  it('rejects values that would overflow a DECIMAL(14,2) column', () => {
    expect(toMoney('1000000000000')).toBeNull();
    expect(toMoney('-1000000000000')).toBeNull();
    expect(toMoney('abc')).toBeNull();
  });

  it('rounds to 2dp as part of parsing', () => {
    expect(toMoney('1.005')?.toFixed(2)).toBe('1.01');
  });

  it('toPositiveMoney additionally requires > 0 (ledger amounts)', () => {
    expect(toPositiveMoney('0.01')?.toFixed(2)).toBe('0.01');
    expect(toPositiveMoney('0')).toBeNull();
    expect(toPositiveMoney('-5')).toBeNull();
  });

  it('toPercent constrains to 0..100 inclusive', () => {
    expect(toPercent('0')?.toFixed(2)).toBe('0.00');
    expect(toPercent('100')?.toFixed(2)).toBe('100.00');
    expect(toPercent('18.5')?.toFixed(2)).toBe('18.50');
    expect(toPercent('100.01')).toBeNull();
    expect(toPercent('-0.01')).toBeNull();
  });
});

describe('money: serialization', () => {
  it('produces a 2dp literal for a SQL DECIMAL bind parameter', () => {
    expect(toSqlDecimal(toDecimal('19.9')!)).toBe('19.90');
    expect(toSqlDecimal(toDecimal('-19.9')!)).toBe('-19.90');
    expect(toSqlDecimal(toDecimal(0)!)).toBe('0.00');
  });

  it('produces a JS number for a JSON response', () => {
    expect(toJsonNumber('1234.50')).toBe(1234.5);
    expect(toJsonNumber(0)).toBe(0);
  });

  it('reads a column value back, defaulting null/undefined to zero', () => {
    expect(fromColumn('12.34').toFixed(2)).toBe('12.34');
    expect(fromColumn(null).toFixed(2)).toBe('0.00');
    expect(fromColumn(undefined).toFixed(2)).toBe('0.00');
  });
});

describe('money: percent clamping parity with the frontend', () => {
  it('agrees with the frontend on the happy path', () => {
    expect(clampPercent('10').toFixed(2)).toBe('10.00');
    expect(clampPercent(0).toFixed(2)).toBe('0.00');
    expect(clampPercent(100).toFixed(2)).toBe('100.00');
  });

  it('clamps rather than throwing - server validation rejects instead', () => {
    expect(clampPercent(-5).toFixed(2)).toBe('0.00');
    expect(clampPercent(150).toFixed(2)).toBe('100.00');
  });
});