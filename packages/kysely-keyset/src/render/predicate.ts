import type { Expression, SqlBool } from 'kysely';

/**
 * Predicates (SPEC 6) as Kysely boolean expressions. Every value becomes
 * a bound parameter; the one literal, the text search configuration, was
 * validated by the definition against `regconfig`'s name syntax.
 * @ref https://kysely.dev/docs/recipes/expressions
 * @ref https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE
 * @ref https://www.postgresql.org/docs/current/functions-array.html (`@>`, `<@`, `&&`)
 * @ref https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-PARSING-QUERIES
 * @packageDocumentation
 */
import type {
  ArrayOperator,
  Predicate,
  Relation,
  TextSearchMode,
} from 'keyset-kit';

import type { AnyExpressionBuilder, RenderContext } from '../types';

import { sql } from 'kysely';

import { concat, renderTarget } from './target';

type Bool = Expression<SqlBool>;

const ARRAY_OPERATORS: Readonly<Record<ArrayOperator, '@>' | '<@' | '&&'>> = {
  contains: '@>',
  containedBy: '<@',
  overlaps: '&&',
};

/** The `tsquery` parser per mode; `websearch_to_tsquery` never raises on user input. */
const QUERY_FUNCTIONS: Readonly<Record<TextSearchMode, string>> = {
  websearch: 'websearch_to_tsquery',
  plain: 'plainto_tsquery',
  phrase: 'phraseto_tsquery',
};

/** The plan's predicate kinds are closed; a new one is a bug here, not a runtime path. */
function unreachable(node: never): never {
  throw new TypeError(`unknown predicate: ${JSON.stringify(node)}`);
}

function exists(
  eb: AnyExpressionBuilder,
  relation: Relation,
  predicate: Predicate | null,
  context: RenderContext,
): Bool {
  let subquery = eb
    .selectFrom(relation.table)
    .select((inner) => inner.lit(1).as('one'));
  for (const [related, main] of relation.on) {
    subquery = subquery.whereRef(
      `${relation.table}.${related}`,
      '=',
      `${context.table}.${main}`,
    );
  }
  if (predicate !== null) {
    subquery = subquery.where((inner) =>
      renderPredicate(inner, predicate, { table: relation.table }),
    );
  }
  return eb.exists(subquery);
}

function textSearch(
  eb: AnyExpressionBuilder,
  node: Extract<Predicate, { kind: 'textSearch' }>,
): Bool {
  const config = sql.lit(node.config);
  const vector =
    'vector' in node.source
      ? eb.ref(`${node.table}.${node.source.vector}`)
      : eb.fn('to_tsvector', [
          config,
          concat(eb, {
            kind: 'concat',
            table: node.table,
            columns: node.source.columns,
          }),
        ]);
  const query = eb.fn(QUERY_FUNCTIONS[node.mode], [config, eb.val(node.term)]);
  return eb(vector, '@@', query);
}

export function renderPredicate(
  eb: AnyExpressionBuilder,
  node: Predicate,
  context: RenderContext,
): Bool {
  switch (node.kind) {
    case 'and':
      return node.items.length === 0
        ? eb.lit(true)
        : eb.and(node.items.map((item) => renderPredicate(eb, item, context)));
    case 'or':
      return node.items.length === 0
        ? eb.lit(false)
        : eb.or(node.items.map((item) => renderPredicate(eb, item, context)));
    case 'not':
      return eb.not(renderPredicate(eb, node.item, context));
    case 'literal':
      return eb.lit(node.value);
    case 'compare':
      return eb(
        renderTarget(eb, node.target, context),
        node.operator,
        node.value,
      );
    case 'null':
      return eb(
        renderTarget(eb, node.target, context),
        node.negate ? 'is not' : 'is',
        null,
      );
    case 'in':
      return eb(
        renderTarget(eb, node.target, context),
        node.negate ? 'not in' : 'in',
        node.values,
      );
    case 'between':
      return eb.between(
        renderTarget(eb, node.target, context),
        node.low,
        node.high,
      );
    case 'like':
      return eb(
        renderTarget(eb, node.target, context),
        node.caseInsensitive ? 'ilike' : 'like',
        node.pattern,
      );
    case 'array':
      return eb(
        renderTarget(eb, node.target, context),
        ARRAY_OPERATORS[node.operator],
        eb.val(node.values),
      );
    case 'exists':
      return exists(eb, node.relation, node.predicate, context);
    case 'textSearch':
      return textSearch(eb, node);
    default:
      return unreachable(node);
  }
}
