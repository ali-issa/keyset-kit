/**
 * The errors a request can cause (SPEC 9). Each is a class with structured
 * fields and a constant message: nothing about the server or the data is
 * in the text, and an API layer maps the class (or `code`) to its own error
 * document. Definition mistakes are `TypeError`s thrown by `defineKeyset`
 * and are not listed here.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--errors
 * @packageDocumentation
 */

export type KeysetErrorCode =
  | 'INVALID_CURSOR'
  | 'UNSUPPORTED_SORT'
  | 'UNSUPPORTED_FILTER'
  | 'INVALID_FILTER'
  | 'INVALID_FILTER_VALUE'
  | 'UNSUPPORTED_SEARCH'
  | 'INVALID_PAGE_SIZE'
  | 'PAGE_SIZE_EXCEEDED'
  | 'RANGE_NOT_SUPPORTED';

/** Base class of every request-time error; `code` is the stable discriminator. */
export abstract class KeysetError extends Error {
  abstract readonly code: KeysetErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Why a cursor was rejected; `malformed` covers everything before the signature check. */
export type InvalidCursorReason =
  | 'malformed'
  | 'signature'
  | 'version'
  | 'expired'
  | 'context';

export class InvalidCursorError extends KeysetError {
  readonly code = 'INVALID_CURSOR' as const;
  /** Which page parameter carried the cursor. */
  readonly parameter: 'after' | 'before';
  readonly reason: InvalidCursorReason;

  constructor(parameter: 'after' | 'before', reason: InvalidCursorReason) {
    super('The cursor is not valid for this request');
    this.parameter = parameter;
    this.reason = reason;
  }
}

export class UnsupportedSortError extends KeysetError {
  readonly code = 'UNSUPPORTED_SORT' as const;
  /** Every requested field that is unknown or not sortable, in request order. */
  readonly fields: ReadonlyArray<string>;

  constructor(fields: ReadonlyArray<string>) {
    super('The requested sort is not supported');
    this.fields = fields;
  }
}

export class UnsupportedFilterError extends KeysetError {
  readonly code = 'UNSUPPORTED_FILTER' as const;
  /** The field or relation path as the request named it. */
  readonly field: string;
  /** The operator, when the field is known but the operator is not allowed on it. */
  readonly operator: string | null;

  constructor(field: string, operator: string | null = null) {
    super('The requested filter is not supported');
    this.field = field;
    this.operator = operator;
  }
}

/** The filter is not a well-formed tree: a node with unknown members, a non-array `and`, and so on. */
export class InvalidFilterError extends KeysetError {
  readonly code = 'INVALID_FILTER' as const;
  /** The offending node's position: member names and array indexes from the root. */
  readonly path: ReadonlyArray<string | number>;

  constructor(path: ReadonlyArray<string | number>) {
    super('The filter is not well formed');
    this.path = path;
  }
}

export class InvalidFilterValueError extends KeysetError {
  readonly code = 'INVALID_FILTER_VALUE' as const;
  readonly field: string;
  readonly operator: string;
  /** What a valid value looks like, in the vocabulary of SPEC 4.3 (`text`, `integer`, `[low, high]`, ...). */
  readonly expected: string;

  constructor(field: string, operator: string, expected: string) {
    super('A filter value is not valid for its field');
    this.field = field;
    this.operator = operator;
    this.expected = expected;
  }
}

export class UnsupportedSearchError extends KeysetError {
  readonly code = 'UNSUPPORTED_SEARCH' as const;

  constructor() {
    super('This definition does not support text search');
  }
}

export class InvalidPageSizeError extends KeysetError {
  readonly code = 'INVALID_PAGE_SIZE' as const;
  readonly requested: unknown;

  constructor(requested: unknown) {
    super('The page size must be a positive integer');
    this.requested = requested;
  }
}

export class PageSizeExceededError extends KeysetError {
  readonly code = 'PAGE_SIZE_EXCEEDED' as const;
  readonly requested: number;
  readonly max: number;

  constructor(requested: number, max: number) {
    super('The page size exceeds the maximum');
    this.requested = requested;
    this.max = max;
  }
}

export class RangeNotSupportedError extends KeysetError {
  readonly code = 'RANGE_NOT_SUPPORTED' as const;

  constructor() {
    super('Range pagination is not supported by this definition');
  }
}

export function isKeysetError(value: unknown): value is KeysetError {
  return value instanceof KeysetError;
}
