/**
 * Keysets over the test database: one defined with the core (column names
 * as strings) and one with the typed definer.
 */
import type { Keyset } from 'keyset-kit';

import type { KyselyKeyset } from '../types';
import type { DB } from './db';

import { defineKeyset } from 'keyset-kit';

import { createDefineKeyset } from '../define-keyset';

export const CONTACTS = {
  table: 'contacts',
  key: ['id'],
  fields: {
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
    emailCount: {
      aggregate: { relation: 'emails', fn: 'count' },
      type: 'bigint',
    },
    latestStart: {
      aggregate: { relation: 'workHistory', fn: 'max', column: 'start_date' },
      type: 'date',
    },
  },
  relations: {
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
      fields: { company: { column: 'company', type: 'text' } },
    },
  },
  search: { mode: 'like', columns: ['first_name', 'last_name'] },
  page: { range: true },
  cursor: { secret: 'test-secret-with-at-least-32-bytes!!' },
} as const;

export const contacts: Keyset<
  typeof CONTACTS.fields,
  typeof CONTACTS.relations
> = defineKeyset(CONTACTS);

export const defineTyped: ReturnType<typeof createDefineKeyset<DB>> =
  createDefineKeyset<DB>();

export const typedContacts: KyselyKeyset<
  typeof CONTACTS.fields,
  {
    readonly emails: {
      readonly table: 'contact_emails';
      readonly on: Readonly<Record<string, string>>;
      readonly fields: (typeof CONTACTS.relations)['emails']['fields'];
    };
    readonly workHistory: {
      readonly table: 'work_history';
      readonly on: Readonly<Record<string, string>>;
      readonly fields: (typeof CONTACTS.relations)['workHistory']['fields'];
    };
  }
> = defineTyped(CONTACTS);
