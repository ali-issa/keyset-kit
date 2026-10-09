/**
 * The cursor codec (SPEC 8): `base64url(payload) "." base64url(tag)`, where
 * the payload is the JSON `{ v, k, c, t }` (version, sort-key values,
 * context hash, issued-at seconds) and the tag is HMAC-SHA256 over the
 * payload bytes under the current secret. Decoding verifies the tag
 * against the current and the previous secrets before reading anything,
 * then checks the version, the expiry, and the context in that order.
 * Clients see an opaque string; the values are never readable without
 * decoding and never trustworthy without the key.
 * @ref https://www.rfc-editor.org/rfc/rfc2104#section-3 (keys shorter than the hash output are discouraged)
 * @ref https://www.rfc-editor.org/rfc/rfc4648#section-5
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--concepts (cursors are opaque)
 * @packageDocumentation
 */
import type { CursorInit, CursorSecret } from '../definition/types';
import type { InvalidCursorReason } from '../errors';
import type { Bytes } from '../internal/base64url';
import type { CursorValue } from '../plan/types';

import {
  decodeBase64Url,
  encodeBase64Url,
  utf8Decode,
  utf8Encode,
} from '../internal/base64url';
import { hmacSign, hmacVerify, importHmacKey } from '../internal/crypto';
import { isRecord } from '../internal/object';

export const CURSOR_VERSION = 1;
/** HMAC-SHA256 keys shorter than the digest are rejected (RFC 2104 section 3). */
export const MIN_SECRET_BYTES = 32;
const TAG_BYTES = 32;
const MS_PER_SECOND = 1000;

export type CursorDecodeResult =
  | { readonly ok: true; readonly values: ReadonlyArray<CursorValue> }
  | { readonly ok: false; readonly reason: InvalidCursorReason };

export interface CursorCodec {
  /** Signs `values` bound to `context`; `issuedAt` is now. */
  encode(values: ReadonlyArray<CursorValue>, context: string): Promise<string>;
  /** Verifies and reads a cursor issued for `context` with `length` values. */
  decode(
    cursor: string,
    context: string,
    length: number,
  ): Promise<CursorDecodeResult>;
}

export interface CursorCodecOptions extends CursorInit {
  /** Seconds since the epoch; for tests. Default: the wall clock. */
  readonly now?: (() => number) | undefined;
}

interface Payload {
  readonly v: number;
  readonly k: ReadonlyArray<CursorValue>;
  readonly c: string;
  readonly t: number;
}

interface Keys {
  readonly current: CryptoKey;
  /** The current key first, then the previous ones. */
  readonly verify: ReadonlyArray<CryptoKey>;
}

function assertSecret(what: string, secret: unknown): CursorSecret {
  if (typeof secret === 'string' || secret instanceof Uint8Array) {
    const length =
      typeof secret === 'string' ? utf8Encode(secret).length : secret.length;
    if (length < MIN_SECRET_BYTES) {
      throw new TypeError(
        `${what} must be at least ${String(MIN_SECRET_BYTES)} bytes`,
      );
    }
    return secret;
  }
  if (secret instanceof CryptoKey) {
    if (secret.algorithm.name !== 'HMAC' || !secret.usages.includes('verify')) {
      throw new TypeError(`${what} must be an HMAC key usable for verify`);
    }
    return secret;
  }
  throw new TypeError(`${what} must be a string, a Uint8Array, or a CryptoKey`);
}

async function toKey(secret: CursorSecret): Promise<CryptoKey> {
  return secret instanceof CryptoKey ? secret : importHmacKey(secret);
}

function isCursorValues(value: unknown): value is ReadonlyArray<CursorValue> {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => item === null || typeof item === 'string')
  );
}

function parsePayload(bytes: Bytes): Payload | null {
  const text = utf8Decode(bytes);
  if (text === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const { v, k, c, t } = parsed;
  if (
    typeof v !== 'number' ||
    !isCursorValues(k) ||
    typeof c !== 'string' ||
    typeof t !== 'number' ||
    !Number.isInteger(t)
  ) {
    return null;
  }
  return { v, k, c, t };
}

function splitCursor(cursor: string): [Bytes, Bytes] | null {
  const dot = cursor.indexOf('.');
  if (dot === -1 || cursor.includes('.', dot + 1)) {
    return null;
  }
  const payload = decodeBase64Url(cursor.slice(0, dot));
  const tag = decodeBase64Url(cursor.slice(dot + 1));
  if (
    payload === null ||
    payload.length === 0 ||
    tag === null ||
    tag.length !== TAG_BYTES
  ) {
    return null;
  }
  return [payload, tag];
}

async function isSigned(
  keys: ReadonlyArray<CryptoKey>,
  tag: Bytes,
  bytes: Bytes,
): Promise<boolean> {
  const results = await Promise.all(
    keys.map(async (key) => hmacVerify(key, tag, bytes)),
  );
  return results.includes(true);
}

/**
 * Validates the secrets and the TTL now (a `TypeError` names the option);
 * imports the keys on first use.
 */
export function createCursorCodec(options: CursorCodecOptions): CursorCodec {
  const secret = assertSecret('cursor.secret', options.secret);
  if (secret instanceof CryptoKey && !secret.usages.includes('sign')) {
    throw new TypeError('cursor.secret must be an HMAC key usable for sign');
  }
  const previous = (options.previousSecrets ?? []).map((item, index) =>
    assertSecret(`cursor.previousSecrets[${String(index)}]`, item),
  );
  const ttl = options.ttl ?? null;
  if (ttl !== null && (!Number.isInteger(ttl) || ttl < 1)) {
    throw new TypeError('cursor.ttl must be a positive integer of seconds');
  }
  const now = options.now ?? (() => Math.floor(Date.now() / MS_PER_SECOND));
  let keys: Promise<Keys> | undefined;
  const loadKeys = async (): Promise<Keys> => {
    keys ??= (async () => {
      const current = await toKey(secret);
      const older = await Promise.all(
        previous.map(async (item) => toKey(item)),
      );
      return { current, verify: [current, ...older] };
    })();
    return keys;
  };

  return {
    async encode(values, context) {
      const payload: Payload = {
        v: CURSOR_VERSION,
        k: values,
        c: context,
        t: now(),
      };
      const bytes = utf8Encode(JSON.stringify(payload));
      const { current } = await loadKeys();
      const tag = await hmacSign(current, bytes);
      return `${encodeBase64Url(bytes)}.${encodeBase64Url(tag)}`;
    },

    async decode(cursor, context, length) {
      const parts = splitCursor(cursor);
      if (parts === null) {
        return { ok: false, reason: 'malformed' };
      }
      const [bytes, tag] = parts;
      const { verify } = await loadKeys();
      if (!(await isSigned(verify, tag, bytes))) {
        return { ok: false, reason: 'signature' };
      }
      const payload = parsePayload(bytes);
      if (payload === null) {
        return { ok: false, reason: 'malformed' };
      }
      if (payload.v !== CURSOR_VERSION) {
        return { ok: false, reason: 'version' };
      }
      if (ttl !== null && payload.t + ttl < now()) {
        return { ok: false, reason: 'expired' };
      }
      if (payload.c !== context) {
        return { ok: false, reason: 'context' };
      }
      if (payload.k.length !== length) {
        return { ok: false, reason: 'malformed' };
      }
      return { ok: true, values: payload.k };
    },
  };
}
