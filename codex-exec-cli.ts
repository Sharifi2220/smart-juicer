/** Explicit opt-in wrapper around codex-executor.ts. No default command reaches this path. */
import { readFileSync, statSync } from 'node:fs';
import { executeCodexRun, type ExecutionRequest } from './codex-executor.ts';

const requestPath = process.argv[2];
function output(value: unknown): void { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }

try {
  if (process.env.SMART_JUICER_EXECUTE !== '1') throw new TypeError('EXECUTION_OPT_IN_REQUIRED');
  if (process.argv.length !== 3 || !requestPath) throw new TypeError('USAGE_EXECUTE_REQUEST_JSON');
  const size = statSync(requestPath).size;
  if (size <= 0 || size > 128 * 1024) throw new TypeError('EXECUTION_REQUEST_TOO_LARGE');
  const request: unknown = JSON.parse(readFileSync(requestPath, 'utf8'));
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('INVALID_EXECUTION_REQUEST');
  const result = await executeCodexRun(request as ExecutionRequest);
  output(result);
} catch (error) {
  process.stderr.write('SMART_JUICER_EXECUTE: ' + (error instanceof TypeError ? error.message : 'EXECUTION_FAILED') + '\n');
  process.exitCode = 2;
}

