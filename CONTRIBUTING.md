# Contributing to keyset-kit

Thanks for helping. This repository holds two packages, `keyset-kit` (the database-free core) and
`kysely-keyset` (the Kysely adapter); this document covers setup, the quality gates, and how changes
are released. Design intent lives in `docs/DESIGN.md`, the normative contract in `docs/SPEC.md`, and
decisions in `docs/adr/`; read those before proposing API changes.

The repository tooling (build, lint, format, tests, CI, release automation, issue templates) mirrors
[jsonapi-kit](https://github.com/ali-issa/jsonapi-kit) at commit `980ba38`, which in turn mirrors
[hono-ban](https://github.com/ali-issa/hono-ban) at commit `dd1a1b1`. When the template changes,
port the change here in a `chore(repo)` commit that names the upstream commit.

## Prerequisites

- Node.js 24 (see `.node-version`; Node 22.12+ is supported at runtime and in CI)
- pnpm 12 (`corepack enable` or `npm install -g pnpm@12`; the exact version is pinned in
  `package.json` `packageManager`)
- `bun` and `deno` for `pnpm test:runtimes` (optional locally; CI installs both)
- a PostgreSQL server for `e2e/postgres.e2e.test.ts` (optional locally; the file skips itself
  without `KEYSET_PG_URL`, and CI runs it against PostgreSQL 14 and 18)

## Setup

```bash
git clone https://github.com/ali-issa/keyset-kit.git
cd keyset-kit
pnpm install
```

`pnpm install` also installs the git hooks (lefthook): formatting and linting run on commit, types
and tests run on push. Run `pnpm build` once before `pnpm check`: the type-aware lint of `e2e/` and
the package checks (`publint`, `attw`) read `dist/`. The packages themselves need no build between
edits: `kysely-keyset` resolves `keyset-kit` from source through the `source` condition of the
core's `exports` map (enabled only in `packages/kysely-keyset/tsconfig.json` and its Vitest project;
everything else, `e2e/` included, resolves `dist/`).

## Scripts

| Script                     | What it does                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `pnpm check`               | Runs every `check:*` script below, in order                       |
| `pnpm check:deps`          | `knip`: unused files, exports, dependencies                       |
| `pnpm check:format`        | `oxfmt --check`                                                   |
| `pnpm check:lint`          | `oxlint` with type-aware rules                                    |
| `pnpm check:pkg`           | `publint` and `arethetypeswrong` against each built package       |
| `pnpm check:types`         | `tsc --noEmit` for the root configs and each package              |
| `pnpm test`                | Vitest over both packages, including type tests in `*.test-d.ts`  |
| `pnpm test:coverage`       | Vitest with V8 coverage; thresholds are enforced                  |
| `pnpm test:e2e`            | Build, then type-check and run `e2e/` against the built packages  |
| `pnpm test:runtimes`       | Build, then run the smoke test on Bun, Deno, and workerd          |
| `pnpm build`               | tsdown for each package: ESM, declarations, updates its `exports` |
| `pnpm format` / `lint:fix` | Apply formatting / autofixable lint fixes                         |

CI runs the same commands, plus the adapter's unit tests on Kysely 0.28.17 (the floor of its peer
range) and the e2e file for a PostgreSQL server. A pull request must be green on all of them. To
work on one package, filter: `pnpm --filter keyset-kit test`,
`pnpm --filter kysely-keyset exec vitest run paginate`. To run the server e2e file locally:

```bash
KEYSET_PG_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --filter keyset-kit-e2e exec vitest run postgres
```

## Conventions

- **Every behavior traces to a source.** The Cursor Pagination profile, the PostgreSQL documentation
  (ordering, pattern matching, arrays, text search, data types), Kysely's documentation, the Web
  Crypto specification, and RFCs 2104, 4648, and 8785 are the sources. Add an `@ref <url>` comment
  next to the decision it justifies, and name the rule in the test. Where the profile leaves a
  choice to the server (page size bounds, the cursor format, null ordering, the operator table), the
  choice is recorded in `docs/SPEC.md` and an ADR, never only in code.
- **The core knows no database.** Everything under `packages/keyset-kit/` is functions over plain
  values; the plan it produces is data (`QueryPlan`, `Predicate`, `Target`). What needs a query
  builder or a driver goes in `packages/kysely-keyset/` and renders the plan (ADR 0004).
- **Identifiers from the definition, values as parameters.** Table, column, relation, and
  configuration names reach SQL only after `defineKeyset` validated them; request values are always
  bound parameters; the adapter's unit tests assert the compiled SQL and parameters exactly.
- **Tests are colocated.** `foo.ts` has `foo.test.ts` next to it, and `foo.test-d.ts` when the types
  are part of the contract. New behavior ships with tests; bug fixes ship with a failing test first.
- **End-to-end tests live in `e2e/`.** That directory is a private pnpm workspace package that
  depends on `keyset-kit` and `kysely-keyset` through `workspace:*`, so its imports resolve through
  the published `exports` maps into `dist/` and its `tsc` run checks the emitted declarations. Each
  `*.e2e.test.ts` file opens a database harness from `e2e/support/db.ts` (PGlite in-process,
  node-postgres over a PGlite socket server, or a PostgreSQL server) and asserts over real rows;
  expectations are computed in JavaScript from the seed, never read back from the SQL under test.
  Never import from `src/` there. Run one file with
  `pnpm --filter keyset-kit-e2e exec vitest run <name>` after `pnpm build`.
- **Runtime smoke tests live in `e2e/smoke/`.** One module imports both packages; `run.ts` drives it
  in-process on Bun and Deno and `workerd.ts` bundles it with tsdown and runs it in Miniflare's
  workerd. `pnpm test:runtimes` needs `bun` and `deno` on your `PATH`; CI installs both.
