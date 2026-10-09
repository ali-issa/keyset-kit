/**
 * Runtime-neutral checks (SPEC 11.4) over the built packages: define a
 * keyset, plan a request, sign and verify cursors with Web Crypto, render
 * SQL through Kysely's PostgreSQL compiler, and get the typed errors. No
 * database: the Kysely instance uses `DummyDriver`, so the same module
 * runs on Bun, Deno, and workerd.
 */
import type { QueryEvent } from 'kysely-keyset';

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import {
  createDefineKeyset,
  InvalidCursorError,
  isKeysetError,
} from 'kysely-keyset';

export interface SmokeResult {
  readonly runtime: string;
  readonly passed: number;
  readonly failures: ReadonlyArray<string>;
}

class CheckFailure extends Error {
  override readonly name: string = 'CheckFailure';
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new CheckFailure(message);
  }
}

function equal(actual: unknown, expected: unknown, what: string): void {
  check(
    actual === expected,
    `${what}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
}

interface DB {
  contacts: {
    id: string;
    name: string;
    created_at: string;
    age: number | null;
  };
}

const defineKeyset = createDefineKeyset<DB>();
const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
    age: { column: 'age', type: 'integer', nullable: true },
  },
  search: { columns: ['name'] },
  cursor: { secret: 'smoke-secret-with-at-least-32-bytes!!' },
});

const db = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (instance) => new PostgresIntrospector(instance),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

type Check = () => Promise<void>;

const CHECKS: Readonly<Record<string, Check>> = {
  'plans a request with the key as tie-breaker': async () => {
    const plan = await contacts.plan({
      sort: ['-createdAt'],
      page: { size: 3 },
    });
    equal(
      plan.keys.map((key) => key.alias).join(','),
      'keyset0,keyset1',
      'aliases',
    );
    equal(plan.limit, 4, 'limit');
    equal(plan.keys[1]?.field, 'id', 'tie-breaker');
  },
  'signs cursors with Web Crypto and reads them back': async () => {
    const plan = await contacts.plan({
      sort: ['-createdAt'],
      page: { size: 2 },
    });
    const rows = [
      { id: 'a', keyset0: '2024-01-01 00:00:00+00', keyset1: 'a' },
      { id: 'b', keyset0: null, keyset1: 'b' },
      { id: 'c', keyset0: '2023-01-01 00:00:00+00', keyset1: 'c' },
    ];
    const page = await contacts.page(plan, rows, (row) => [
      row.keyset0,
      row.keyset1,
    ]);
    equal(page.rows.length, 2, 'page size');
    equal(page.hasNext, true, 'hasNext');
    check(typeof page.next === 'string', 'next cursor');
    const next = await contacts.plan({
      sort: ['-createdAt'],
      page: { size: 2, after: page.next },
    });
    equal(next.seek?.kind, 'or', 'seek from the cursor');
  },
  'renders SQL through Kysely without a database': async () => {
    const events: Array<QueryEvent> = [];
    const page = await contacts.paginate(
      db.selectFrom('contacts').selectAll(),
      {
        sort: ['name'],
        filter: {
          and: [
            { field: 'age', op: 'isNull', value: false },
            { field: 'name', op: 'startsWithi', value: 'a' },
          ],
        },
        search: 'ada',
        page: { size: 10 },
      },
      {
        total: true,
        onQuery: (event) => {
          events.push(event);
        },
      },
    );
    equal(page.rows.length, 0, 'no rows from the dummy driver');
    equal(page.total, 0, 'total');
    equal(events.length, 2, 'two queries');
    const sql = events[1]?.sql ?? '';
    check(sql.includes('lower("contacts"."name")'), `insensitive sort: ${sql}`);
    check(
      sql.includes("websearch_to_tsquery('simple', $"),
      `text search: ${sql}`,
    );
    check(sql.includes('asc nulls last'), `null placement: ${sql}`);
    check(sql.includes('limit $'), `limit: ${sql}`);
  },
  'throws typed errors for bad cursors': async () => {
    try {
      await contacts.plan({ page: { after: 'nope' } });
    } catch (error) {
      check(error instanceof InvalidCursorError, 'InvalidCursorError');
      check(isKeysetError(error), 'isKeysetError');
      equal(error.code, 'INVALID_CURSOR', 'code');
      equal(error.reason, 'malformed', 'reason');
      return;
    }
    check(false, 'expected a rejection');
  },
};

/** Runs every check and collects failures so one report covers them all. */
export async function runChecks(runtime: string): Promise<SmokeResult> {
  const failures: Array<string> = [];
  let passed = 0;
  for (const [name, run] of Object.entries(CHECKS)) {
    try {
      await run();
      passed += 1;
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { runtime, passed, failures };
}

/** Prints the outcome; throws on failure so the process exits non-zero everywhere. */
export function report(result: SmokeResult): void {
  const total = result.passed + result.failures.length;
  if (result.failures.length === 0) {
    console.log(
      `keyset-kit smoke: ${total} checks passed on ${result.runtime}`,
    );
    return;
  }
  for (const failure of result.failures) {
    console.error(`FAIL ${failure}`);
  }
  throw new Error(
    `keyset-kit smoke: ${result.failures.length} of ${total} checks failed on ${result.runtime}`,
  );
}
