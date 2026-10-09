/**
 * The closed vocabularies of a definition (SPEC 3.1) as type guards, so
 * validation narrows without assertions.
 * @packageDocumentation
 */
import type {
  AggregateFieldType,
  AggregateFunction,
  ArrayElementType,
  Collation,
  FieldType,
  ScalarFieldType,
  TextSearchMode,
} from './types';

export const SCALAR_FIELD_TYPES: ReadonlyArray<ScalarFieldType> = [
  'text',
  'integer',
  'bigint',
  'decimal',
  'float',
  'boolean',
  'uuid',
  'enum',
  'date',
  'time',
  'timestamp',
  'timestamptz',
];

const SCALAR: ReadonlySet<string> = new Set<string>(SCALAR_FIELD_TYPES);
const AGGREGATE_TYPES: ReadonlySet<string> = new Set<string>([
  'text',
  'integer',
  'bigint',
  'decimal',
  'float',
  'date',
  'time',
  'timestamp',
  'timestamptz',
]);
const AGGREGATE_FUNCTIONS: ReadonlySet<string> = new Set<string>([
  'count',
  'max',
  'min',
  'sum',
  'avg',
]);
const TEXT_SEARCH_MODES: ReadonlySet<string> = new Set<string>([
  'websearch',
  'plain',
  'phrase',
]);

export function isScalarFieldType(value: unknown): value is ScalarFieldType {
  return typeof value === 'string' && SCALAR.has(value);
}

export function isFieldType(value: unknown): value is FieldType {
  return value === 'array' || isScalarFieldType(value);
}

export function isArrayElementType(value: unknown): value is ArrayElementType {
  return isScalarFieldType(value) && value !== 'enum';
}

export function isAggregateFieldType(
  value: unknown,
): value is AggregateFieldType {
  return typeof value === 'string' && AGGREGATE_TYPES.has(value);
}

export function isAggregateFunction(
  value: unknown,
): value is AggregateFunction {
  return typeof value === 'string' && AGGREGATE_FUNCTIONS.has(value);
}

export function isTextSearchMode(value: unknown): value is TextSearchMode {
  return typeof value === 'string' && TEXT_SEARCH_MODES.has(value);
}

export function isCollation(value: unknown): value is Collation {
  return value === 'default' || value === 'insensitive';
}
