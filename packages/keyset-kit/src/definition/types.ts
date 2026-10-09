/**
 * The definition (SPEC 3): what `defineKeyset` accepts and the normalized,
 * validated shape every other module reads from. Names of tables, columns,
 * and relations are opaque identifiers here; the adapter resolves them.
 * @packageDocumentation
 */

/** Field types with a scalar value (SPEC 4.3). */
export type ScalarFieldType =
  | 'text'
  | 'integer'
  | 'bigint'
  | 'decimal'
  | 'float'
  | 'boolean'
  | 'uuid'
  | 'enum'
  | 'date'
  | 'time'
  | 'timestamp'
  | 'timestamptz';

/** Element types an `array` field may declare. */
export type ArrayElementType = Exclude<ScalarFieldType, 'enum'>;

export type FieldType = ScalarFieldType | 'array';

export type AggregateFunction = 'count' | 'max' | 'min' | 'sum' | 'avg';

/** Types an aggregate field may declare: what `count`, `max`, `min`, `sum`, and `avg` produce. */
export type AggregateFieldType = Exclude<
  ScalarFieldType,
  'boolean' | 'uuid' | 'enum'
>;

/** Every filter operator (SPEC 4.2); which ones a field accepts depends on its type. */
export type Operator =
  | 'eq'
  | 'ne'
  | 'in'
  | 'nin'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'isNull'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'eqi'
  | 'containsi'
  | 'startsWithi'
  | 'endsWithi'
  | 'containedBy'
  | 'overlaps';

export type Collation = 'default' | 'insensitive';

interface FieldOptions {
  /** Whether the column can be `NULL`; enables `isNull`. Default false. */
  readonly nullable?: boolean | undefined;
  /** Whether the field may appear in `sort`. Default true, except for `array` fields. */
  readonly sortable?: boolean | undefined;
  /** A subset of the type's operators; default: all of them (SPEC 4.2). */
  readonly operators?: ReadonlyArray<Operator> | undefined;
}

export interface TextFieldInit extends FieldOptions {
  readonly column: string;
  readonly type: 'text';
  /** `insensitive` compares and sorts through `lower()`. Default `default`. */
  readonly collation?: Collation | undefined;
}

export interface EnumFieldInit extends FieldOptions {
  readonly column: string;
  readonly type: 'enum';
  /** The accepted labels; a value outside them is an invalid filter value. */
  readonly values: ReadonlyArray<string>;
}

export interface ArrayFieldInit extends FieldOptions {
  readonly column: string;
  readonly type: 'array';
  readonly of: ArrayElementType;
}

export interface ScalarFieldInit extends FieldOptions {
  readonly column: string;
  readonly type: Exclude<ScalarFieldType, 'text' | 'enum'>;
}

export type ColumnFieldInit =
  | TextFieldInit
  | EnumFieldInit
  | ArrayFieldInit
  | ScalarFieldInit;

export interface AggregateInit {
  /** A relation declared in `relations`. */
  readonly relation: string;
  readonly fn: AggregateFunction;
  /** A column of the relation's table; required unless `fn` is `count`. */
  readonly column?: string | undefined;
}

/** A value computed over a relation's rows: `count(*)`, `max(column)`, ... (SPEC 3.2). */
export interface AggregateFieldInit extends FieldOptions {
  readonly aggregate: AggregateInit;
  readonly type: AggregateFieldType;
}

export type FieldInit = ColumnFieldInit | AggregateFieldInit;

export type FieldsInit = Readonly<Record<string, FieldInit>>;

export interface RelationInit {
  readonly table: string;
  /** Join columns: each key is a column of `table`, its value a column of the main table. */
  readonly on: Readonly<Record<string, string>>;
  /** The relation's filterable fields; `relation.field` paths address them. */
  readonly fields?: Readonly<Record<string, ColumnFieldInit>> | undefined;
}

export type RelationsInit = Readonly<Record<string, RelationInit>>;

/** How a search term becomes a `tsquery` (SPEC 3.4). */
export type TextSearchMode = 'websearch' | 'plain' | 'phrase';

export type SearchInit =
  | {
      /** `ILIKE '%term%'` over the columns joined with spaces. */
      readonly mode: 'like';
      readonly columns: ReadonlyArray<string>;
    }
  | {
      readonly mode?: TextSearchMode | undefined;
      /** Columns joined with spaces and fed to `to_tsvector`. */
      readonly columns: ReadonlyArray<string>;
      readonly vector?: undefined;
      /** A text search configuration name; default `simple`. */
      readonly config?: string | undefined;
    }
  | {
      readonly mode?: TextSearchMode | undefined;
      readonly columns?: undefined;
      /** A `tsvector` column maintained by the application. */
      readonly vector: string;
      readonly config?: string | undefined;
    };

