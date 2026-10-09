# ADR 0001: Record architecture decisions

- Status: accepted
- Date: 2026-10-08

## Context

Keyset pagination is mostly choices the Cursor Pagination profile leaves to the server: the cursor
format, where `NULL`s sort, how ties are broken, which filter operators exist, what a page size may
be, how a backward page is fetched. The in-house pagination code this library replaces made those
choices without a written rationale, so later readers could not tell a profile requirement from a
PostgreSQL rule from an accident, and the reasons were lost with the code. Choices have to be
visible to be reviewable.

## Decision

Every decision that affects the public API, the cursor format, the SQL shape, a choice the profile
leaves to the server, the runtime or database support matrix, security defaults, or dependencies is
recorded as an ADR in `docs/adr/`, numbered sequentially, using `0000-template.md`. A decision is
changed by adding a new ADR that supersedes the old one, never by editing history. Pull requests
that make such a change link the ADR.

## Consequences

Reviewers can check code against a stated decision, and a server choice can be told apart from a
profile requirement. Contributors have a place to argue a change before writing it. The overhead is
one short file per decision.
