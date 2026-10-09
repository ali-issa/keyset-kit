/**
 * Prototype-safe object helpers (SPEC 2.3). Names that arrive in a request,
 * a filter, or a definition become object keys only after these checks, so
 * `__proto__` and friends never reach a lookup or an assignment.
 * @packageDocumentation
 */

/** Keys that must never be used as names: they alias prototype members. */
export const PROTO_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own entries of a plain object, in insertion order, skipping prototype keys. */
export function ownEntries(
  value: Readonly<Record<string, unknown>>,
): Array<[string, unknown]> {
  return Object.keys(value)
    .filter((key) => !PROTO_KEYS.has(key))
    .map((key) => [key, value[key]]);
}

/** An own, non-prototype member, or `undefined`. */
export function ownMember(
  value: Readonly<Record<string, unknown>>,
  key: string,
): unknown {
  return PROTO_KEYS.has(key) || !Object.hasOwn(value, key)
    ? undefined
    : value[key];
}

/** A value's JSON text for an error message; its type name when it has none. */
export function describe(value: unknown): string {
  try {
    const text: unknown = JSON.stringify(value);
    if (typeof text === 'string') {
      return text;
    }
  } catch {
    // Circular, or a bigint: not representable; fall through to the type name.
  }
  return typeof value;
}
