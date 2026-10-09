import { describe, expect, it } from 'vitest';

import {
  decodeBase64Url,
  encodeBase64Url,
  utf8Decode,
  utf8Encode,
} from '../internal/base64url';
import { hmacSign, importHmacKey } from '../internal/crypto';
import { OTHER_SECRET, SECRET, thrown } from '../test-support/fixtures';
import { createCursorCodec, CURSOR_VERSION, MIN_SECRET_BYTES } from './codec';

const CONTEXT = 'ctx-a';
const VALUES = ['2024-01-01 00:00:00+00', null, 'k'];

/** A cursor over any payload text, signed with `secret`: for shaping bad inputs. */
async function forge(secret: string, payloadText: string): Promise<string> {
  const bytes = utf8Encode(payloadText);
  const tag = await hmacSign(await importHmacKey(secret), bytes);
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(tag)}`;
}

function payloadOf(cursor: string): Record<string, unknown> {
  const text = utf8Decode(
    decodeBase64Url(cursor.split('.')[0] ?? '') ?? utf8Encode(''),
  );
  return JSON.parse(text ?? '{}') as Record<string, unknown>;
}

describe('createCursorCodec', () => {
  it('round-trips the values when the context matches', async () => {
    const codec = createCursorCodec({ secret: SECRET });
    const cursor = await codec.encode(VALUES, CONTEXT);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u);
    expect(await codec.decode(cursor, CONTEXT, VALUES.length)).toEqual({
      ok: true,
      values: VALUES,
    });
  });

  it('writes the versioned payload with the issue time', async () => {
    const codec = createCursorCodec({
      secret: SECRET,
      now: () => 1_700_000_000,
    });
    const payload = payloadOf(await codec.encode(VALUES, CONTEXT));
    expect(payload).toEqual({
      v: CURSOR_VERSION,
      k: VALUES,
      c: CONTEXT,
      t: 1_700_000_000,
    });
  });

  it('rejects a cursor issued for another sort, filter, or search', async () => {
    const codec = createCursorCodec({ secret: SECRET });
    const cursor = await codec.encode(VALUES, CONTEXT);
    expect(await codec.decode(cursor, 'ctx-b', VALUES.length)).toEqual({
      ok: false,
      reason: 'context',
    });
  });

  it('rejects a tampered payload or tag and a cursor from another secret', async () => {
    const codec = createCursorCodec({ secret: SECRET });
    const cursor = await codec.encode(VALUES, CONTEXT);
    const [payload, tag] = cursor.split('.') as [string, string];
    const otherPayload = encodeBase64Url(
      utf8Encode(JSON.stringify({ ...payloadOf(cursor), k: ['x', null, 'k'] })),
    );
    expect(await codec.decode(`${otherPayload}.${tag}`, CONTEXT, 3)).toEqual({
      ok: false,
      reason: 'signature',
    });
    // The first character carries six significant bits; the last carries two.
    const flipped = `${tag.startsWith('A') ? 'B' : 'A'}${tag.slice(1)}`;
    expect(await codec.decode(`${payload}.${flipped}`, CONTEXT, 3)).toEqual({
      ok: false,
      reason: 'signature',
    });
    const other = createCursorCodec({ secret: OTHER_SECRET });
    expect(await other.decode(cursor, CONTEXT, 3)).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('accepts cursors signed with a previous secret during rotation', async () => {
    const old = createCursorCodec({ secret: OTHER_SECRET });
    const cursor = await old.encode(VALUES, CONTEXT);
    const rotated = createCursorCodec({
      secret: SECRET,
      previousSecrets: [OTHER_SECRET],
    });
    expect(await rotated.decode(cursor, CONTEXT, 3)).toEqual({
      ok: true,
      values: VALUES,
    });
    const reissued = await rotated.encode(VALUES, CONTEXT);
    expect(await old.decode(reissued, CONTEXT, 3)).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it.each([
    ['no separator', 'abc'],
    ['two separators', 'a.b.c'],
    ['standard base64 alphabet', `a+b.${'A'.repeat(43)}`],
    ['short tag', 'YQ.YQ'],
    ['empty payload', `.${'A'.repeat(43)}`],
    ['empty string', ''],
  ])(
    'reports %s as malformed before verifying anything',
    async (_label, cursor) => {
      const codec = createCursorCodec({ secret: SECRET });
      expect(await codec.decode(cursor, CONTEXT, 3)).toEqual({
        ok: false,
        reason: 'malformed',
      });
    },
  );

  it('reports a signed payload that is not a cursor as malformed', async () => {
    const codec = createCursorCodec({ secret: SECRET });
    for (const text of [
      'not json',
      '[1]',
      '{"v":1}',
      '{"v":"1","k":[],"c":"ctx-a","t":1}',
      '{"v":1,"k":[1],"c":"ctx-a","t":1}',
      '{"v":1,"k":["a"],"c":1,"t":1}',
      '{"v":1,"k":["a"],"c":"ctx-a","t":1.5}',
    ]) {
      expect(await codec.decode(await forge(SECRET, text), CONTEXT, 1)).toEqual(
        {
          ok: false,
          reason: 'malformed',
        },
      );
    }
    // One value where the sort has two.
    const cursor = await codec.encode(['a'], CONTEXT);
    expect(await codec.decode(cursor, CONTEXT, 2)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects another version before checking expiry or context', async () => {
    const codec = createCursorCodec({ secret: SECRET, ttl: 1, now: () => 10 });
    const cursor = await forge(
      SECRET,
      JSON.stringify({ v: CURSOR_VERSION + 1, k: ['a'], c: 'other', t: 1 }),
    );
    expect(await codec.decode(cursor, CONTEXT, 1)).toEqual({
      ok: false,
      reason: 'version',
    });
  });

  it('expires a cursor ttl seconds after it was issued', async () => {
    let now = 1000;
    const codec = createCursorCodec({
      secret: SECRET,
      ttl: 60,
      now: () => now,
    });
    const cursor = await codec.encode(['a'], CONTEXT);
    now = 1060;
    expect((await codec.decode(cursor, CONTEXT, 1)).ok).toBe(true);
    now = 1061;
    expect(await codec.decode(cursor, CONTEXT, 1)).toEqual({
      ok: false,
      reason: 'expired',
    });
    const forever = createCursorCodec({ secret: SECRET, now: () => 1 });
    const old = await forever.encode(['a'], CONTEXT);
    expect(
      (
        await createCursorCodec({ secret: SECRET, now: () => 10 ** 9 }).decode(
          old,
          CONTEXT,
          1,
        )
      ).ok,
    ).toBe(true);
  });

  it('checks the context before the length', async () => {
    const codec = createCursorCodec({ secret: SECRET });
    const cursor = await codec.encode(['a'], CONTEXT);
    expect(await codec.decode(cursor, 'ctx-b', 2)).toEqual({
      ok: false,
      reason: 'context',
    });
  });

  describe('options', () => {
    it('requires at least 32 bytes of raw key material, counted as bytes', () => {
      expect(
        thrown(() =>
          createCursorCodec({ secret: 'x'.repeat(MIN_SECRET_BYTES - 1) }),
        ),
      ).toEqual(new TypeError('cursor.secret must be at least 32 bytes'));
      expect(
        thrown(() => createCursorCodec({ secret: 'é'.repeat(15) })),
      ).toBeInstanceOf(TypeError);
      expect(
        thrown(() => createCursorCodec({ secret: 'é'.repeat(16) })),
      ).toBeUndefined();
      expect(
        thrown(() =>
          createCursorCodec({ secret: new Uint8Array(MIN_SECRET_BYTES) }),
        ),
      ).toBeUndefined();
      expect(
        thrown(() =>
          createCursorCodec({ secret: new Uint8Array(MIN_SECRET_BYTES - 1) }),
        ),
      ).toBeInstanceOf(TypeError);
      expect(
        thrown(() =>
          createCursorCodec({ secret: SECRET, previousSecrets: ['short'] }),
        ),
      ).toEqual(
        new TypeError('cursor.previousSecrets[0] must be at least 32 bytes'),
      );
      expect(thrown(() => createCursorCodec({ secret: 42 as never }))).toEqual(
        new TypeError(
          'cursor.secret must be a string, a Uint8Array, or a CryptoKey',
        ),
      );
    });

    it('accepts imported HMAC keys with the right usages', async () => {
      const both = await crypto.subtle.importKey(
        'raw',
        utf8Encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      );
      const verifyOnly = await crypto.subtle.importKey(
        'raw',
        utf8Encode(OTHER_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const codec = createCursorCodec({
        secret: both,
        previousSecrets: [verifyOnly],
      });
      const cursor = await codec.encode(['a'], CONTEXT);
      expect(
        await createCursorCodec({ secret: SECRET }).decode(cursor, CONTEXT, 1),
      ).toEqual({
        ok: true,
        values: ['a'],
      });
      const old = await createCursorCodec({ secret: OTHER_SECRET }).encode(
        ['b'],
        CONTEXT,
      );
      expect(await codec.decode(old, CONTEXT, 1)).toEqual({
        ok: true,
        values: ['b'],
      });
      expect(thrown(() => createCursorCodec({ secret: verifyOnly }))).toEqual(
        new TypeError('cursor.secret must be an HMAC key usable for sign'),
      );
      const aes = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 128 },
        false,
        ['encrypt'],
      );
      expect(thrown(() => createCursorCodec({ secret: aes }))).toEqual(
        new TypeError('cursor.secret must be an HMAC key usable for verify'),
      );
    });

    it('requires a positive integer ttl', () => {
      for (const ttl of [0, -1, 1.5, Number.NaN]) {
        expect(
          thrown(() => createCursorCodec({ secret: SECRET, ttl })),
        ).toEqual(
          new TypeError('cursor.ttl must be a positive integer of seconds'),
        );
      }
    });
  });
});
