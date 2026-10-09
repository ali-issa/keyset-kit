# ADR 0002: Web standards only; no ambient environment reads

- Status: accepted
- Date: 2026-10-08

## Context

The library targets Node, Bun, Deno, and Cloudflare Workers (workerd). Cursors need SHA-256 (the
context hash) and HMAC-SHA256 (the signature). `node:crypto` fails on workerd without
`nodejs_compat` and needs a shim on Deno; `Buffer` likewise. Web Crypto's `crypto.subtle`,
`btoa`/`atob`, and `TextEncoder`/`TextDecoder` are the one implementation every target shares.
Reading `process.env` at module scope throws on workerd, freezes behavior at import time, and cannot
be changed per application or per test. @ref https://w3c.github.io/webcrypto/#hmac @ref
https://developers.cloudflare.com/workers/runtime-apis/web-crypto/ @ref
https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Decision

Source under `src/` uses only APIs defined by web standards or ECMAScript. Hashing and signing go
through `crypto.subtle` (`digest`, `importKey`, `sign`, `verify`); the constant-time comparison of a
signature is the runtime's `SubtleCrypto.verify`. Keys are imported on first use and memoized,
because `importKey` is asynchronous and a definition is created synchronously. Byte arrays are
always backed by a plain `ArrayBuffer` (the `Bytes` type) so they satisfy `BufferSource`. Nothing
reads `process`, `Deno`, `Bun`, or `navigator`; the secret, the previous secrets, the TTL, and the
clock (`now`, for tests) are options. Type-checking uses the `dom` lib for the web types rather than
`@types/node`. The build is `platform: 'neutral'`. CI runs the unit and end-to-end suites on Node 22
and 24 and the smoke module (`e2e/smoke/`) on Bun, Deno, and workerd through Miniflare.

## Consequences

The packages run unchanged on every target and the core has no runtime dependencies. Because Web
Crypto is asynchronous, `plan`, `page`, and the codec's `encode` and `decode` return promises; a
synchronous cursor API would have required a JavaScript HMAC implementation, which this library
declines to ship.
