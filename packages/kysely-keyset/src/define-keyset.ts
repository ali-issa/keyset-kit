/**
 * `createDefineKeyset<DB>()` (SPEC 10.1): a `defineKeyset` that checks
 * every table and column name of a definition against the application's
 * Kysely `DB` interface, and whose keysets carry `paginate`. Column names
 * are the interface's (camelCase under a `CamelCasePlugin`), exactly as
 * the application writes them in its own queries.
 * @ref https://kysely.dev/docs/getting-started#types
 * @ref https://kysely.dev/docs/plugins#camel-case-plugin
 * @packageDocumentation
 */
import type {
  AggregateFieldInit,
  ColumnFieldInit,
  CursorInit,
  KeysetInit,
  NoRelations,
  PageInit,
  SortInit,
  TextSearchMode,
} from 'keyset-kit';

import type { KyselyKeyset } from './types';

import { defineKeyset } from 'keyset-kit';

import { paginate } from './paginate';

type TableOf<TDatabase> = keyof TDatabase & string;
type ColumnOf<
  TDatabase,
  TTable extends keyof TDatabase,
> = keyof TDatabase[TTable] & string;

/** A column field whose `column` is one of the table's. */
export type TypedColumnFieldInit<
  TDatabase,
  TTable extends keyof TDatabase,
> = ColumnFieldInit & { readonly column: ColumnOf<TDatabase, TTable> };

/** A relation to one of the database's tables, joined on its columns. */
export interface TypedRelationInit<
  TDatabase,
  TTable extends keyof TDatabase,
  TRelated extends TableOf<TDatabase>,
> {
  readonly table: TRelated;
  /** Each key a column of the related table, its value a column of the main table. */
  readonly on: {
    readonly [K in ColumnOf<TDatabase, TRelated>]?: ColumnOf<TDatabase, TTable>;
  };
  readonly fields?:
    | Readonly<Record<string, TypedColumnFieldInit<TDatabase, TRelated>>>
    | undefined;
}

export type TypedRelationsInit<
  TDatabase,
  TTable extends keyof TDatabase,
> = Readonly<
  Record<
    string,
    {
      [TRelated in TableOf<TDatabase>]: TypedRelationInit<
        TDatabase,
        TTable,
        TRelated
      >;
    }[TableOf<TDatabase>]
  >
>;

/** What `RelationsOf` reads of a typed relation. */
interface RelationShape {
  readonly table: string;
  readonly fields?: Readonly<Record<string, ColumnFieldInit>> | undefined;
}

/** The typed relations as the core sees them: `on` is a plain name map. */
export type RelationsOf<
  TRelations extends Readonly<Record<string, RelationShape>>,
> = {
  readonly [TName in keyof TRelations]: {
    readonly table: TRelations[TName]['table'];
    readonly on: Readonly<Record<string, string>>;
    readonly fields: TRelations[TName]['fields'];
  };
};

/** An aggregate over a declared relation, of a column of that relation's table. */
export type TypedAggregateFieldInit<
  TDatabase,
  TRelations extends Readonly<
    Record<string, { readonly table: keyof TDatabase }>
  >,
> = AggregateFieldInit & {
  readonly aggregate: {
    [TName in keyof TRelations & string]: {
      readonly relation: TName;
      readonly column?:
        | ColumnOf<TDatabase, TRelations[TName]['table']>
        | undefined;
    };
  }[keyof TRelations & string];
};

export type TypedFieldsInit<
  TDatabase,
  TTable extends keyof TDatabase,
  TRelations extends Readonly<
    Record<string, { readonly table: keyof TDatabase }>
  >,
> = Readonly<
  Record<
    string,
    | TypedColumnFieldInit<TDatabase, TTable>
    | TypedAggregateFieldInit<TDatabase, TRelations>
  >
>;

export type TypedSearchInit<TDatabase, TTable extends keyof TDatabase> =
  | {
      readonly mode: 'like';
      readonly columns: ReadonlyArray<ColumnOf<TDatabase, TTable>>;
    }
  | {
      readonly mode?: TextSearchMode | undefined;
      readonly columns: ReadonlyArray<ColumnOf<TDatabase, TTable>>;
      readonly vector?: undefined;
      readonly config?: string | undefined;
    }
  | {
      readonly mode?: TextSearchMode | undefined;
      readonly columns?: undefined;
      readonly vector: ColumnOf<TDatabase, TTable>;
      readonly config?: string | undefined;
    };

export interface TypedKeysetInit<
  TDatabase,
  TTable extends TableOf<TDatabase>,
  TFields extends TypedFieldsInit<TDatabase, TTable, TRelations>,
  TRelations extends TypedRelationsInit<TDatabase, TTable>,
> {
  readonly table: TTable;
  readonly key: ReadonlyArray<keyof TFields & string>;
  readonly fields: TFields;
  readonly relations?: TRelations | undefined;
  readonly search?: TypedSearchInit<TDatabase, TTable> | undefined;
  readonly sort?: SortInit<keyof TFields & string> | undefined;
  readonly page?: PageInit | undefined;
  readonly cursor: CursorInit;
}

/** The `defineKeyset` of one database type. */
export type DefineKeyset<TDatabase> = <
  TTable extends TableOf<TDatabase>,
  const TFields extends TypedFieldsInit<TDatabase, TTable, TRelations>,
  const TRelations extends TypedRelationsInit<TDatabase, TTable> = NoRelations,
>(
  init: TypedKeysetInit<TDatabase, TTable, TFields, TRelations>,
) => KyselyKeyset<TFields, RelationsOf<TRelations>>;

/**
 * Binds `defineKeyset` to the application's `DB` interface. Call it once,
 * export the result, and define keysets with it:
 *
 * ```ts
 * export const defineKeyset = createDefineKeyset<DB>();
 * ```
 */
export function createDefineKeyset<TDatabase>(): DefineKeyset<TDatabase> {
  return <
    TTable extends TableOf<TDatabase>,
    const TFields extends TypedFieldsInit<TDatabase, TTable, TRelations>,
    const TRelations extends TypedRelationsInit<TDatabase, TTable> =
      NoRelations,
  >(
    init: TypedKeysetInit<TDatabase, TTable, TFields, TRelations>,
  ): KyselyKeyset<TFields, RelationsOf<TRelations>> => {
    // The typed `on` (a partial map over the related table's columns) is
    // the core's `Record<string, string>` at runtime; nothing else differs.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: TypedRelationInit.on narrows RelationInit.on's keys per table; the runtime shape is identical
    const coreInit = init as unknown as KeysetInit<
      TFields,
      RelationsOf<TRelations>
    >;
    const keyset = defineKeyset(coreInit);
    return {
      ...keyset,
      paginate: async (query, request, options) =>
        paginate(keyset, query, request, options),
    };
  };
}
