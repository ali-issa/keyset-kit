import type { ExpressionBuilder, SelectQueryBuilder } from 'kysely';

/**
 * The adapter's own types: the widened Kysely shapes it renders onto, the
 * pagination options, and the query event.
 * @packageDocumentation
 */
import type {
  FieldsInit,
  Keyset,
  KeysetRequestOf,
  Page,
  RelationsInit,
} from 'keyset-kit';

/**
 * The database shape rendering happens against: every table and column
 * name the plan carries was validated by the definition, so the caller's
 * `DB` type adds nothing here. The caller's builder is widened to this
 * once, in `paginate`.
 */
export type AnyDatabase = Record<string, Record<string, unknown>>;

export type AnyExpressionBuilder = ExpressionBuilder<AnyDatabase, string>;

export type AnyQuery<O> = SelectQueryBuilder<AnyDatabase, string, O>;

/** What rendering needs beyond the node itself. */
export interface RenderContext {
  /** The main table, as the base query names it: the correlation side of aggregates. */
  readonly table: string;
}

/** One executed query, reported to `onQuery`. */
export interface QueryEvent {
  readonly kind: 'page' | 'total';
  readonly sql: string;
  readonly parameters: ReadonlyArray<unknown>;
  readonly durationMs: number;
  readonly rowCount: number;
}

export interface PaginateOptions {
  /** Run a second query counting the rows the filter (not the cursors) selects. Default false. */
  readonly total?: boolean | undefined;
  /** Called after each query with its SQL, parameters, and timing. */
  readonly onQuery?: ((event: QueryEvent) => void) | undefined;
}

/** A keyset that paginates Kysely select queries. */
export interface KyselyKeyset<
  TFields extends FieldsInit = FieldsInit,
  TRelations extends RelationsInit = RelationsInit,
> extends Keyset<TFields, TRelations> {
  /**
   * Plans `request`, renders the plan onto `query`, runs it, and assembles
   * the page. `query` must be a plain selection of the definition's table:
   * its `order by`, `limit`, and `offset` are replaced.
   */
  paginate<TDatabase, TTable extends keyof TDatabase, TRow>(
    query: SelectQueryBuilder<TDatabase, TTable, TRow>,
    request: KeysetRequestOf<TFields, TRelations>,
    options?: PaginateOptions,
  ): Promise<Page<TRow>>;
}
