import { describe, expect, it } from 'vitest';

import {
  decodeBase64Url,
  encodeBase64Url,
  toBytes,
  utf8Decode,
  utf8Encode,
} from './base64url';

const ASCII = new TextEncoder();

describe('base64url', () => {
  // RFC 4648 section 10 vectors, with the URL alphabet and no padding.
  it.each([
    ['', ''],
    ['f', 'Zg'],
    ['fo', 'Zm8'],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg'],
    ['fooba', 'Zm9vYmE'],
    ['foobar', 'Zm9vYmFy'],
  ])('encodes %j as %j without padding', (text, expected) => {
    expect(encodeBase64Url(toBytes(ASCII.encode(text)))).toBe(expected);
    expect(decodeBase64Url(expected)).toEqual(toBytes(ASCII.encode(text)));
  });

  it('uses - and _ for the two bytes the standard alphabet encodes as + and /', () => {
    const bytes = new Uint8Array(new ArrayBuffer(3));
    bytes.set([0xfb, 0xff, 0xbf]);
    expect(encodeBase64Url(bytes)).toBe('-_-_');
    expect(decodeBase64Url('-_-_')).toEqual(bytes);
  });

  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(new ArrayBuffer(256));
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index;
    }
    const decoded = decodeBase64Url(encodeBase64Url(bytes));
    expect(decoded).toEqual(bytes);
    expect(decoded?.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('rejects the standard alphabet, padding, and impossible lengths', () => {
    expect(decodeBase64Url('Zm9v+')).toBeNull();
    expect(decodeBase64Url('Zm9/')).toBeNull();
    expect(decodeBase64Url('Zg==')).toBeNull();
    expect(decodeBase64Url('Z')).toBeNull();
    expect(decodeBase64Url('Zm9vY')).toBeNull();
    expect(decodeBase64Url('a b')).toBeNull();
  });
});

describe('utf8', () => {
  it('round-trips text outside ASCII', () => {
    const text = 'héllo, 世界 🌍';
    expect(utf8Decode(utf8Encode(text))).toBe(text);
  });

  it('returns null for bytes that are not UTF-8', () => {
    const bytes = new Uint8Array(new ArrayBuffer(2));
    bytes.set([0xff, 0xfe]);
    expect(utf8Decode(bytes)).toBeNull();
  });

  it('copies a view into its own buffer', () => {
    const source = new Uint8Array([1, 2, 3, 4]);
    const copy = toBytes(source.subarray(1, 3));
    expect([...copy]).toEqual([2, 3]);
    expect(copy.buffer.byteLength).toBe(2);
    source[1] = 9;
    expect(copy[0]).toBe(2);
  });
});
