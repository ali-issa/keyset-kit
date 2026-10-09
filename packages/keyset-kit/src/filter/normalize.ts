/**
 * Filter normalization (SPEC 4.1): the request's tree becomes a
 * `Predicate` over validated targets and values. Unknown fields and
 * operators, bad values, and malformed nodes are errors; nothing is
 * dropped.
 * @packageDocumentation
 */
import type { Field, KeysetDefinition, Relation } from '../definition/types';
import type { Predicate } from '../plan/types';
import type { Filter } from './types';

import { InvalidFilterError, UnsupportedFilterError } from '../errors';
import { describe, isRecord, ownMember } from '../internal/object';
import { conditionPredicate } from './condition';
import { isOperator } from './operators';

type Path = ReadonlyArray<string | number>;

interface Scope {
  /** The table the fields belong to. */
  readonly table: string;
  readonly fields: ReadonlyMap<string, Field>;
  /** Relations addressable from this scope; none inside a relation. */
  readonly relations: ReadonlyMap<string, Relation>;
}

const RELATION_NODE_SIZE = 2;

function relationScope(relation: Relation): Scope {
  return {
    table: relation.table,
    fields: relation.fields,
    relations: new Map(),
  };
}

function condition(
  scope: Scope,
  node: Record<string, unknown>,
  path: Path,
): Predicate {
  const name = node['field'];
  const op = node['op'];
  if (typeof name !== 'string' || typeof op !== 'string') {
    throw new InvalidFilterError(path);
  }
  if (!isOperator(op)) {
    throw new UnsupportedFilterError(name, op);
  }
  const dot = name.indexOf('.');
  if (dot !== -1) {
    const relation = scope.relations.get(name.slice(0, dot));
    const field = relation?.fields.get(name.slice(dot + 1));
    if (relation === undefined || field === undefined) {
      throw new UnsupportedFilterError(name);
    }
    const inner = relationScope(relation);
    const predicate = conditionPredicate(
      inner.table,
      inner.relations,
      field,
      op,
      node['value'],
      name,
    );
    return { kind: 'exists', relation, predicate };
  }
  const field = scope.fields.get(name);
  if (field === undefined) {
    throw new UnsupportedFilterError(name);
  }
  return conditionPredicate(
    scope.table,
    scope.relations,
    field,
    op,
    node['value'],
    name,
  );
}

function relationNode(
  scope: Scope,
  node: Record<string, unknown>,
  path: Path,
): Predicate {
  const name = ownMember(node, 'relation');
  const relation =
    typeof name === 'string' ? scope.relations.get(name) : undefined;
  if (relation === undefined) {
    throw new UnsupportedFilterError(
      typeof name === 'string' ? name : describe(name),
    );
  }
  const predicate = normalizeNode(
    relationScope(relation),
    ownMember(node, 'some'),
    [...path, 'some'],
  );
  return { kind: 'exists', relation, predicate };
}

function normalizeNode(scope: Scope, node: unknown, path: Path): Predicate {
  if (!isRecord(node)) {
    throw new InvalidFilterError(path);
  }
  const keys = Object.keys(node).filter((key) => node[key] !== undefined);
  const [head] = keys;
  if ((head === 'and' || head === 'or') && keys.length === 1) {
    const items = ownMember(node, head);
    if (!Array.isArray(items)) {
      throw new InvalidFilterError(path);
    }
    return {
      kind: head,
      items: items.map((item: unknown, index) =>
        normalizeNode(scope, item, [...path, head, index]),
      ),
    };
  }
  if (head === 'not' && keys.length === 1) {
    return {
      kind: 'not',
      item: normalizeNode(scope, ownMember(node, 'not'), [...path, 'not']),
    };
  }
  if (
    keys.length === RELATION_NODE_SIZE &&
    keys.includes('relation') &&
    keys.includes('some')
  ) {
    return relationNode(scope, node, path);
  }
  if (
    keys.includes('field') &&
    keys.includes('op') &&
    keys.every((key) => key === 'field' || key === 'op' || key === 'value')
  ) {
    return condition(scope, node, path);
  }
  throw new InvalidFilterError(path);
}

/** The request's filter as a predicate over the definition; `null` when absent. */
export function normalizeFilter(
  definition: KeysetDefinition,
  filter?: Filter<string, Readonly<Record<string, string>>>,
): Predicate | null {
  if (filter === undefined) {
    return null;
  }
  return normalizeNode(
    {
      table: definition.table,
      fields: definition.fields,
      relations: definition.relations,
    },
    filter,
    [],
  );
}
