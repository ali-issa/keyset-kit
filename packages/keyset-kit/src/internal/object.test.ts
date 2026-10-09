import { describe, expect, it } from 'vitest';

import {
  describe as describeValue,
  isRecord,
  ownEntries,
  ownMember,
  PROTO_KEYS,
} from './object';

const MISSING = ([] as Array<unknown>)[0];

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(1)).toBe(false);
    expect(isRecord(MISSING)).toBe(false);
  });
});

describe('ownEntries', () => {
  it('lists own members in insertion order', () => {
    expect(ownEntries({ b: 1, a: 2 })).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('skips prototype names that arrive through JSON', () => {
    const parsed: unknown = JSON.parse(
      '{"__proto__": {"x": 1}, "constructor": 2, "prototype": 3, "a": 4}',
    );
    expect(isRecord(parsed)).toBe(true);
    expect(ownEntries(parsed as Record<string, unknown>)).toEqual([['a', 4]]);
  });

  it('ignores inherited members', () => {
    const child = Object.create({ inherited: 1 }) as Record<string, unknown>;
    child['own'] = 2;
    expect(ownEntries(child)).toEqual([['own', 2]]);
  });
});

describe('ownMember', () => {
  it('reads own members and nothing else', () => {
    const value = { a: 1 };
    expect(ownMember(value, 'a')).toBe(1);
    expect(ownMember(value, 'toString')).toBeUndefined();
    expect(ownMember(value, 'missing')).toBeUndefined();
  });

  it('never reads a prototype name, even when it is an own member', () => {
    const parsed = JSON.parse('{"__proto__": 1, "constructor": 2}') as Record<
      string,
      unknown
    >;
    for (const key of PROTO_KEYS) {
      expect(ownMember(parsed, key)).toBeUndefined();
    }
  });
});

describe('describe', () => {
  it('renders JSON values as JSON text', () => {
    expect(describeValue('x')).toBe('"x"');
    expect(describeValue(1)).toBe('1');
    expect(describeValue(null)).toBe('null');
    expect(describeValue({ field: 1 })).toBe('{"field":1}');
    expect(describeValue([1, 'a'])).toBe('[1,"a"]');
  });

  it('falls back to the type name for values JSON cannot represent', () => {
    expect(describeValue(MISSING)).toBe('undefined');
    expect(describeValue(Symbol('s'))).toBe('symbol');
    expect(describeValue(() => 1)).toBe('function');
    expect(describeValue(10n)).toBe('bigint');
  });
});
