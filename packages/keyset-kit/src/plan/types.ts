/**
 * The query plan (SPEC 6): what the core hands an adapter. Every name in it
 * is a declared identifier from the definition, every value a validated
 * parameter, so an adapter renders it without re-checking anything.
 * @packageDocumentation
 */
import type {
  AggregateFieldType,
  AggregateFunction,
  FieldType,
  Relation,
  SortDirection,
  SortField,
  TextSearchMode,
} from '../definition/types';
import type { ScalarValue } from '../filter/values';

/** A sort key's value as the database returns it when cast to text; `null` for `NULL`. */
export type CursorValue = string | null;

export interface ColumnTarget {
  readonly kind: 'column';
  /** The main table, or a relation's table inside an `exists`. */
  readonly table: string;
  readonly column: string;
  readonly type: FieldType;
  /** Compare and order through `lower()` (insensitive collation). */
  readonly lower: boolean;
}

/** A scalar subquery over a relation's rows correlated with the main table. */
export interface AggregateTarget {
  readonly kind: 'aggregate';
  readonly relation: Relation;
  readonly fn: AggregateFunction;
  readonly column: string | null;
  readonly type: AggregateFieldType;
}

/** The main table's columns joined with spaces, as text; the `like` search source. */
export interface ConcatTarget {
  readonly kind: 'concat';
  readonly table: string;
  readonly columns: ReadonlyArray<string>;
}

export type Target = ColumnTarget | AggregateTarget | ConcatTarget;

export type ComparisonOperator = '=' | '!=' | '>' | '>=' | '<' | '<=';

export type ArrayOperator = 'contains' | 'containedBy' | 'overlaps';

export type Predicate =
  | { readonly kind: 'and'; readonly items: ReadonlyArray<Predicate> }
  | { readonly kind: 'or'; readonly items: ReadonlyArray<Predicate> }
  | { readonly kind: 'not'; readonly item: Predicate }
  | { readonly kind: 'literal'; readonly value: boolean }
  | {
      readonly kind: 'compare';
      readonly target: ColumnTarget | AggregateTarget;
      readonly operator: ComparisonOperator;
      readonly value: ScalarValue;
    }
  | {
      readonly kind: 'null';
      readonly target: ColumnTarget | AggregateTarget;
      /** `IS NOT NULL` when true. */
      readonly negate: boolean;
    }
  | {
      readonly kind: 'in';
      readonly target: ColumnTarget | AggregateTarget;
      /** Never empty: an empty list becomes a `literal`. */
      readonly values: ReadonlyArray<ScalarValue>;
      readonly negate: boolean;
    }
  | {
      readonly kind: 'between';
      readonly target: ColumnTarget | AggregateTarget;
      readonly low: ScalarValue;
      readonly high: ScalarValue;
    }
  | {
      readonly kind: 'like';
      readonly target: ColumnTarget | ConcatTarget;
      /** Already escaped; `%` and `_` in it are wildcards on purpose. */
      readonly pattern: string;
      /** `ILIKE` when true. */
      readonly caseInsensitive: boolean;
    }
  | {
      readonly kind: 'array';
      readonly target: ColumnTarget;
      readonly operator: ArrayOperator;
      readonly values: ReadonlyArray<ScalarValue>;
    }
  | {
      readonly kind: 'exists';
      readonly relation: Relation;
      /** Over the relation's table; `null` means any related row. */
      readonly predicate: Predicate | null;
    }
  | {
      readonly kind: 'textSearch';
      readonly table: string;
      readonly source:
        | { readonly columns: ReadonlyArray<string> }
        | { readonly vector: string };
      readonly mode: TextSearchMode;
      /** A validated configuration name, safe to emit as a literal. */
      readonly config: string;
      readonly term: string;
    };

export interface PlanKey {
  /** The selection alias the adapter reads the value back from. */
  readonly alias: string;
  readonly field: string;
  readonly target: ColumnTarget | AggregateTarget;
  /** The effective direction of the query (inverted on a backward page). */
  readonly direction: SortDirection;
  readonly nulls: 'first' | 'last';
}

export interface QueryPlan {
  readonly table: string;
  /** Sort keys in order, the tie-breaker included. */
  readonly keys: ReadonlyArray<PlanKey>;
  /** A backward page: rows come back in inverted order and are reversed. */
  readonly reversed: boolean;
  /** The request's filter and search; what `total` counts. */
  readonly filter: Predicate | null;
  /** The cursor predicates; never counted. */
  readonly seek: Predicate | null;
  /** `size + 1`, to detect a further page. */
  readonly limit: number;
  /** The used page size. */
  readonly size: number;
  readonly range: boolean;
  readonly after: string | null;
  readonly before: string | null;
  /** The resolved sort, tie-breaker included, in the request's directions. */
  readonly sort: ReadonlyArray<SortField>;
  /** The hash cursors are bound to. */
  readonly context: string;
}
