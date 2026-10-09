# ADR 0004: Two packages: the database-free core (`keyset-kit`) and the Kysely adapter (`kysely-keyset`)

- Status: accepted
- Date: 2026-10-08

## Context

Most of keyset pagination is independent of how SQL is built: validating a definition, checking a
request against it, building the seek predicate for a cursor in a total order with nulls, signing
and verifying cursors, deciding `prev` and `next`. Only the last step, turning a plan into a query,
needs a query builder. Kysely is the builder of the applications this library is written for, but a
core that depends on it could not serve another builder, a raw driver, or a client that only needs
to inspect cursors, and its plan semantics could not be tested without a database. @ref
https://kysely.dev/ @ref https://tanstack.com/query/latest/docs/framework/react/overview (one core,
thin adapters) @ref https://tsdown.dev/options/package-exports#devexports

## Decision

- Two packages in one pnpm workspace. `keyset-kit` is the core: no dependencies, no peer
  dependencies, web standards only (ADR 0002). It exposes the plan as data: `QueryPlan` holds the
  sort keys with their aliases and null placement, the filter and the seek as `Predicate` trees over
  `Target`s, the limit, and the cursor context, every name in it a validated identifier from the
  definition.
- `kysely-keyset` is the Kysely adapter: it depends on `keyset-kit` (`workspace:^`, published as a
  caret range), has `kysely >= 0.28.0` as its only peer dependency, and re-exports the core in full,
  so a Kysely application imports from one package and a second copy of the core never enters the
  graph (`e2e/package-surface.e2e.test.ts` checks the bindings are the same objects). It adds
  `createDefineKeyset<DB>()`, whose keysets check names against the `DB` interface and carry
  `paginate`; `paginate` for keysets defined with the core; and `renderTarget` and `renderPredicate`
  for callers who compose the plan into a query of their own.
- The peer range floor is tested: CI runs the adapter's unit tests on Kysely 0.28.17. The e2e suite
  runs on 0.29, which ships the built-in PGlite dialect.
- Repository mechanics. Each package's `exports` map carries a `source` condition pointing at `src/`
  (tsdown `devExports: 'source'`); `kysely-keyset`'s tsconfig and Vitest project enable that
  condition, so its type-check and tests run against the core as it is edited with no build in
  between, while the published map (`publishConfig.exports`, applied by `pnpm publish` and
  `pnpm pack`) and `e2e/` see only `dist/`. One Vitest run covers both packages through
  `test.projects`, with coverage thresholds over the combined source. Versions are independent;
  Changesets bumps `kysely-keyset` by a patch whenever its `keyset-kit` range has to move
  (`updateInternalDependencies: patch`), and each package has its own npm trusted publisher.

## Consequences

An adapter for another builder or driver renders thirteen predicate kinds and three target kinds
(SPEC 6) and calls `plan` and `page`; the cursor format, the seek logic, and the page semantics are
shared and tested once. Kysely users see one API. The cost is two packages to version, publish, and
document, and the `source` export condition contributors must know about when a resolution surprises
them.
