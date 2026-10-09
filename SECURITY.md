# Security Policy

## Supported versions

Only the latest minor release of the current major line receives security fixes.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting on this repository
(Security tab, "Report a vulnerability"), which reaches the maintainer directly.

Include the affected version, a description of the issue, and a minimal reproduction if you have
one. You will get an acknowledgement within seven days. Fixes ship as a patch release with a GitHub
Security Advisory; reporters are credited unless they ask not to be.

## Scope

keyset-kit turns untrusted requests (sort, filter, search, page parameters, cursors) into query
plans, and kysely-keyset renders those plans as SQL. Reports we care about most:

- a cursor accepted without a valid signature, or a cursor issued under one sort, filter, or search
  accepted under another
- a request that makes a table, column, relation, or configuration name reach SQL unquoted, or a
  value reach SQL as anything but a bound parameter
- a request that sorts, filters, or searches on something the definition did not declare, or that
  exceeds the declared page size bounds
- prototype pollution through field, relation, or operator names taken from a request
- server internals (column values, table names, driver detail) reaching an error message
- denial of service through pathological filters or cursors

What a cursor reveals is by design, not a vulnerability: a cursor is signed, not encrypted, and the
sort-key values of the row it points at can be read by anyone who holds it. Do not expose a sort
over a column whose values the client must not learn.
