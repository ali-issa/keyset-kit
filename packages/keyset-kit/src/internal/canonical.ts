/**
 * Canonical JSON for hashing: object members sorted by key, no whitespace,
 * `undefined` members dropped. Two structurally equal values always produce
 * the same text, so the hash of a filter or a sort does not depend on the
 * order a caller wrote the members in.
 * @ref https://www.rfc-editor.org/rfc/rfc8785 (the member ordering rule; number formatting is JSON.stringify's)
 * @packageDocumentation
 */
import { isRecord } from './object';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => canonicalize(item) ?? null);
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).toSorted()) {
      const member = canonicalize(value[key]);
      if (member !== undefined) {
        out[key] = member;
      }
    }
    return out;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value) ?? null);
}
