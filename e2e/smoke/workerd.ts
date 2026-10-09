/**
 * Runs the smoke checks inside workerd, the Cloudflare Workers runtime, via
 * Miniflare. workerd executes the module graph it is handed and never reads
 * `node_modules`, so `worker.ts` is bundled first with tsdown using
 * `platform: 'neutral'` (no Node shims), the way a consumer's Workers bundle
 * is built. Node runs this file: `node --experimental-strip-types`.
 * @ref https://developers.cloudflare.com/workers/testing/miniflare/get-started/
 * @ref https://tsdown.dev/options/platform
 */
import type { SmokeResult } from './checks.ts';

import { Miniflare } from 'miniflare';
import { build } from 'tsdown';

import { report } from './checks.ts';

const OUT_DIR = 'smoke/.workerd';

function isSmokeResult(value: unknown): value is SmokeResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runtime' in value &&
    'passed' in value &&
    'failures' in value
  );
}
/** Any date at or before the pinned workerd release; current behavior is what is tested. */
const COMPATIBILITY_DATE = '2026-07-01';

await build({
  // The root tsdown.config.ts builds the library; this bundle is self-contained.
  config: false,
  entry: { worker: 'smoke/worker.ts' },
  outDir: OUT_DIR,
  format: 'esm',
  platform: 'neutral',
  fixedExtension: true,
  dts: false,
  clean: true,
  logLevel: 'error',
});

const mf = new Miniflare({
  modules: true,
  scriptPath: `${OUT_DIR}/worker.mjs`,
  compatibilityDate: COMPATIBILITY_DATE,
});
await mf.ready;
try {
  const response = await mf.dispatchFetch('http://smoke.invalid/', {
    headers: { 'user-agent': 'workerd (Miniflare)' },
  });
  const result: unknown = await response.json();
  if (!isSmokeResult(result)) {
    throw new Error(`unexpected worker response: ${JSON.stringify(result)}`);
  }
  report(result);
} finally {
  await mf.dispose();
}
