/** Local read-only CLI; accepts one JSON object on stdin, emits one JSON result. */
import { observeTask } from './observer.ts';

const MAX_BYTES = 65536;
const MAX_JSON_DEPTH = 32;

function validateNesting(text: string): void {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === '{' || char === '[') {
      if (++depth > MAX_JSON_DEPTH) throw new TypeError('JSON_NESTING_TOO_DEEP');
    } else if (char === '}' || char === ']') {
      --depth;
    }
  }
}

async function readLimitedStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    length += bytes.byteLength;
    if (length > MAX_BYTES) throw new TypeError('INPUT_TOO_LARGE');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, length).toString('utf8');
}

async function main(): Promise<void> {
  if (process.argv.length !== 2 && !(process.argv.length === 3 && process.argv[2] === '--help')) {
    throw new TypeError('UNSUPPORTED_ARGUMENTS');
  }
  if (process.argv.includes('--help')) {
    process.stdout.write('Smart Juicer V0.1: pipe JSON to stdin; no network, no agent execution.\n');
    return;
  }
  const content = await readLimitedStdin();
  validateNesting(content);
  const obj: unknown = JSON.parse(content);
  process.stdout.write(JSON.stringify(observeTask(obj)) + '\n');
}
void main().catch((err: unknown) => {
  const message = err instanceof SyntaxError ? 'INVALID_JSON' : err instanceof TypeError ? err.message : 'INTERNAL_ERROR';
  // Never print inputs, file paths or private error stacks.
  process.stderr.write('Smart Juicer: ' + (/^[A-Z_]+$/.test(message) ? message : 'INTERNAL_ERROR') + '\n');
  process.exitCode = 2;
});
