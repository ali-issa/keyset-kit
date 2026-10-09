/**
 * Kysely instances for the adapter's unit tests: one that only compiles
 * (DummyDriver) and one that answers each query with canned rows while
 * recording what it was asked. Both use the PostgreSQL compiler.
 */
import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  KyselyPlugin,
  QueryResult,
} from 'kysely';

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

export interface Contacts {
  id: string;
  first_name: string;
  last_name: string | null;
  age: number | null;
  score: string;
  active: boolean;
  status: 'lead' | 'customer';
  tags: Array<string>;
  created_at: string;
  birthday: string | null;
  bio: string;
  search_vector: string;
}

interface ContactEmails {
  id: number;
  contact_id: string;
  email: string;
  is_primary: boolean;
}

interface WorkHistory {
  id: number;
  contact_id: string;
  company: string;
  start_date: string;
}

export interface DB {
  contacts: Contacts;
  contact_emails: ContactEmails;
  work_history: WorkHistory;
}

export interface Recorded {
  readonly queries: Array<CompiledQuery>;
}

class CannedConnection implements DatabaseConnection {
  readonly #results: Array<Array<unknown>>;
  readonly #recorded: Recorded;

  constructor(results: Array<Array<unknown>>, recorded: Recorded) {
    this.#results = results;
    this.#recorded = recorded;
  }

  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    this.#recorded.queries.push(compiled);
    // Like a network driver, answer on a later turn of the event loop.
    const rows = await new Promise<Array<R>>((resolve) => {
      setTimeout(() => {
        resolve((this.#results.shift() ?? []) as Array<R>);
      }, 0);
    });
    return { rows };
  }

  streamQuery(): never {
    throw new Error('not supported');
  }
}

/** DummyDriver's no-op lifecycle with canned query results. */
class CannedDriver extends DummyDriver {
  readonly #connection: CannedConnection;

  constructor(results: Array<Array<unknown>>, recorded: Recorded) {
    super();
    this.#connection = new CannedConnection(results, recorded);
  }

  override async acquireConnection(): Promise<DatabaseConnection> {
    await super.init();
    return this.#connection;
  }
}

function dialect(driver: Driver) {
  return {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createIntrospector: (db: Kysely<unknown>) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
}

/** Compiles only; `execute` returns no rows. */
export function compileOnly(plugins: Array<KyselyPlugin> = []): Kysely<DB> {
  return new Kysely<DB>({ dialect: dialect(new DummyDriver()), plugins });
}

/** Answers queries in order with `results`, recording each compiled query. */
export function canned(
  results: Array<Array<unknown>>,
  plugins: Array<KyselyPlugin> = [],
): { db: Kysely<DB>; recorded: Recorded } {
  const recorded: Recorded = { queries: [] };
  const db = new Kysely<DB>({
    dialect: dialect(new CannedDriver(results, recorded)),
    plugins,
  });
  return { db, recorded };
}
