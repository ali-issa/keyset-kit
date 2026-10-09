import type { AliasableExpression } from 'kysely';

/**
 * Targets (SPEC 6) as Kysely expressions. Columns are `table.column`
 * references, so a `CamelCasePlugin` maps them like the caller's own
 * references; aggregates are correlated scalar subqueries; the search
 * concatenation is `concat_ws(' ', ...)`, which skips nulls.
 * @ref https://kysely.dev/docs/recipes/expressions
 * @ref https://www.postgresql.org/docs/current/functions-string.html (concat_ws)
 * @ref https://www.postgresql.org/docs/current/functions-subquery.html (scalar subqueries)
 * @packageDocumentation
 */
import type { AggregateTarget, ConcatTarget, Target } from 'keyset-kit';

import type { AnyExpressionBuilder, RenderContext } from '../types';

import { sql } from 'kysely';

function reference(table: string, column: string): string {
  return `${table}.${column}`;
}

function aggregate(
  eb: AnyExpressionBuilder,
  target: AggregateTarget,
  context: RenderContext,
): AliasableExpression<unknown> {
  const { relation, fn, column } = target;
  const value =
    column === null
      ? eb.fn.countAll()
      : eb.fn(fn, [eb.ref(reference(relation.table, column))]);
  let subquery = eb.selectFrom(relation.table).select(value.as('value'));
  for (const [related, main] of relation.on) {
    subquery = subquery.whereRef(
      reference(relation.table, related),
      '=',
      reference(context.table, main),
    );
  }
  return subquery;
}

/** `concat_ws(' ', t.a, t.b)`: the columns as one text, nulls skipped. */
export function concat(
  eb: AnyExpressionBuilder,
  target: ConcatTarget,
): AliasableExpression<string> {
  return eb.fn<string>('concat_ws', [
    sql.lit(' '),
    ...target.columns.map((column) => eb.ref(reference(target.table, column))),
  ]);
}

export function renderTarget(
  eb: AnyExpressionBuilder,
  target: Target,
  context: RenderContext,
): AliasableExpression<unknown> {
  if (target.kind === 'column') {
    const ref = eb.ref(reference(target.table, target.column));
    return target.lower ? eb.fn('lower', [ref]) : ref;
  }
  if (target.kind === 'aggregate') {
    return aggregate(eb, target, context);
  }
  return concat(eb, target);
}
