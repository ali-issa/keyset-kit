import { createHash, createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decodeBase64Url, toBytes, utf8Encode } from './base64url';
import { hmacSign, hmacVerify, importHmacKey, sha256Base64Url } from './crypto';

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('sha256Base64Url', () => {
  it('matches the known digest of "abc"', async () => {
    // FIPS 180-4 example vector.
    const digest = decodeBase64Url(await sha256Base64Url('abc'));
    expect(hex(digest ?? new Uint8Array())).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the UTF-8 bytes of the text', async () => {
    const text = 'sort=-créé,id';
    const expected = createHash('sha256')
      .update(text, 'utf8')
      .digest('base64url');
    expect(await sha256Base64Url(text)).toBe(expected);
  });
});

describe('hmac', () => {
  it('signs like HMAC-SHA256 (RFC 4231 test case 2)', async () => {
    const key = await importHmacKey('Jefe');
    const tag = await hmacSign(key, utf8Encode('what do ya want for nothing?'));
    expect(hex(tag)).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('accepts raw key bytes', async () => {
    const raw = toBytes(new TextEncoder().encode('k'.repeat(32)));
    const key = await importHmacKey(raw);
    const data = utf8Encode('payload');
    const expected = createHmac('sha256', Buffer.from(raw))
      .update(data)
      .digest();
    expect(hex(await hmacSign(key, data))).toBe(expected.toString('hex'));
  });

  it('verifies a tag only under the key that produced it, over the same bytes', async () => {
    const key = await importHmacKey('x'.repeat(32));
    const other = await importHmacKey('y'.repeat(32));
    const data = utf8Encode('payload');
    const tag = await hmacSign(key, data);
    expect(await hmacVerify(key, tag, data)).toBe(true);
    expect(await hmacVerify(other, tag, data)).toBe(false);
    expect(await hmacVerify(key, tag, utf8Encode('payloae'))).toBe(false);
    const flipped = toBytes(tag);
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(await hmacVerify(key, flipped, data)).toBe(false);
  });
});
