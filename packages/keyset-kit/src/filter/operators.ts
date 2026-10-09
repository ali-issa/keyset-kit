/**
 * The operator table (SPEC 4.2): which operators each field type accepts.
 * One table serves validation of a definition's `operators` option, the
 * planner's checks, and the documentation.
 * @packageDocumentation
 */
import type { FieldType, Operator } from '../definition/types';
import type { ArrayOperator, ComparisonOperator } from '../plan/types';

const EQUALITY: ReadonlyArray<Operator> = ['eq', 'ne'];
const MEMBERSHIP: ReadonlyArray<Operator> = ['in', 'nin'];
const ORDERED: ReadonlyArray<Operator> = ['gt', 'gte', 'lt', 'lte', 'between'];
const PATTERNS: ReadonlyArray<PatternOperator> = [
  'contains',
  'startsWith',
  'endsWith',
  'eqi',
  'containsi',
  'startsWithi',
  'endsWithi',
];
const ARRAY: ReadonlyArray<ArrayOperator> = [
  'contains',
  'containedBy',
  'overlaps',
];

/** Text operators that become `LIKE` or `ILIKE` patterns. */
export type PatternOperator =
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'eqi'
  | 'containsi'
  | 'startsWithi'
  | 'endsWithi';

const BY_TYPE: Readonly<Record<FieldType, ReadonlyArray<Operator>>> = {
  text: [...EQUALITY, ...MEMBERSHIP, ...ORDERED, ...PATTERNS],
  integer: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  bigint: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  decimal: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  float: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  boolean: EQUALITY,
  uuid: [...EQUALITY, ...MEMBERSHIP],
  enum: [...EQUALITY, ...MEMBERSHIP],
  date: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  time: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  timestamp: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  timestamptz: [...EQUALITY, ...MEMBERSHIP, ...ORDERED],
  array: ARRAY,
};

export const OPERATORS: ReadonlyArray<Operator> = [
  ...EQUALITY,
  ...MEMBERSHIP,
  ...ORDERED,
  'isNull',
  ...PATTERNS,
  'containedBy',
  'overlaps',
];

const ALL: ReadonlySet<string> = new Set<string>(OPERATORS);
const PATTERN_SET: ReadonlySet<string> = new Set<string>(PATTERNS);
const ARRAY_SET: ReadonlySet<string> = new Set<string>(ARRAY);

/** SQL comparison per operator; `undefined` for operators that are not comparisons. */
const COMPARISONS: Readonly<Partial<Record<Operator, ComparisonOperator>>> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

/** The operators a field of `type` accepts; `isNull` is added for nullable fields. */
export function operatorsFor(
  type: FieldType,
  nullable: boolean,
): ReadonlySet<Operator> {
  return new Set(nullable ? [...BY_TYPE[type], 'isNull'] : BY_TYPE[type]);
}

export function isOperator(value: unknown): value is Operator {
  return typeof value === 'string' && ALL.has(value);
}

export function isPatternOperator(value: Operator): value is PatternOperator {
  return PATTERN_SET.has(value);
}

export function isArrayOperator(value: Operator): value is ArrayOperator {
  return ARRAY_SET.has(value);
}

export function comparisonOf(value: Operator): ComparisonOperator | undefined {
  return COMPARISONS[value];
}
