/**
 * Value validation by field type (SPEC 4.3). A filter value is accepted in
 * its JSON form or in its canonical string form, because query strings
 * carry only strings. Temporal and arbitrary-precision values stay strings
 * so microseconds and digits survive; the database parses them.
 * @ref https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-DATETIME-INPUT
 * @ref https://www.postgresql.org/docs/current/datatype-numeric.html
 * @ref https://www.rfc-editor.org/rfc/rfc9562#section-4 (UUID text form)
 * @packageDocumentation
 */
import type { ScalarFieldType } from '../definition/types';

/** What a validated scalar becomes on the wire: a parameter the database types by context. */
export type ScalarValue = string | number | boolean;

export type ScalarCheck =
  | { readonly ok: true; readonly value: ScalarValue }
  | { readonly ok: false; readonly expected: string };

type Checker = (
  value: unknown,
  values: ReadonlyArray<string> | null,
) => ScalarCheck;

const INTEGER = /^[+-]?\d+$/u;
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)$/u;
const FLOAT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/u;
const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)?$/u;

const DATE_LENGTH = 10;
const MONTHS_PER_YEAR = 12;
const DAYS_IN_MONTH: ReadonlyArray<number> = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
];
const FEBRUARY = 2;
const LEAP_DAY = 29;
const LEAP_CYCLE = 4;
const CENTURY = 100;
const LEAP_CENTURY = 400;

function isLeapYear(year: number): boolean {
  return (
    (year % LEAP_CYCLE === 0 && year % CENTURY !== 0) ||
    year % LEAP_CENTURY === 0
  );
}

function isCalendarDate(match: RegExpExecArray): boolean {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > MONTHS_PER_YEAR || day < 1) {
    return false;
  }
  const max =
    month === FEBRUARY && isLeapYear(year)
      ? LEAP_DAY
      : (DAYS_IN_MONTH[month - 1] ?? 0);
  return day <= max;
}

function reject(expected: string): ScalarCheck {
  return { ok: false, expected };
}

function accept(value: ScalarValue): ScalarCheck {
  return { ok: true, value };
}

function integer(type: 'integer' | 'bigint'): Checker {
  return (value) => {
    if (typeof value === 'number') {
      return Number.isSafeInteger(value) ? accept(value) : reject(type);
    }
    if (typeof value === 'bigint') {
      return accept(value.toString());
    }
    return typeof value === 'string' && INTEGER.test(value)
      ? accept(value)
      : reject(type);
  };
}

function number(type: 'decimal' | 'float'): Checker {
  const pattern = type === 'decimal' ? DECIMAL : FLOAT;
  return (value) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? accept(value) : reject(type);
    }
    if (typeof value === 'bigint') {
      return accept(value.toString());
    }
    return typeof value === 'string' && pattern.test(value)
      ? accept(value)
      : reject(type);
  };
}

const boolean: Checker = (value) => {
  if (typeof value === 'boolean') {
    return accept(value);
  }
  if (value === 'true' || value === 'false') {
    return accept(value === 'true');
  }
  return reject('boolean');
};

const date: Checker = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? reject('date')
      : accept(value.toISOString().slice(0, DATE_LENGTH));
  }
  if (typeof value !== 'string') {
    return reject('date (YYYY-MM-DD)');
  }
  const match = DATE.exec(value);
  return match !== null && isCalendarDate(match)
    ? accept(value)
    : reject('date (YYYY-MM-DD)');
};

const time: Checker = (value) =>
  typeof value === 'string' && TIME.test(value)
    ? accept(value)
    : reject('time (HH:MM[:SS[.ffffff]])');

function timestamp(type: 'timestamp' | 'timestamptz'): Checker {
  return (value) => {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? reject(type)
        : accept(value.toISOString());
    }
    if (typeof value !== 'string') {
      return reject(`${type} (ISO 8601)`);
    }
    const match = TIMESTAMP.exec(value);
    return match !== null && isCalendarDate(match)
      ? accept(value)
      : reject(`${type} (ISO 8601)`);
  };
}

const enumeration: Checker = (value, values) =>
  typeof value === 'string' && values?.includes(value) === true
    ? accept(value)
    : reject(
        `one of ${(values ?? []).map((label) => JSON.stringify(label)).join(', ')}`,
      );

const CHECKERS: Readonly<Record<ScalarFieldType, Checker>> = {
  text: (value) => (typeof value === 'string' ? accept(value) : reject('text')),
  integer: integer('integer'),
  bigint: integer('bigint'),
  decimal: number('decimal'),
  float: number('float'),
  boolean,
  uuid: (value) =>
    typeof value === 'string' && UUID.test(value)
      ? accept(value)
      : reject('uuid'),
  enum: enumeration,
  date,
  time,
  timestamp: timestamp('timestamp'),
  timestamptz: timestamp('timestamptz'),
};

/**
 * Validates one scalar against a field type. `values` are the labels of an
 * `enum` field. Strings are accepted in each type's canonical text form.
 */
export function checkScalar(
  type: ScalarFieldType,
  value: unknown,
  values: ReadonlyArray<string> | null = null,
): ScalarCheck {
  return CHECKERS[type](value, values);
}
