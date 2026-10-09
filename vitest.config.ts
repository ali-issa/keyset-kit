import type { ViteUserConfig } from 'vitest/config';

import { defineConfig } from 'vitest/config';

/**
 * One Vitest run over every package's project (`packages/x/vitest.config.ts`).
 * Coverage is a whole-process concern that Vitest configures only here, so
 * the thresholds apply to the combined source of all packages.
 * @ref https://vitest.dev/guide/projects
 * @ref https://vitest.dev/config/
 */
const config: ViteUserConfig = defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      // Tests and the entry barrels (`index.ts` files hold re-exports only).
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/**/*.test-d.ts',
        'packages/*/src/**/index.ts',
      ],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});

export default config;
