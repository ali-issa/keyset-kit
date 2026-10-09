/**
 * One condition becomes one predicate (SPEC 4.2, 4.3): the operator is
 * checked against the field, the value against the field's type, and the
 * result names a target the adapter can render.
 * @packageDocumentation
 */
import type {
  Field,
  Operator,
  Relation,
  ScalarFieldType,
} from '../definition/types';
import type { AggregateTarget, ColumnTarget, Predicate } from '../plan/types';
import type { PatternOperator } from './operators';
import type { ScalarValue } from './values';

import { InvalidFilterValueError, UnsupportedFilterError } from '../errors';
import { escapeLike } from '../internal/like';
import { comparisonOf, isArrayOperator, isPatternOperator } from './operators';
import { checkScalar } from './values';

const BETWEEN_ARITY = 2;

export function targetOf(
  table: string,
  field: Field,
  relations: ReadonlyMap<string, Relation>,
): ColumnTarget | AggregateTarget {
  if (field.kind === 'column') {
    return {
      kind: 'column',
      table,
      column: field.column,
      type: field.type,
      lower: field.collation === 'insensitive',
    };
  }
  const relation = relations.get(field.relation);
  if (relation === undefined) {
    throw new TypeError(
      `aggregate field ${field.name} names an undeclared relation`,
    );
  }
  return {
    kind: 'aggregate',
    relation,
    fn: field.fn,
    column: field.column,
    type: field.type,
  };
}

/** The type a single value of the field has: the element type for arrays. */
function scalarTypeOf(field: Field): ScalarFieldType {
  if (field.kind === 'aggregate') {
    return field.type;
  }
  if (field.type === 'array') {
    return field.of ?? 'text';
  }
  return field.type;
}

function scalar(
  field: Field,
  op: Operator,
  value: unknown,
  name: string,
): ScalarValue {
  const check = checkScalar(
    scalarTypeOf(field),
    value,
    field.kind === 'column' ? field.values : null,
  );
  if (!check.ok) {
    throw new InvalidFilterValueError(name, op, check.expected);
  }
  const lower = field.kind === 'column' && field.collation === 'insensitive';
  return lower && typeof check.value === 'string'
    ? check.value.toLowerCase()
    : check.value;
}

function scalars(
  field: Field,
  op: Operator,
  value: unknown,
  name: string,
): Array<ScalarValue> {
  if (!Array.isArray(value)) {
    throw new InvalidFilterValueError(name, op, 'an array of values');
  }
  return value.map((item: unknown) => scalar(field, op, item, name));
}

const PATTERNS: Readonly<Record<PatternOperator, (escaped: string) => string>> =
  {
    contains: (escaped) => `%${escaped}%`,
    containsi: (escaped) => `%${escaped}%`,
    startsWith: (escaped) => `${escaped}%`,
    startsWithi: (escaped) => `${escaped}%`,
    endsWith: (escaped) => `%${escaped}`,
    endsWithi: (escaped) => `%${escaped}`,
    eqi: (escaped) => escaped,
  };

function patternPredicate(
  target: ColumnTarget,
  insensitiveField: boolean,
  op: PatternOperator,
  value: unknown,
  name: string,
): Predicate {
  if (typeof value !== 'string') {
    throw new InvalidFilterValueError(name, op, 'text');
  }
  return {
    kind: 'like',
    target: { ...target, lower: false },
    pattern: PATTERNS[op](escapeLike(value)),
    caseInsensitive: insensitiveField || op.endsWith('i'),
  };
}

function nullPredicate(
  target: ColumnTarget | AggregateTarget,
  op: Operator,
  value: unknown,
  name: string,
): Predicate {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new InvalidFilterValueError(name, op, 'boolean');
  }
  return { kind: 'null', target, negate: value === false };
}

/**
 * The predicate of `field op value`, where `name` is the path the request
 * used (for errors) and `table` the table the field's column belongs to.
 */
export function conditionPredicate(
  table: string,
  relations: ReadonlyMap<string, Relation>,
  field: Field,
  op: Operator,
  value: unknown,
  name: string,
): Predicate {
  if (!field.operators.has(op)) {
    throw new UnsupportedFilterError(name, op);
  }
  const target = targetOf(table, field, relations);
  if (op === 'isNull') {
    return nullPredicate(target, op, value, name);
  }
  if (target.kind === 'column' && target.type === 'array') {
    if (!isArrayOperator(op)) {
      throw new UnsupportedFilterError(name, op);
    }
    return {
      kind: 'array',
      target,
      operator: op,
      values: scalars(field, op, value, name),
    };
  }
  const comparison = comparisonOf(op);
  if (comparison !== undefined) {
    return {
      kind: 'compare',
      target,
      operator: comparison,
      value: scalar(field, op, value, name),
    };
  }
  if (isPatternOperator(op)) {
    if (target.kind !== 'column' || field.kind !== 'column') {
      throw new UnsupportedFilterError(name, op);
    }
    return patternPredicate(
      target,
      field.collation === 'insensitive',
      op,
      value,
      name,
    );
  }
  if (op === 'between') {
    const values = scalars(field, op, value, name);
    const [low, high] = values;
    if (
      values.length !== BETWEEN_ARITY ||
      low === undefined ||
      high === undefined
    ) {
      throw new InvalidFilterValueError(name, op, '[low, high]');
    }
    return { kind: 'between', target, low, high };
  }
  const values = scalars(field, op, value, name);
  return values.length === 0
    ? { kind: 'literal', value: op === 'nin' }
    : { kind: 'in', target, values, negate: op === 'nin' };
}
