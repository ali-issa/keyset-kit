import type { CamelDB, DB } from './db.ts';

/**
 * The keysets under test, defined through the typed definer against the
 * snake_case `DB` and the camelCase `CamelDB`.
 */
import { createDefineKeyset } from 'kysely-keyset';

export const SECRET = 'e2e-secret-with-at-least-32-bytes-in-it';

const defineKeyset = createDefineKeyset<DB>();

export const COLUMN_FIELDS = {
  id: { column: 'id', type: 'uuid' },
  firstName: { column: 'first_name', type: 'text' },
  lastName: {
    column: 'last_name',
    type: 'text',
    collation: 'insensitive',
    nullable: true,
  },
  age: { column: 'age', type: 'integer', nullable: true },
  score: { column: 'score', type: 'decimal' },
  active: { column: 'active', type: 'boolean' },
  status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
  tags: { column: 'tags', type: 'array', of: 'text' },
  createdAt: { column: 'created_at', type: 'timestamptz' },
  birthday: { column: 'birthday', type: 'date', nullable: true },
  bio: { column: 'bio', type: 'text', sortable: false },
} as const;

const FIELDS = {
  ...COLUMN_FIELDS,
  emailCount: {
    aggregate: { relation: 'emails', fn: 'count' },
    type: 'bigint',
  },
  latestStart: {
    aggregate: { relation: 'workHistory', fn: 'max', column: 'start_date' },
    type: 'date',
  },
} as const;

const RELATIONS = {
  emails: {
    table: 'contact_emails',
    on: { contact_id: 'id' },
    fields: {
      email: { column: 'email', type: 'text' },
      primary: { column: 'is_primary', type: 'boolean' },
    },
  },
  workHistory: {
    table: 'work_history',
    on: { contact_id: 'id' },
    fields: {
      company: { column: 'company', type: 'text' },
      startDate: { column: 'start_date', type: 'date' },
    },
  },
} as const;

/** `like` search, range requests allowed, small default page. */
export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: FIELDS,
  relations: RELATIONS,
  search: { mode: 'like', columns: ['first_name', 'last_name'] },
  page: { default: 5, max: 50, range: true },
  cursor: { secret: SECRET },
});

/** Text search over the generated `tsvector` column; no range requests. */
export const searchable = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: FIELDS,
  relations: RELATIONS,
  search: { vector: 'search_vector', config: 'simple' },
  page: { default: 5, max: 50 },
  cursor: { secret: SECRET },
});

/** Text search computed over columns, phrase mode, with the English configuration. */
export const phrased = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: COLUMN_FIELDS,
  search: { columns: ['first_name', 'bio'], mode: 'phrase', config: 'english' },
  cursor: { secret: SECRET },
});

/** A composite key: the sort is total only with both columns. */
export const composite = defineKeyset({
  table: 'contacts',
  key: ['createdAt', 'id'],
  fields: FIELDS,
  relations: RELATIONS,
  sort: { default: ['-createdAt', '-id'] },
  page: { default: 4, max: 50, range: true },
  cursor: { secret: SECRET },
});

/** Cursors that expire after a second. */
export const expiring = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: COLUMN_FIELDS,
  cursor: { secret: SECRET, ttl: 1 },
});

const defineCamel = createDefineKeyset<CamelDB>();

/** The same definition against the camelCase interface of a `CamelCasePlugin` application. */
export const camelContacts = defineCamel({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    firstName: { column: 'firstName', type: 'text' },
    lastName: {
      column: 'lastName',
      type: 'text',
      collation: 'insensitive',
      nullable: true,
    },
    age: { column: 'age', type: 'integer', nullable: true },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
    emailCount: {
      aggregate: { relation: 'emails', fn: 'count' },
      type: 'bigint',
    },
  },
  relations: {
    emails: {
      table: 'contactEmails',
      on: { contactId: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
  },
  search: { mode: 'like', columns: ['firstName', 'lastName'] },
  page: { default: 5, max: 50, range: true },
  cursor: { secret: SECRET },
});
