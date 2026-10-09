/**
 * In-process entry for Bun and Deno: the runtime under test loads both
 * packages from `node_modules` the way Node does (Deno 2 does so because
 * `package.json` puts it in manual `node_modules` mode) and runs the
 * checks with its own Web Crypto.
 * @ref https://bun.com/docs/runtime/modules
 * @ref https://docs.deno.com/runtime/fundamentals/node/#control-node_modules
 */
import { report, runChecks } from './checks.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads a runtime's global, if present, without a type assertion. */
function global(name: string): unknown {
  return Reflect.get(globalThis, name);
}

function runtime(): string {
  const bun = global('Bun');
  if (isRecord(bun) && typeof bun['version'] === 'string') {
    return `Bun ${bun['version']}`;
  }
  const deno = global('Deno');
  const version = isRecord(deno) ? deno['version'] : undefined;
  if (isRecord(version) && typeof version['deno'] === 'string') {
    return `Deno ${version['deno']}`;
  }
  return 'unknown runtime';
}

report(await runChecks(runtime()));
