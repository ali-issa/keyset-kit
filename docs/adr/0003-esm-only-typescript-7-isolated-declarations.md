# ADR 0003: ESM only, TypeScript 7 `isolatedDeclarations`, erasable syntax

- Status: accepted
- Date: 2026-10-08

## Context

Node 22.12 enables `require(esm)` by default, so an ESM-only package is loadable from CommonJS on
every supported Node; a dual build doubles the surface and the failure modes. TypeScript 7 (the Go
compiler) does not expose the declaration emitter through the compiler API yet; tsdown emits
declarations with oxc instead, which requires `isolatedDeclarations`. Node's type stripping runs
`.ts` files directly when the syntax is erasable, which the e2e smoke harness relies on. @ref
https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require @ref
https://tsdown.dev/options/dts @ref https://nodejs.org/api/typescript.html#type-stripping @ref
https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly

## Decision

Both packages are ESM only (`type: module`, `exports` with `.js` and `.d.ts` only), built by tsdown,
`engines.node >= 22.12.0`. `tsconfig.base.json` sets `isolatedDeclarations` and
`erasableSyntaxOnly`: every export carries an explicit type, exported constants are annotated,
`as const` objects hold literals only, and there are no enums, namespaces, or parameter properties.
`publint --strict` and `attw --profile esm-only` run on every build.

## Consequences

Consumers on CommonJS and Node below 22.12 are not supported. Exported signatures are explicit,
which reads as documentation. Some type-level tricks (inferring an exported const from a call, or
`as const satisfies`) need a local type alias or a plain `as const` first.
