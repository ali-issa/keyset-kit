/**
 * The filter a request carries (SPEC 4.1): a tree of conditions over
 * declared fields, combined with `and`, `or`, and `not`, plus `some` over
 * a relation's rows. Data, not URL syntax; an API layer builds it from
 * whatever grammar it parses.
 * @packageDocumentation
 */
import type { Operator } from '../definition/types';

export interface FilterCondition<TField extends string = string> {
  readonly field: TField;
  readonly op: Operator;
  /** Absent only for `isNull`, where it defaults to `true`. */
  readonly value?: unknown;
}

/** A relation name to the union of its field names. */
export type RelationFieldMap = Readonly<Record<string, string>>;

/** `{ relation, some }`: at least one related row satisfies `some`. */
export type RelationFilter<TRelationFields extends RelationFieldMap> = {
  [R in keyof TRelationFields & string]: {
    readonly relation: R;
    readonly some: Filter<TRelationFields[R]>;
  };
}[keyof TRelationFields & string];

export type Filter<
  TField extends string = string,
  TRelationFields extends RelationFieldMap = RelationFieldMap,
> =
  | FilterCondition<TField>
  | { readonly and: ReadonlyArray<Filter<TField, TRelationFields>> }
  | { readonly or: ReadonlyArray<Filter<TField, TRelationFields>> }
  | { readonly not: Filter<TField, TRelationFields> }
  | RelationFilter<TRelationFields>;
