/**
 * Relation validation (SPEC 3.3): a related table, the join columns, and
 * the relation's own filterable column fields.
 * @packageDocumentation
 */
import type { ColumnField, Relation } from './types';

import { isRecord, ownEntries } from '../internal/object';
import {
  assertIdentifier,
  assertName,
  normalizeColumnField,
} from './normalize-fields';

function normalizeRelation(name: string, init: unknown): Relation {
  const what = `relations.${name}`;
  assertName('a relation name', name);
  if (!isRecord(init)) {
    throw new TypeError(`${what} must be an object`);
  }
  const table = assertIdentifier(`${what}.table`, init['table']);
  const on = init['on'];
  if (!isRecord(on)) {
    throw new TypeError(`${what}.on must be an object`);
  }
  const pairs = ownEntries(on).map(
    ([related, main]): readonly [string, string] => [
      assertIdentifier(`${what}.on keys`, related),
      assertIdentifier(`${what}.on.${related}`, main),
    ],
  );
  if (pairs.length === 0) {
    throw new TypeError(`${what}.on must name at least one column pair`);
  }
  const fieldInits = init['fields'] ?? {};
  if (!isRecord(fieldInits)) {
    throw new TypeError(`${what}.fields must be an object`);
  }
  const fields = new Map<string, ColumnField>();
  for (const [fieldName, fieldInit] of ownEntries(fieldInits)) {
    assertName('a relation field name', fieldName);
    if (isRecord(fieldInit) && 'aggregate' in fieldInit) {
      throw new TypeError(`${what}.fields.${fieldName} must be a column field`);
    }
    fields.set(
      fieldName,
      normalizeColumnField(`${what}.fields.${fieldName}`, fieldName, fieldInit),
    );
  }
  return { name, table, on: pairs, fields };
}

export function normalizeRelations(
  relations?: unknown,
): ReadonlyMap<string, Relation> {
  if (relations === undefined) {
    return new Map();
  }
  if (!isRecord(relations)) {
    throw new TypeError('relations must be an object');
  }
  return new Map(
    ownEntries(relations).map(([name, init]) => [
      name,
      normalizeRelation(name, init),
    ]),
  );
}
