/** Explicit-file, read-only routing experiment. No agent invocation or raw prompt output. */
import { readFileSync, statSync } from 'node:fs';
import { recommendModel } from './routing-policy.ts';

const path = process.argv[2];
try {
  if (process.argv.length !== 3 || !path) throw new TypeError('USAGE_ROUTE_EXPLICIT_JSON_FILE');
  const size = statSync(path).size;
  if (size <= 0 || size > 1024 * 1024) throw new TypeError('ROUTE_INPUT_TOO_LARGE');
  const raw: unknown = JSON.parse(readFileSync(path,'utf8'));
  process.stdout.write(JSON.stringify(recommendModel(raw),null,2)+'\n');
} catch (e) {
  process.stderr.write('SMART_JUICER_ROUTE: '+(e instanceof TypeError ? e.message : 'INVALID_INPUT_OR_FILE')+'\n');
  process.exitCode = 2;
}
