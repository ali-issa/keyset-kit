/**
 * LIKE pattern escaping. PostgreSQL's default escape character is the
 * backslash; the three characters with meaning in a pattern (`%`, `_`, and
 * the escape itself) are prefixed with it so a client value is matched
 * literally. The pattern travels as a bound parameter, never as a string
 * literal, so no further quoting applies.
 * @ref https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE
 * @packageDocumentation
 */

export function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/gu, (char) => `\\${char}`);
}
