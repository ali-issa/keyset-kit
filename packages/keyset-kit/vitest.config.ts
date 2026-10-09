import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The core's test project; the root `vitest.config.ts` runs it and owns
 * coverage.
 * @ref https://vitest.dev/guide/projects
 */
const config: UserWorkspaceConfig = defineProject({
  test: {
    name: 'keyset-kit',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 20_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});

export default config;