export type SortDirection = 'asc' | 'desc';

export interface SortField<TField extends string = string> {
  readonly field: TField;
  readonly direction: SortDirection;
}

/** `'name'`, `'-name'`, or `{ field, direction }`. */
export type SortInput<TField extends string = string> =
  | SortField<TField>
  | TField
  | `-${TField}`;

export interface SortInit<TField extends string = string> {
  /** Applied when a request has no `sort`; default: the key, ascending. */
  readonly default?: ReadonlyArray<SortInput<TField>> | undefined;
}

export interface PageInit {
  /** The used page size when a request names none. Default 20. */
  readonly default?: number | undefined;
  /** The largest page size a request may name. Default 100. */
  readonly max?: number | undefined;
  /** Whether `after` and `before` may be combined. Default false. */
  readonly range?: boolean | undefined;
}

/** Raw key material (at least 32 bytes) or an imported HMAC key. */
export type CursorSecret = string | Uint8Array | CryptoKey;

export interface CursorInit {
  readonly secret: CursorSecret;
  /** Secrets still accepted for verification during a rotation. */
  readonly previousSecrets?: ReadonlyArray<CursorSecret> | undefined;
  /** Seconds a cursor stays valid after it was issued; default: no expiry. */
  readonly ttl?: number | undefined;
}

export interface KeysetInit<
  TFields extends FieldsInit = FieldsInit,
  TRelations extends RelationsInit = RelationsInit,
> {
  /** The main table, as the base query exposes it (its name or alias). */
  readonly table: string;
  /** Field names forming a unique, non-null key; always the sort's tie-breaker. */
  readonly key: ReadonlyArray<keyof TFields & string>;
  readonly fields: TFields;
  readonly relations?: TRelations | undefined;
  readonly search?: SearchInit | undefined;
  readonly sort?: SortInit<keyof TFields & string> | undefined;
  readonly page?: PageInit | undefined;
  readonly cursor: CursorInit;
}

export type FieldNameOf<TFields extends FieldsInit> = keyof TFields & string;

/** `relation.field` paths of every relation field. */
export type RelationFieldPath<TRelations extends RelationsInit> = {
  [
    R in keyof TRelations & string
  ]: `${R}.${keyof TRelations[R]['fields'] & string}`;
}[keyof TRelations & string];

/** Field names of each relation, by relation name. */
export type RelationFieldsOf<TRelations extends RelationsInit> = {
  readonly [R in keyof TRelations & string]: keyof TRelations[R]['fields'] &
    string;
};

export type SortableFieldOf<TFields extends FieldsInit> = {
  [F in keyof TFields & string]: TFields[F] extends { readonly sortable: false }
    ? never
    : TFields[F] extends { readonly type: 'array' }
      ? never
      : F;
}[keyof TFields & string];

export interface ColumnField {
  readonly kind: 'column';
  readonly name: string;
  readonly column: string;
  readonly type: FieldType;
  readonly nullable: boolean;
  readonly sortable: boolean;
  readonly operators: ReadonlySet<Operator>;
  /** Enum labels, else `null`. */
  readonly values: ReadonlyArray<string> | null;
  /** Array element type, else `null`. */
  readonly of: ArrayElementType | null;
  readonly collation: Collation;
}

export interface AggregateField {
  readonly kind: 'aggregate';
  readonly name: string;
  readonly relation: string;
  readonly fn: AggregateFunction;
  readonly column: string | null;
  readonly type: AggregateFieldType;
  readonly nullable: boolean;
  readonly sortable: boolean;
  readonly operators: ReadonlySet<Operator>;
}

export type Field = ColumnField | AggregateField;

export interface Relation {
  readonly name: string;
  readonly table: string;
  /** `[relatedColumn, mainColumn]` pairs. */
  readonly on: ReadonlyArray<readonly [string, string]>;
  readonly fields: ReadonlyMap<string, ColumnField>;
}

export type SearchSpec =
  | { readonly mode: 'like'; readonly columns: ReadonlyArray<string> }
  | {
      readonly mode: TextSearchMode;
      readonly source:
        | { readonly columns: ReadonlyArray<string> }
        | { readonly vector: string };
      readonly config: string;
    };

/** The validated definition; `ReadonlyMap`s so names never meet a prototype. */
export interface KeysetDefinition {
  readonly table: string;
  readonly key: ReadonlyArray<string>;
  readonly fields: ReadonlyMap<string, Field>;
  readonly relations: ReadonlyMap<string, Relation>;
  readonly search: SearchSpec | null;
  readonly sort: { readonly default: ReadonlyArray<SortField> };
  readonly page: {
    readonly default: number;
    readonly max: number;
    readonly range: boolean;
  };
  readonly cursor: { readonly ttl: number | null };
}
