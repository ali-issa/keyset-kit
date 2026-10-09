/**
 * Field validation (SPEC 3.1, 3.2): every mistake is a `TypeError` naming
 * the option, thrown by `defineKeyset` before any request is served.
 * @packageDocumentation
 */
import type {
  AggregateField,
  ColumnField,
  Field,
  Operator,
  Relation,
} from './types';

import {
  isOperator,
  isPatternOperator,
  operatorsFor,
} from '../filter/operators';
import { isRecord, ownEntries, PROTO_KEYS } from '../internal/object';
import {
  isAggregateFieldType,
  isAggregateFunction,
  isArrayElementType,
  isCollation,
  isFieldType,
} from './field-types';

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

export function assertName(what: string, name: string): void {
  if (!NAME.test(name) || PROTO_KEYS.has(name)) {
    throw new TypeError(
      `${what} must match ${NAME.source}: ${JSON.stringify(name)}`,
    );
  }
}

export function assertIdentifier(what: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${what} must be a non-empty string`);
  }
  return value;
}

function optionalBoolean(
  what: string,
  value: unknown,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new TypeError(`${what} must be a boolean`);
  }
  return value;
}

function resolveOperators(
  what: string,
  allowed: ReadonlySet<Operator>,
  requested: unknown,
): ReadonlySet<Operator> {
  if (requested === undefined) {
    return allowed;
  }
  if (!Array.isArray(requested)) {
    throw new TypeError(`${what}.operators must be an array`);
  }
  const set = new Set<Operator>();
  for (const op of requested as ReadonlyArray<unknown>) {
    if (!isOperator(op) || !allowed.has(op)) {
      throw new TypeError(
        `${what}.operators contains an operator the field's type does not accept: ${JSON.stringify(op)}`,
      );
    }
    set.add(op);
  }
  return set;
}

function enumValues(what: string, values: unknown): ReadonlyArray<string> {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    new Set(values).size !== values.length
  ) {
    throw new TypeError(
      `${what}.values must be a non-empty array of distinct strings`,
    );
  }
  return values.map((label: unknown) => {
    if (typeof label !== 'string') {
      throw new TypeError(`${what}.values must contain strings only`);
    }
    return label;
  });
}

/** Validates a column field of the main table or of a relation. */
export function normalizeColumnField(
  what: string,
  name: string,
  init: unknown,
): ColumnField {
  if (!isRecord(init)) {
    throw new TypeError(`${what} must be an object`);
  }
  const column = assertIdentifier(`${what}.column`, init['column']);
  const type = init['type'];
  if (!isFieldType(type)) {
    throw new TypeError(
      `${what}.type is not a field type: ${JSON.stringify(type)}`,
    );
  }
  const nullable = optionalBoolean(`${what}.nullable`, init['nullable'], false);
  const sortable = optionalBoolean(
    `${what}.sortable`,
    init['sortable'],
    type !== 'array',
  );
  if (type === 'array' && sortable) {
    throw new TypeError(`${what}.sortable must be false for an array field`);
  }
  const collation = init['collation'] ?? 'default';
  if (!isCollation(collation)) {
    throw new TypeError(`${what}.collation must be "default" or "insensitive"`);
  }
  if (collation === 'insensitive' && type !== 'text') {
    throw new TypeError(`${what}.collation applies to text fields only`);
  }
  let of: ColumnField['of'] = null;
  if (type === 'array') {
    const element = init['of'];
    if (!isArrayElementType(element)) {
      throw new TypeError(
        `${what}.of must be a scalar field type other than enum`,
      );
    }
    of = element;
  }
  return {
    kind: 'column',
    name,
    column,
    type,
    nullable,
    sortable,
    operators: resolveOperators(
      what,
      operatorsFor(type, nullable),
      init['operators'],
    ),
    values: type === 'enum' ? enumValues(what, init['values']) : null,
    of,
    collation,
  };
}

function normalizeAggregateField(
  what: string,
  name: string,
  init: Record<string, unknown>,
  relations: ReadonlyMap<string, Relation>,
): AggregateField {
  const aggregate = init['aggregate'];
  if (!isRecord(aggregate)) {
    throw new TypeError(`${what}.aggregate must be an object`);
  }
  const relationName = assertIdentifier(
    `${what}.aggregate.relation`,
    aggregate['relation'],
  );
  if (!relations.has(relationName)) {
    throw new TypeError(
      `${what}.aggregate.relation names an undeclared relation: ${JSON.stringify(relationName)}`,
    );
  }
  const fn = aggregate['fn'];
  if (!isAggregateFunction(fn)) {
    throw new TypeError(
      `${what}.aggregate.fn must be count, max, min, sum, or avg`,
    );
  }
  const column =
    aggregate['column'] === undefined
      ? null
      : assertIdentifier(`${what}.aggregate.column`, aggregate['column']);
  if (fn !== 'count' && column === null) {
    throw new TypeError(`${what}.aggregate.column is required for ${fn}`);
  }
  const type = init['type'];
  if (!isAggregateFieldType(type)) {
    throw new TypeError(
      `${what}.type is not an aggregate field type: ${JSON.stringify(type)}`,
    );
  }
  const nullable = optionalBoolean(
    `${what}.nullable`,
    init['nullable'],
    fn !== 'count',
  );
  return {
    kind: 'aggregate',
    name,
    relation: relationName,
    fn,
    column,
    type,
    nullable,
    sortable: optionalBoolean(`${what}.sortable`, init['sortable'], true),
    operators: resolveOperators(
      what,
      aggregateOperators(type, nullable),
      init['operators'],
    ),
  };
}

/** An aggregate is a subquery, not a column: no `LIKE` patterns over it. */
function aggregateOperators(
  type: AggregateField['type'],
  nullable: boolean,
): ReadonlySet<Operator> {
  return new Set(
    [...operatorsFor(type, nullable)].filter((op) => !isPatternOperator(op)),
  );
}

export function normalizeFields(
  fields: unknown,
  relations: ReadonlyMap<string, Relation>,
): ReadonlyMap<string, Field> {
  if (!isRecord(fields)) {
    throw new TypeError('fields must be an object');
  }
  const out = new Map<string, Field>();
  for (const [name, init] of ownEntries(fields)) {
    const what = `fields.${name}`;
    assertName('a field name', name);
    if (!isRecord(init)) {
      throw new TypeError(`${what} must be an object`);
    }
    out.set(
      name,
      'aggregate' in init
        ? normalizeAggregateField(what, name, init, relations)
        : normalizeColumnField(what, name, init),
    );
  }
  if (out.size === 0) {
    throw new TypeError('fields must declare at least one field');
  }
  return out;
}
