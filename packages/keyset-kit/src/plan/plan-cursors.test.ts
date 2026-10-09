import { describe, expect, it } from 'vitest';

import { createCursorCodec } from '../cursor/codec';
import { InvalidCursorError } from '../errors';
import { definition, rejected, SECRET } from '../test-support/fixtures';
import { createPlanner } from './plan';

const codec = createCursorCodec({ secret: SECRET });
const plan = createPlanner(definition, codec);

describe('createPlanner (cursors)', () => {
  it('decodes an after cursor into a seek in the request direction', async () => {
    const first = await plan({ sort: ['-createdAt'], page: { size: 2 } });
    const after = await codec.encode(['2024-01-02', 'k2'], first.context);
    const next = await plan({ sort: ['-createdAt'], page: { size: 2, after } });
    expect(next).toMatchObject({
      reversed: false,
      after,
      before: null,
      limit: 3,
    });
    expect(next.keys.map((key) => [key.direction, key.nulls])).toEqual([
      ['desc', 'last'],
      ['asc', 'last'],
    ]);
    expect(next.seek).toEqual({
      kind: 'or',
      items: [
        {
          kind: 'or',
          items: [
            {
              kind: 'compare',
              target: next.keys[0]?.target,
              operator: '<',
              value: '2024-01-02',
            },
            { kind: 'null', target: next.keys[0]?.target, negate: false },
          ],
        },
        {
          kind: 'and',
          items: [
            {
              kind: 'compare',
              target: next.keys[0]?.target,
              operator: '=',
              value: '2024-01-02',
            },
            {
              kind: 'or',
              items: [
                {
                  kind: 'compare',
                  target: next.keys[1]?.target,
                  operator: '>',
                  value: 'k2',
                },
                { kind: 'null', target: next.keys[1]?.target, negate: false },
              ],
            },
          ],
        },
      ],
    });
  });

  it('plans a before-only page inverted, with nulls first, and marks it reversed', async () => {
    const first = await plan({ sort: ['-createdAt'] });
    const before = await codec.encode([null, 'k9'], first.context);
    const previous = await plan({ sort: ['-createdAt'], page: { before } });
    expect(previous.reversed).toBe(true);
    expect(previous.keys.map((key) => [key.direction, key.nulls])).toEqual([
      ['asc', 'first'],
      ['desc', 'first'],
    ]);
    expect(previous.sort).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect(previous.seek).toEqual({
      kind: 'or',
      items: [
        { kind: 'null', target: previous.keys[0]?.target, negate: true },
        {
          kind: 'and',
          items: [
            { kind: 'null', target: previous.keys[0]?.target, negate: false },
            {
              kind: 'compare',
              target: previous.keys[1]?.target,
              operator: '<',
              value: 'k9',
            },
          ],
        },
      ],
    });
  });

  it('plans a range as a forward page bounded on both sides', async () => {
    const first = await plan({});
    const after = await codec.encode(['a'], first.context);
    const before = await codec.encode(['z'], first.context);
    const range = await plan({ page: { after, before } });
    expect(range).toMatchObject({
      reversed: false,
      range: true,
      size: 100,
      limit: 101,
    });
    expect(range.keys[0]).toMatchObject({ direction: 'asc', nulls: 'last' });
    expect(range.seek).toEqual({
      kind: 'and',
      items: [
        {
          kind: 'or',
          items: [
            {
              kind: 'compare',
              target: range.keys[0]?.target,
              operator: '>',
              value: 'a',
            },
            { kind: 'null', target: range.keys[0]?.target, negate: false },
          ],
        },
        {
          kind: 'compare',
          target: range.keys[0]?.target,
          operator: '<',
          value: 'z',
        },
      ],
    });
  });

  it('rejects cursors from another context, with the parameter that carried them', async () => {
    const sorted = await plan({ sort: ['-createdAt'] });
    const cursor = await codec.encode(['2024', 'k'], sorted.context);
    const error = await rejected(plan({ page: { after: cursor } }));
    expect(error).toBeInstanceOf(InvalidCursorError);
    expect(error).toMatchObject({ parameter: 'after', reason: 'context' });
    expect(await rejected(plan({ page: { before: 'garbage' } }))).toMatchObject(
      {
        parameter: 'before',
        reason: 'malformed',
      },
    );
  });
});
