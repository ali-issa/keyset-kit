import { describe, expect, it } from 'vitest';

import { escapeLike } from './like';

describe('escapeLike', () => {
  it('escapes the three characters with meaning in a pattern', () => {
    expect(escapeLike('100%_done\\')).toBe('100\\%\\_done\\\\');
  });

  it('leaves everything else alone', () => {
    expect(escapeLike("O'Brien & Co. (née Smith) *")).toBe(
      "O'Brien & Co. (née Smith) *",
    );
    expect(escapeLike('')).toBe('');
  });
});
