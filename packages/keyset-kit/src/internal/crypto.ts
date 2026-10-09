/**
 * Web Crypto primitives the cursor codec and the planner share: SHA-256
 * digests for context hashes, HMAC-SHA256 keys, signing, and constant-time
 * verification. `crypto.subtle` is the one implementation Node 22, Bun,
 * Deno, and workerd share; nothing here imports `node:crypto`.
 * @ref https://w3c.github.io/webcrypto/#hmac
 * @ref https://w3c.github.io/webcrypto/#SubtleCrypto-method-verify
 * @ref https://www.rfc-editor.org/rfc/rfc2104 (HMAC)
 * @packageDocumentation
 */
import type { Bytes } from './base64url';

import { encodeBase64Url, toBytes, utf8Encode } from './base64url';

const HMAC_SHA256: HmacImportParams = { name: 'HMAC', hash: 'SHA-256' };

/** SHA-256 of the UTF-8 text, base64url encoded. */
export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8Encode(text));
  return encodeBase64Url(new Uint8Array(digest));
}

/** Imports raw key bytes (or a string's UTF-8 bytes) as an HMAC-SHA256 key. */
export async function importHmacKey(
  secret: string | Uint8Array,
): Promise<CryptoKey> {
  const bytes =
    typeof secret === 'string' ? utf8Encode(secret) : toBytes(secret);
  return crypto.subtle.importKey('raw', bytes, HMAC_SHA256, false, [
    'sign',
    'verify',
  ]);
}

export async function hmacSign(key: CryptoKey, data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

/** Constant-time comparison is the runtime's, through `SubtleCrypto.verify`. */
export async function hmacVerify(
  key: CryptoKey,
  signature: Bytes,
  data: Bytes,
): Promise<boolean> {
  return crypto.subtle.verify('HMAC', key, signature, data);
}
