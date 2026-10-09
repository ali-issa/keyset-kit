/**
 * base64url without padding (RFC 4648 section 5) and UTF-8, over `btoa`,
 * `atob`, `TextEncoder`, and `TextDecoder`: the primitives every target
 * runtime shares. Byte arrays are always backed by a plain `ArrayBuffer`
 * so they satisfy Web Crypto's `BufferSource`.
 * @ref https://www.rfc-editor.org/rfc/rfc4648#section-5
 * @packageDocumentation
 */

export type Bytes = Uint8Array<ArrayBuffer>;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/u;
const QUAD = 4;

export function encodeBase64Url(bytes: Bytes): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

/** `null` when `text` is not base64url (bad alphabet, or an impossible length). */
export function decodeBase64Url(text: string): Bytes | null {
  if (!BASE64URL_PATTERN.test(text) || text.length % QUAD === 1) {
    return null;
  }
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  const padding = (QUAD - (padded.length % QUAD)) % QUAD;
  let binary: string;
  try {
    binary = atob(padded + '='.repeat(padding));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
}

export function utf8Encode(text: string): Bytes {
  return toBytes(new TextEncoder().encode(text));
}

/** `null` when the bytes are not well-formed UTF-8. */
export function utf8Decode(bytes: Bytes): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** A copy of any byte view, backed by its own `ArrayBuffer`. */
export function toBytes(view: Uint8Array): Bytes {
  const copy = new Uint8Array(new ArrayBuffer(view.length));
  copy.set(view);
  return copy;
}
