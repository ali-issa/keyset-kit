import { describe, expect, it } from 'vitest';

import { canonicalJson } from './canonical';

const MISSING = ([] as Array<unknown>)[0];

describe('canonicalJson', () => {
  it('sorts object members at every depth', () => {
    expect(canonicalJson({ b: { d: 1, c: 2 }, a: [{ z: 1, y: 2 }] })).toBe(
      '{"a":[{"y":2,"z":1}],"b":{"c":2,"d":1}}',
    );
  });

  it('is independent of the order members were written in', () => {
    const first = canonicalJson({
      sort: 'a',
      filter: { op: 'eq', field: 'x' },
    });
    const second = canonicalJson({
      filter: { field: 'x', op: 'eq' },
      sort: 'a',
    });
    expect(first).toBe(second);
  });

  it('drops undefined members and nulls undefined array items', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
    expect(canonicalJson(MISSING)).toBe('null');
  });

  it('renders bigints as decimal strings', () => {
    expect(canonicalJson({ n: 12345678901234567890n })).toBe(
      '{"n":"12345678901234567890"}',
    );
  });

  it('leaves scalars to JSON.stringify', () => {
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(1.5)).toBe('1.5');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
  });
});
