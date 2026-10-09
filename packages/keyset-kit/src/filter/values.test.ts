import { describe, expect, it } from 'vitest';

import { checkScalar } from './values';

function value(
  type: Parameters<typeof checkScalar>[0],
  input: unknown,
): unknown {
  const check = checkScalar(type, input);
  return check.ok ? check.value : { rejected: check.expected };
}

describe('checkScalar', () => {
  it('accepts text only as a string', () => {
    expect(value('text', 'a')).toBe('a');
    expect(value('text', 1)).toEqual({ rejected: 'text' });
  });

  it('accepts integers as safe numbers, bigints, or digit strings', () => {
    expect(value('integer', 5)).toBe(5);
    expect(value('integer', -5)).toBe(-5);
    expect(value('integer', '42')).toBe('42');
    expect(value('integer', '+7')).toBe('+7');
    expect(value('integer', 10n)).toBe('10');
    expect(value('integer', 5.5)).toEqual({ rejected: 'integer' });
    expect(value('integer', '4.0')).toEqual({ rejected: 'integer' });
    expect(value('integer', 2 ** 53)).toEqual({ rejected: 'integer' });
    expect(value('bigint', '92233720368547758070')).toBe(
      '92233720368547758070',
    );
    expect(value('bigint', 'x')).toEqual({ rejected: 'bigint' });
  });

  it('keeps decimals exact and lets floats use exponents', () => {
    expect(value('decimal', '1.50')).toBe('1.50');
    expect(value('decimal', '.5')).toBe('.5');
    expect(value('decimal', 1.5)).toBe(1.5);
    expect(value('decimal', 2n)).toBe('2');
    expect(value('decimal', '1e3')).toEqual({ rejected: 'decimal' });
    expect(value('decimal', Number.NaN)).toEqual({ rejected: 'decimal' });
    expect(value('decimal', Number.POSITIVE_INFINITY)).toEqual({
      rejected: 'decimal',
    });
    expect(value('float', '1e3')).toBe('1e3');
    expect(value('float', '-1.5E-2')).toBe('-1.5E-2');
    expect(value('float', 'abc')).toEqual({ rejected: 'float' });
  });

  it('accepts booleans and their text form', () => {
    expect(value('boolean', true)).toBe(true);
    expect(value('boolean', 'false')).toBe(false);
    expect(value('boolean', 'yes')).toEqual({ rejected: 'boolean' });
    expect(value('boolean', 1)).toEqual({ rejected: 'boolean' });
  });

  it('accepts uuids in either case', () => {
    expect(value('uuid', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    );
    expect(value('uuid', '6BA7B810-9DAD-11D1-80B4-00C04FD430C8')).toBe(
      '6BA7B810-9DAD-11D1-80B4-00C04FD430C8',
    );
    expect(value('uuid', '6ba7b810')).toEqual({ rejected: 'uuid' });
  });

  it('accepts enum labels from the declared set', () => {
    const labels = ['lead', 'customer'];
    expect(checkScalar('enum', 'lead', labels)).toEqual({
      ok: true,
      value: 'lead',
    });
    expect(checkScalar('enum', 'other', labels)).toEqual({
      ok: false,
      expected: 'one of "lead", "customer"',
    });
    expect(checkScalar('enum', 'lead')).toEqual({
      ok: false,
      expected: 'one of ',
    });
  });

  it('checks dates against the calendar', () => {
    expect(value('date', '2024-02-29')).toBe('2024-02-29');
    expect(value('date', '2023-02-29')).toEqual({
      rejected: 'date (YYYY-MM-DD)',
    });
    expect(value('date', '2024-13-01')).toEqual({
      rejected: 'date (YYYY-MM-DD)',
    });
    expect(value('date', '2024-04-31')).toEqual({
      rejected: 'date (YYYY-MM-DD)',
    });
    expect(value('date', '2024-00-10')).toEqual({
      rejected: 'date (YYYY-MM-DD)',
    });
    expect(value('date', '2024-1-1')).toEqual({
      rejected: 'date (YYYY-MM-DD)',
    });
    expect(value('date', '1900-02-29')).toEqual({
      rejected: 'date (YYYY-MM-DD)',
    });
    expect(value('date', '2000-02-29')).toBe('2000-02-29');
    expect(value('date', new Date('2024-03-01T12:00:00Z'))).toBe('2024-03-01');
    expect(value('date', new Date('nope'))).toEqual({ rejected: 'date' });
    expect(value('date', 20240301)).toEqual({ rejected: 'date (YYYY-MM-DD)' });
  });

  it('accepts times with optional seconds and fractions', () => {
    expect(value('time', '12:30')).toBe('12:30');
    expect(value('time', '12:30:15.123456')).toBe('12:30:15.123456');
    expect(value('time', '24:00')).toEqual({
      rejected: 'time (HH:MM[:SS[.ffffff]])',
    });
    expect(value('time', 1230)).toEqual({
      rejected: 'time (HH:MM[:SS[.ffffff]])',
    });
  });

  it('accepts ISO 8601 timestamps with a T or a space and an optional offset', () => {
    expect(value('timestamptz', '2024-01-15T10:20:30.123456Z')).toBe(
      '2024-01-15T10:20:30.123456Z',
    );
    expect(value('timestamp', '2024-01-15 10:20:30')).toBe(
      '2024-01-15 10:20:30',
    );
    expect(value('timestamptz', '2024-01-15T10:20:30+02:00')).toBe(
      '2024-01-15T10:20:30+02:00',
    );
    expect(value('timestamptz', '2024-01-15T10:20+0200')).toBe(
      '2024-01-15T10:20+0200',
    );
    expect(value('timestamptz', '2024-02-30T00:00:00Z')).toEqual({
      rejected: 'timestamptz (ISO 8601)',
    });
    expect(value('timestamp', 'yesterday')).toEqual({
      rejected: 'timestamp (ISO 8601)',
    });
    expect(value('timestamp', 1_700_000_000)).toEqual({
      rejected: 'timestamp (ISO 8601)',
    });
    expect(value('timestamptz', new Date('2024-01-15T10:20:30.123Z'))).toBe(
      '2024-01-15T10:20:30.123Z',
    );
    expect(value('timestamptz', new Date('nope'))).toEqual({
      rejected: 'timestamptz',
    });
  });
});