- **Nothing reads `process.env` at module scope.** Behavior is configured through options so the
  package runs on workerd, Deno, Bun, and Node. See ADR 0002.
- **Client input is hostile.** Names from a request become object keys only through
  `internal/object.ts` or after a `PROTO_KEYS` check; reads of client-shaped objects use
  `Object.hasOwn`; error messages are constant. See `SECURITY.md` for what counts as a
  vulnerability.
- **Files stay small and single-purpose.** One exported concept per file; split rather than add
  section dividers.
- **Type at boundaries, infer locally.** Exports carry explicit types (required by
  `isolatedDeclarations`); locals do not.
- **No `any`, no non-null assertions, `Array<T>` over `T[]`, `??` over `||`.** oxlint enforces
  these.
- **No emojis** in code, docs, or commit messages.
- **Lint disables carry a reason.** `// oxlint-disable-next-line rule -- reason: <why>`.

## Adding a capability

New library surface falls into one of these:

- **A filter operator.** A row in the operator table (`filter/operators.ts`), its mapping in
  `filter/condition.ts`, a predicate kind in `plan/types.ts` if none fits, the adapter's render
  case, the SPEC 4.2 row, an amendment to ADR 0005, tests at every layer, an e2e case, and a `minor`
  changeset for both packages.
- **A field type.** The vocabulary in `definition/field-types.ts`, a value checker in
  `filter/values.ts`, its operators in the table, SPEC 3.1 and 4.3, tests, and a `minor` changeset.
- **A search mode or a sort feature.** A SPEC section and an ADR first (these change the SQL shape
  and the cursor context), then code.
- **An adapter for another query builder or driver.** A new package `packages/<name>-keyset/`
  following `packages/kysely-keyset/` as the precedent: depends on `keyset-kit` (`workspace:^`),
  re-exports it in full, renders every `Predicate` and `Target` kind (or rejects the ones its target
  cannot express, documented), and exposes a `paginate` that calls `plan` and `page`. Its own e2e
  coverage joins `e2e/`.

**Constraints every contribution inherits.**

- `keyset-kit` has no dependencies and imports no runtime API beyond web standards (ADR 0002).
  `kysely` is `kysely-keyset`'s only peer dependency, at `>= 0.28.0`; CI tests the floor, so a
  Kysely API used by the adapter must exist in 0.28.
- A definition is validated once, in `defineKeyset`, with a `TypeError` naming the option. A
  request-time check that a definition mistake could trigger belongs there, not in the planner.
- A request-time error is one of the `KeysetError` classes in `errors.ts`, with a constant message
  and structured fields; a new one is a class, a `code`, a SPEC 9 row, and a `minor` changeset.
- The cursor format is versioned (`CURSOR_VERSION`). A change to the payload bumps the version and
  gets an ADR; old cursors are then rejected with reason `version`, never misread.
- `e2e/package-surface.e2e.test.ts` lists every value export of both packages; a new export goes
  there, and into an e2e file that runs it against a database.

**Checklist.** Every item below is checked by CI or by a reviewer.

1. Source file in the right directory (see the repository map in `AGENTS.md`), with a
   `@packageDocumentation` header naming the SPEC section it implements and `@ref` links to the
   sources.
2. Unit tests beside the file; a `*.test-d.ts` when inference is part of the contract.
3. `docs/SPEC.md`: the section for the behavior, and section 1 when the public surface changes;
   `docs/DESIGN.md` when the intent changes; the README when a user would look for it.
4. `e2e/package-surface.e2e.test.ts` and an e2e case for anything that changes the SQL or the
   cursors.
5. An ADR for a public API change, a cursor format change, a server choice, or a dependency.
6. A changeset: an additive export or option is `minor`; anything that changes an existing cursor
   format, plan shape, SQL shape, or exported type is `major`.

## Commits and pull requests

- Use conventional commit subjects: `feat(filter): add the overlaps operator`,
  `fix(seek): keep nulls reachable on backward pages`. Types: `feat`, `fix`, `refactor`, `perf`,
  `test`, `docs`, `chore`, `build`, `ci`.
- Keep pull requests focused. Describe the why in the body; link the issue.
- Every user-visible change needs a changeset (next section). CI fails without one on `src/`
  changes.

## Changesets and releases

Releases are automated with [Changesets](https://github.com/changesets/changesets).

1. In your branch run `pnpm changeset`, pick the package or packages that change, and pick `patch`,
   `minor`, or `major` for each. Write the entry for users, not for maintainers: what changed and
   what they have to do. The packages are versioned independently; a `keyset-kit` change that
   `kysely-keyset` only passes through needs no entry for the adapter (Changesets bumps its
   dependency range on its own).
2. Commit the generated file under `.changeset/`.
3. When your PR merges, the release workflow opens or updates a "Version Packages" PR that bumps
   each affected package's `package.json` and `CHANGELOG.md`.
4. Merging that PR publishes the bumped packages to npm through trusted publishing (OIDC, with
   provenance) and creates a GitHub release per package.

For a prerelease line, run `pnpm changeset pre enter <tag>` on `main` and commit the resulting
`.changeset/pre.json`; releases then publish under that npm dist-tag instead of `latest` until
`pnpm changeset pre exit` is committed.

## Architecture decisions

Anything that changes the public API, the cursor format, the SQL shape, a server choice the profile
leaves open, the runtime or database support matrix, or a dependency gets an ADR in `docs/adr/`.
Copy `docs/adr/0000-template.md`, number it, and link it from the PR.

## Reporting bugs and requesting features

Use the issue templates. For security issues follow `SECURITY.md`; do not open a public issue.
