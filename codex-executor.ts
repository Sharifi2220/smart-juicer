/**
 * Explicit Codex execution adapter.
 *
 * This is intentionally separate from the advisory routing policy. It never
 * accepts a model recommendation as authorization. A caller must provide a
 * fresh, explicit operator approval that names the exact model (or explicitly
 * chooses the native B0 arm), an isolated clean Git worktree, a time limit,
 * and a budget authorization. The budget is an authorization boundary only;
 * billing remains UNKNOWN until provider-side evidence is collected.
 */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { inspectGitRepository, type ScopeReport } from './inspector.ts';

export type ExecutionVariant = 'B0' | 'B1';
export type ExecutionEffort = 'low' | 'medium' | 'high' | 'xhigh';

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,100}$/;
const MAX_PROMPT_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_DURATION_MS = 15 * 60 * 1000;

export interface ExplicitExecutionApproval {
  readonly enabled: true;
  readonly explicit: true;
  readonly isolatedWorktree: true;
  readonly variant: ExecutionVariant;
  readonly modelId: string | null;
  readonly effort: ExecutionEffort | null;
  readonly allowWrites: boolean;
  readonly approvedRoot: string;
  readonly budgetEur: number;
  readonly maxDurationMs: number;
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly operator: string;
}

export interface ExecutionRequest {
  readonly root: string;
  readonly prompt: string;
  readonly variant: ExecutionVariant;
  readonly modelId: string | null;
  readonly effort: ExecutionEffort | null;
  readonly allowWrites: boolean;
  readonly approval: ExplicitExecutionApproval;
}

export interface CodexCommandPlan {
  readonly executable: 'codex';
  readonly args: readonly string[];
  readonly cwd: string;
  readonly sandbox: 'read-only' | 'workspace-write';
  readonly modelId: string | null;
}

