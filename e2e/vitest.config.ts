import type { ViteUserConfig } from 'vitest/config';

import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite. Each file boots an in-process PostgreSQL (PGlite) or
 * connects to a server named by `KEYSET_PG_URL`; the timeouts allow for
 * that.
 * @ref https://vitest.dev/config/
 */
const config: ViteUserConfig = defineConfig({
  test: {
    include: ['**/*.e2e.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

export default config;
