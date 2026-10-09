/**
 * The seed rows: the cases keyset pagination must survive, in insertion
 * order that differs from every sort order.
 */
export interface ContactSeed {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string | null;
  readonly age: number | null;
  readonly score: string;
  readonly active: boolean;
  readonly status: 'lead' | 'customer';
  readonly tags: ReadonlyArray<string>;
  readonly created_at: string;
  readonly birthday: string | null;
  readonly bio: string;
}

export const CONTACTS: ReadonlyArray<ContactSeed> = [
  {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    first_name: 'Ada',
    last_name: 'Lovelace',
    age: 36,
    score: '9.50',
    active: true,
    status: 'customer',
    tags: ['math', 'pioneer'],
    created_at: '2024-01-01T10:00:00.000001Z',
    birthday: '1815-12-10',
    bio: 'wrote the first program',
  },
  {
    id: '16fd2706-8baf-433b-82eb-8c7fada847da',
    first_name: 'ada',
    last_name: 'byron',
    age: 36,
    score: '9.50',
    active: false,
    status: 'lead',
    tags: ['math'],
    created_at: '2024-01-01T10:00:00.000001Z',
    birthday: null,
    bio: 'same person, different record',
  },
  {
    id: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    first_name: 'Bob',
    last_name: 'Null',
    age: null,
    score: '0.00',
    active: true,
    status: 'lead',
    tags: [],
    created_at: '2024-01-02T10:00:00Z',
    birthday: '1990-05-05',
    bio: 'has no age',
  },
  {
    id: '0b1f3b8a-2c4d-4e6f-8a9b-0c1d2e3f4a5b',
    first_name: 'Carol',
    last_name: 'LOVELACE',
    age: 41,
    score: '2.25',
    active: true,
    status: 'customer',
    tags: ['ops', 'pioneer'],
    created_at: '2024-01-03T10:00:00.000002Z',
    birthday: '1983-03-03',
    bio: 'runs the machines 100% of the time',
  },
  {
    id: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
    first_name: 'Dan',
    last_name: null,
    age: 25,
    score: '2.25',
    active: false,
    status: 'lead',
    tags: ['ops'],
    created_at: '2024-01-03T10:00:00.000002Z',
    birthday: null,
    bio: 'no last name',
  },
  {
    id: '9b2e0b44-bd4a-4b5c-9a39-1c0c2e2b7e11',
    first_name: 'Eve',
    last_name: null,
    age: 25,
    score: '7.75',
    active: true,
    status: 'customer',
    tags: ['sec'],
    created_at: '2024-01-04T00:00:00Z',
    birthday: '1999-09-09',
    bio: 'listens',
  },
  {
    id: 'e2d4a7f0-3c6b-4d8e-9f1a-2b3c4d5e6f70',
    first_name: 'Frank',
    last_name: 'Zappa',
    age: null,
    score: '100.00',
    active: true,
    status: 'lead',
    tags: ['music'],
    created_at: '2024-01-05T23:59:59.999999Z',
    birthday: '1940-12-21',
    bio: 'plays guitar',
  },
  {
    id: '3f1e2d3c-4b5a-4968-8777-665544332211',
    first_name: 'Grace',
    last_name: 'Hopper',
    age: 85,
    score: '50.50',
    active: false,
    status: 'customer',
    tags: ['navy', 'cobol'],
    created_at: '2024-01-06T12:00:00Z',
    birthday: '1906-12-09',
    bio: 'found the bug',
  },
  {
    id: 'd1e2f3a4-b5c6-4d7e-8f90-a1b2c3d4e5f6',
    first_name: 'Heidi',
    last_name: 'Klum',
    age: 30,
    score: '1.50',
    active: true,
    status: 'lead',
    tags: [],
    created_at: '2024-01-07T10:00:00Z',
    birthday: null,
    bio: 'walks',
  },
  {
    id: '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d',
    first_name: 'Ivan',
    last_name: 'Ivanov',
    age: 30,
    score: '1.50',
    active: true,
    status: 'lead',
    tags: ['ops', 'sec'],
    created_at: '2024-01-07T10:00:00Z',
    birthday: '1988-02-29',
    bio: 'born on a leap day',
  },
  {
    id: '8e7d6c5b-4a39-4281-9706-f5e4d3c2b1a0',
    first_name: 'Judy',
    last_name: 'lovelace',
    age: null,
    score: '3.00',
    active: false,
    status: 'customer',
    tags: ['math'],
    created_at: '2024-01-08T10:00:00Z',
    birthday: '1970-01-01',
    bio: 'the epoch',
  },
  {
    id: '2a1b3c4d-5e6f-4789-8abc-def012345678',
    first_name: 'Mallory',
    last_name: 'Null',
    age: 30,
    score: '3.00',
    active: true,
    status: 'customer',
    tags: ['sec'],
    created_at: '2024-01-09T10:00:00Z',
    birthday: null,
    bio: 'tampers with cursors',
  },
];

export interface EmailSeed {
  readonly contact_id: string;
  readonly email: string;
  readonly is_primary: boolean;
}

function id(index: number): string {
  const row = CONTACTS[index - 1];
  if (row === undefined) {
    throw new Error(`no seed contact ${String(index)}`);
  }
  return row.id;
}

export const EMAILS: ReadonlyArray<EmailSeed> = [
  { contact_id: id(1), email: 'ada@example.com', is_primary: true },
  { contact_id: id(1), email: 'ada@analytical.org', is_primary: false },
  { contact_id: id(3), email: 'bob@example.com', is_primary: true },
  { contact_id: id(4), email: 'carol@x.io', is_primary: true },
  { contact_id: id(4), email: 'carol@example.com', is_primary: false },
  { contact_id: id(5), email: 'dan@x.io', is_primary: true },
  { contact_id: id(7), email: 'frank@x.io', is_primary: true },
  { contact_id: id(7), email: 'frank@zappa.com', is_primary: false },
  { contact_id: id(7), email: 'frank@example.com', is_primary: false },
  { contact_id: id(8), email: 'grace@example.com', is_primary: true },
  { contact_id: id(10), email: 'ivan@x.io', is_primary: true },
  { contact_id: id(11), email: 'judy@example.com', is_primary: true },
  { contact_id: id(12), email: 'mallory@x.io', is_primary: true },
  { contact_id: id(12), email: 'mallory@example.com', is_primary: false },
];

export interface WorkSeed {
  readonly contact_id: string;
  readonly company: string;
  readonly start_date: string;
}

export const WORK: ReadonlyArray<WorkSeed> = [
  {
    contact_id: id(1),
    company: 'Analytical Engines',
    start_date: '1843-01-01',
  },
  { contact_id: id(4), company: 'Acme', start_date: '2010-01-01' },
  { contact_id: id(4), company: 'Globex', start_date: '2015-06-01' },
  { contact_id: id(5), company: 'Initech', start_date: '2001-01-01' },
  { contact_id: id(7), company: 'Mothers', start_date: '1964-01-01' },
  { contact_id: id(8), company: 'Navy', start_date: '1943-12-01' },
  { contact_id: id(8), company: 'Univac', start_date: '1949-01-01' },
  { contact_id: id(10), company: 'Globex', start_date: '2020-02-02' },
  { contact_id: id(12), company: 'Acme', start_date: '2022-01-01' },
];