export interface CodexUsage {
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface ExecutionResult {
  readonly executed: true;
  readonly status: 'completed' | 'failed' | 'timed_out' | 'output_limit';
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly modelId: string | null;
  readonly variant: ExecutionVariant;
  readonly durationMs: number;
  readonly eventCount: number;
  readonly eventTypes: readonly string[];
  readonly usage: CodexUsage;
  readonly scope: ScopeReport;
  readonly stderrBytes: number;
  readonly outputBytes: number;
  readonly billingCostEur: null;
}

function finiteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validateDate(value: unknown, name: string): number {
  if (typeof value !== 'string') throw new TypeError(`INVALID_${name}`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`INVALID_${name}`);
  return parsed;
}

function validateModel(modelId: string | null, required: boolean): void {
  if (required && (typeof modelId !== 'string' || !MODEL_ID.test(modelId))) {
    throw new TypeError('EXPLICIT_MODEL_REQUIRED');
  }
  if (!required && modelId !== null) throw new TypeError('B0_FORBIDS_MODEL_OVERRIDE');
  if (modelId !== null && !MODEL_ID.test(modelId)) throw new TypeError('INVALID_MODEL_ID');
}

function validateEffort(effort: ExecutionEffort | null, required: boolean): void {
  if (required && (effort === null || !['low', 'medium', 'high', 'xhigh'].includes(effort))) {
    throw new TypeError('EXPLICIT_EFFORT_REQUIRED');
  }
  if (!required && effort !== null) throw new TypeError('B0_FORBIDS_EFFORT_OVERRIDE');
}

/** Validate all authorization fields without starting a process. */
export function validateExecutionRequest(input: ExecutionRequest, now = Date.now()): void {
  if (!input || !['B0', 'B1'].includes(input.variant)) throw new TypeError('INVALID_EXECUTION_VARIANT');
  if (typeof input.root !== 'string' || !isAbsolute(input.root)) throw new TypeError('ABSOLUTE_WORKTREE_REQUIRED');
  if (typeof input.prompt !== 'string' || Buffer.byteLength(input.prompt, 'utf8') > MAX_PROMPT_BYTES) {
    throw new TypeError('PROMPT_TOO_LARGE');
  }
  if (!input.prompt.trim()) throw new TypeError('EMPTY_PROMPT');
  if (typeof input.allowWrites !== 'boolean') throw new TypeError('INVALID_WRITE_POLICY');
  const approval = input.approval;
  if (!approval || approval.enabled !== true || approval.explicit !== true || approval.isolatedWorktree !== true) {
    throw new TypeError('EXPLICIT_ISOLATED_APPROVAL_REQUIRED');
  }
  if (approval.variant !== input.variant || approval.allowWrites !== input.allowWrites) {
    throw new TypeError('APPROVAL_MISMATCH');
  }
  if (typeof approval.approvedRoot !== 'string' || !isAbsolute(approval.approvedRoot)) throw new TypeError('APPROVED_ROOT_REQUIRED');
  if (approval.modelId !== input.modelId || approval.effort !== input.effort) throw new TypeError('APPROVAL_MODEL_MISMATCH');
  validateModel(input.modelId, input.variant === 'B1');
  validateEffort(input.effort, input.variant === 'B1');
  if (typeof approval.operator !== 'string' || !/^[^\r\n]{1,160}$/.test(approval.operator.trim())) throw new TypeError('INVALID_OPERATOR');
  if (typeof approval.budgetEur !== 'number' || !Number.isFinite(approval.budgetEur) || approval.budgetEur <= 0) {
    throw new TypeError('POSITIVE_BUDGET_REQUIRED');
  }
  if (!finiteInteger(approval.maxDurationMs) || approval.maxDurationMs < 1 || approval.maxDurationMs > MAX_DURATION_MS) {
    throw new TypeError('INVALID_DURATION_LIMIT');
  }
  const approvedAt = validateDate(approval.approvedAt, 'APPROVED_AT');
  const expiresAt = validateDate(approval.expiresAt, 'EXPIRES_AT');
  if (expiresAt <= approvedAt || approvedAt > now || expiresAt <= now) throw new TypeError('APPROVAL_EXPIRED_OR_FUTURE');
}

/** Build the exact argv used by the adapter. No prompt or secret is put in argv. */
export function buildCodexCommand(input: ExecutionRequest, root: string): CodexCommandPlan {
  validateExecutionRequest(input);
  const sandbox = input.allowWrites ? 'workspace-write' : 'read-only';
  const args = [
    'exec', '--json', '--ephemeral', '--ignore-user-config',
    '--sandbox', sandbox, '--ask-for-approval', 'on-request', '--cd', root
  ];
  if (input.variant === 'B1') {
    args.push('--model', input.modelId!, '-c', `model_reasoning_effort=${input.effort}`);
  }
  args.push('-');
  return Object.freeze({ executable: 'codex', args: Object.freeze(args), cwd: root, sandbox, modelId: input.modelId });
}

function numberAt(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return finiteInteger(candidate) ? candidate : null;
}

function updateUsage(current: CodexUsage, event: Record<string, unknown>): CodexUsage {
  const raw = event.usage && typeof event.usage === 'object' ? event.usage : event;
  return {
    inputTokens: numberAt(raw, 'input_tokens') ?? current.inputTokens,
    cachedInputTokens: numberAt(raw, 'cached_input_tokens') ?? current.cachedInputTokens,
    outputTokens: numberAt(raw, 'output_tokens') ?? current.outputTokens
  };
}

function parseEventLine(line: string, usage: CodexUsage, eventTypes: Set<string>): CodexUsage {
  if (!line.trim()) return usage;
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { throw new TypeError('INVALID_CODEX_JSONL_EVENT'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('INVALID_CODEX_EVENT');
  const event = parsed as Record<string, unknown>;
  if (typeof event.type === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(event.type)) eventTypes.add(event.type);
  return updateUsage(usage, event);
}

/**
 * Execute exactly one explicitly approved Codex turn. This function is not
 * called by the routing policy or by any default CLI command.
 */
export async function executeCodexRun(input: ExecutionRequest): Promise<ExecutionResult> {
  validateExecutionRequest(input);
  const root = realpathSync(resolve(input.root));
  const approvedRoot = realpathSync(resolve(input.approval.approvedRoot));
  if (relative(root, approvedRoot) !== '' || relative(approvedRoot, root) !== '') throw new TypeError('WORKTREE_IDENTITY_CHANGED');
  const scope = inspectGitRepository(root);
  if (scope.gitDirty) throw new TypeError('DIRTY_WORKTREE_REQUIRES_ISOLATED_FIXTURE');
  if (scope.sensitivePaths.length > 0) throw new TypeError('SENSITIVE_PATH_REQUIRES_REVIEW');
  const plan = buildCodexCommand(input, root);
  const started = Date.now();
  const eventTypes = new Set<string>();
  let usage: CodexUsage = { inputTokens: null, cachedInputTokens: null, outputTokens: null };
  let outputBytes = 0;
  let stderrBytes = 0;
  let lineBuffer = '';
  let status: ExecutionResult['status'] = 'failed';
  let timedOut = false;
  let outputLimit = false;
  let parseError = false;
  let eventCount = 0;

  const child = spawn(plan.executable, [...plan.args], {
    cwd: plan.cwd,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const finishLine = (line: string) => { usage = parseEventLine(line, usage, eventTypes); };
  const stdoutPromise = new Promise<void>((resolvePromise, rejectPromise) => {
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_OUTPUT_BYTES) { outputLimit = true; child.kill(); return; }
      lineBuffer += chunk.toString('utf8');
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';
      try { for (const line of lines) { if (line.trim()) eventCount += 1; finishLine(line); } } catch (error) { parseError = true; rejectPromise(error); child.kill(); }
    });
    child.stdout.on('end', () => {
      try { if (lineBuffer) { eventCount += 1; finishLine(lineBuffer); } resolvePromise(); } catch (error) { parseError = true; rejectPromise(error); }
    });
  });
  child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.byteLength; });
  const exitPromise = new Promise<{code:number|null; signal:NodeJS.Signals|null}>((resolveExit) => {
    child.on('close', (code, signal) => resolveExit({code, signal}));
    child.on('error', () => resolveExit({code: null, signal: null}));
  });
  child.stdin.end(input.prompt, 'utf8');
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, input.approval.maxDurationMs);
  const [exit] = await Promise.all([exitPromise, stdoutPromise.catch(() => undefined)]);
  clearTimeout(timer);
  if (outputLimit) status = 'output_limit';
  else if (timedOut) status = 'timed_out';
  else if (!parseError && exit.code === 0) status = 'completed';
  else status = 'failed';
  return Object.freeze({executed:true, status, exitCode:exit.code, signal:exit.signal,
    modelId:input.modelId, variant:input.variant, durationMs:Date.now()-started,
    eventCount, eventTypes:Object.freeze([...eventTypes].sort()), usage:Object.freeze(usage),
    scope, stderrBytes, outputBytes, billingCostEur:null});
}

