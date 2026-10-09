/**
 * node-postgres (SPEC 11.2): the stock `pg` driver and its type parsers,
 * over the wire protocol to a PGlite socket server. The invariants hold,
 * and the key values cast to text are identical to the in-process
 * dialect's, so cursors issued through either decode to the same values.
 */
import type { CursorDecodeResult, CursorValue } from 'kysely-keyset';

import type { Harness } from './support/db.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCursorCodec } from 'kysely-keyset';

import { openPglite, openPgOverSocket } from './support/db.ts';
import { runInvariants } from './support/invariants.ts';
import { contacts, SECRET } from './support/keysets.ts';

runInvariants('node-postgres over pglite-socket', openPgOverSocket);

/** The values of a decoded cursor; fails the test when it did not decode. */
function valuesOf(
  result: CursorDecodeResult | undefined,
): ReadonlyArray<CursorValue> {
  if (result === undefined || !result.ok) {
    throw new Error(`cursor did not decode: ${JSON.stringify(result)}`);
  }
  return result.values;
}

/** The millisecond instant of PostgreSQL's timestamptz text form. */
function instant(text: string): number {
  const iso = text
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/u, '$1')
    .replace(/([+-]\d\d)$/u, '$1:00');
  return Date.parse(iso);
}

describe('node-postgres: cursor values', () => {
  let socket: Harness;
  let inProcess: Harness;
  beforeAll(async () => {
    socket = await openPgOverSocket();
    inProcess = await openPglite();
  });
  afterAll(async () => {
    await socket.close();
    await inProcess.close();
  });

  it('casts the same key values to text through either driver', async () => {
    const request = {
      sort: ['-createdAt', 'score', 'lastName'],
      page: { size: 50 },
    } as const;
    const viaSocket = await contacts.paginate(
      socket.db.selectFrom('contacts').select('id'),
      request,
    );
    const viaPglite = await contacts.paginate(
      inProcess.db.selectFrom('contacts').select('id'),
      request,
    );
    const codec = createCursorCodec({ secret: SECRET });
    const plan = await contacts.plan(request);
    const decode = async (cursor: string) =>
      codec.decode(cursor, plan.context, plan.keys.length);
    const fromSocket = await Promise.all(viaSocket.cursors.map(decode));
    const fromPglite = await Promise.all(viaPglite.cursors.map(decode));
    expect(fromSocket).toEqual(fromPglite);
    // The text form of a timestamptz carries the session's time zone, so
    // only the instant is stable across machines; the offset makes the
    // value self-describing wherever the cursor is later compared.
    const [created, score, lastName, id] = valuesOf(fromSocket[0]);
    expect(instant(created ?? '')).toBe(Date.parse('2024-01-09T10:00:00Z'));
    expect([score, lastName, id]).toEqual([
      '3.00',
      'null',
      '2a1b3c4d-5e6f-4789-8abc-def012345678',
    ]);
    const frank = valuesOf(
      fromSocket.find(
        (result) =>
          result.ok &&
          result.values[3] === 'e2d4a7f0-3c6b-4d8e-9f1a-2b3c4d5e6f70',
      ),
    );
    expect(frank[0]).toMatch(/\.999999[+-]\d\d(?::\d\d)?$/u);
    expect(instant(frank[0] ?? '')).toBe(
      Date.parse('2024-01-05T23:59:59.999Z'),
    );
    expect(frank.slice(1)).toEqual([
      '100.00',
      'zappa',
      'e2d4a7f0-3c6b-4d8e-9f1a-2b3c4d5e6f70',
    ]);
  });

  it("leaves the driver's own parsing of selected columns alone", async () => {
    const page = await contacts.paginate(
      socket.db
        .selectFrom('contacts')
        .select(['id', 'created_at', 'score', 'tags']),
      { page: { size: 1 } },
    );
    const row = page.rows[0];
    expect(row?.created_at).toBeInstanceOf(Date);
    expect(typeof row?.score).toBe('string');
    expect(Array.isArray(row?.tags)).toBe(true);
  });
});
