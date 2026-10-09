# keyset-kit: instructions for coding agents

This file is read by AI coding agents working in this repository. Humans: see `CONTRIBUTING.md`.

## Ground rules

- Read `docs/DESIGN.md` for intent and `docs/SPEC.md` for the exact contract before changing public
  API. Implement from the SPEC section named in the file header; update the SPEC in the same PR when
  the code must differ. Read the relevant ADR in `docs/adr/` before changing a decision it records;
  add a new ADR instead of silently reversing one.
- Spec-driven, not memory-driven. Every behavior comes from the Cursor Pagination profile
  (https://jsonapi.org/profiles/ethanresnick/cursor-pagination/), the PostgreSQL documentation
  (ordering, pattern matching, arrays, text search, data types), Kysely's documentation, the Web
  Crypto specification, or an RFC (2104 for HMAC, 4648 for base64url, 8785 for canonical JSON).
  Fetch the clause, cite it in the code with an `@ref <url>` comment next to the decision it
  justifies, and name it in the test. Where the profile leaves a choice to the server, the choice is
  written down in `docs/SPEC.md` and an ADR.
- Run the gates after every meaningful change, not at the end: `pnpm check:types`,
  `pnpm check:lint`, then `pnpm test` (both packages; `kysely-keyset` resolves `keyset-kit` from
  source through the `source` export condition, so no build is needed between edits). Run
  `pnpm build`, `pnpm check`, and `pnpm test:e2e` before declaring done, in that order: the
  type-aware lint of `e2e/` and the package checks read `dist/`, and the e2e suite is the only check
  that runs the SQL against a database (PGlite in-process, node-postgres over a PGlite socket, and a
  PostgreSQL server when `KEYSET_PG_URL` is set). `pnpm test:runtimes` (Bun, Deno, workerd smoke)
  needs `bun` and `deno` installed; CI runs it.
- Tests are colocated (`x.test.ts`, `x.test-d.ts`) and cover behavior, not implementation. A test
  earns its place by pinning a profile clause, a PostgreSQL rule, a server choice recorded in the
  SPEC, or a regression. Coverage thresholds are enforced; do not lower them. Adapter tests assert
  the compiled SQL and parameters exactly; e2e tests compute their expectations in JavaScript from
  the seed (`expectedIds`) and never from the SQL under test.
- Every identifier in SQL comes from the definition, validated once in `defineKeyset`; every value
  from a request is a bound parameter. The one literal (the text search configuration) is validated
  against `regconfig`'s name syntax at definition time. Never interpolate request data.
- Error messages are constant. Request data goes into the error's structured fields, never into
  `message`.
- Client input never becomes an object key without a check (`PROTO_KEYS`, `Object.hasOwn`), and
  every lookup into client-shaped data goes through `internal/object.ts` or a `ReadonlyMap`.
- No `process.env` at module scope, no Node-only APIs in `src/` (web standards only: Web Crypto,
  `btoa`/`atob`, `TextEncoder`/`TextDecoder`), no enums or parameter properties
  (`erasableSyntaxOnly`), no `any`, no `T[]`, no emojis.
- Commit subjects use conventional commits. Every user-visible change needs a changeset in
  `.changeset/` (`pnpm changeset`) naming the package or packages it changes.
- Database code stays in the adapter. Nothing under `packages/keyset-kit/` imports `kysely` or a
  driver; what needs a query builder lives in `packages/kysely-keyset/` and renders the plan (ADR
  0004).
- Never mention AI assistance in commits, changesets, or docs.

## Repository map

A pnpm workspace: `packages/keyset-kit` (the database-free core, published as `keyset-kit`),
`packages/kysely-keyset` (the Kysely adapter, published as `kysely-keyset`, depends on the core and
re-exports it), and `e2e/` (private). Root configs (`vitest.config.ts` with `test.projects`,
`tsconfig.base.json`, `knip.jsonc`, `.oxlintrc.json`, `.oxfmtrc.json`) apply to all of them.

`packages/keyset-kit/src/`:

- `internal/` base64url and UTF-8 over web APIs, Web Crypto (SHA-256, HMAC), prototype-safe object
  helpers, canonical JSON, LIKE escaping; never exported
- `definition/` `defineKeyset`: the field type vocabularies (`field-types.ts`), field and relation
  validation (`normalize-fields.ts`, `normalize-relations.ts`), the definition types (`types.ts`),
  and the definition everything else reads from (`define-keyset.ts`)
- `filter/` the filter tree (`types.ts`), the operator table (`operators.ts`), value checks by type
  (`values.ts`), one condition to one predicate (`condition.ts`), the tree to a predicate
  (`normalize.ts`)
- `sort/` sort resolution with the key appended, and the sort signature cursors bind to
- `plan/` the query plan types (`types.ts`), the planner (`plan.ts`), the seek predicate (`seek.ts`)
- `page/` page request resolution (`page-request.ts`) and page assembly (`finish.ts`)
- `cursor/` the cursor codec: signing, verification, rotation, expiry, context binding
- `errors.ts` the request-time error classes
- `test-support/` the shared definition and helpers for the repository's own tests; not published

`packages/kysely-keyset/src/`:

- `index.ts` re-exports `keyset-kit` and adds the adapter
- `define-keyset.ts` `createDefineKeyset<DB>()`: a `defineKeyset` that checks names against the
  Kysely `DB` interface and whose keysets carry `paginate`
- `paginate.ts` the plan rendered onto the caller's select query: filter, total, seek, key
  selections, ordering, limit; rows split from the private aliases
- `render/` `renderTarget` (columns, correlated aggregates, `concat_ws`) and `renderPredicate`
  (every predicate kind as a Kysely expression)
- `test-support/` a compile-only Kysely and a canned-rows driver for the unit tests; not published

`e2e/`: end-to-end suite, a private workspace package that consumes the built `keyset-kit` and
`kysely-keyset` through `workspace:*`; never imports from `src/`. `e2e/support/` holds the schema
and seed (`schema.ts`, `seed.ts`), the harnesses (`db.ts`: PGlite, node-postgres over pglite-socket,
a PostgreSQL server), the keysets under test (`keysets.ts`), and the invariants every harness must
satisfy (`invariants.ts`). `e2e/smoke/` is the runtime smoke test (Bun, Deno, workerd).

- `docs/DESIGN.md` what we are building and why; `docs/SPEC.md` the normative contract; `docs/adr/`
  decisions
