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
import { execFileSync, spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { inspectGitRepository, type ScopeReport } from './inspector.ts';

export type ExecutionVariant = 'B0' | 'B1';
export type ExecutionEffort = 'low' | 'medium' | 'high' | 'xhigh';
/** Independent experimental run binding; NOT an execution approval. */
export interface PilotRunBinding {
  readonly manifestSha256: string;
  readonly runId: string;
}

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
  readonly pilot?: PilotRunBinding;
}

export interface ExecutionRequest {
  readonly root: string;
  readonly prompt: string;
  readonly variant: ExecutionVariant;
  readonly modelId: string | null;
  readonly effort: ExecutionEffort | null;
  readonly allowWrites: boolean;
  readonly approval: ExplicitExecutionApproval;
  readonly pilot?: PilotRunBinding;
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
  // Ordinary B0 remains the native, unmodified configuration.
  // Experimental B0 pins the same model as B1 and requires a separate host gate.
  const pilot = input.pilot !== undefined || approval.pilot !== undefined;
  if (pilot) {
    const id = input.pilot?.runId;
    if (!input.pilot || !approval.pilot ||
      !/^[0-9a-f]{64}$/.test(input.pilot.manifestSha256) ||
      typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}:B[01]$/.test(id) ||
      !id.endsWith(':' + input.variant) ||
      input.pilot.manifestSha256 !== approval.pilot.manifestSha256 ||
      id !== approval.pilot.runId) throw new TypeError('PILOT_BINDING_MISMATCH');
    if (input.effort !== (input.variant === 'B0' ? 'medium' : 'low'))
      throw new TypeError('PILOT_EFFORT_MISMATCH');
  }
  validateModel(input.modelId, input.variant === 'B1' || pilot);
  validateEffort(input.effort, input.variant === 'B1' || pilot);
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
  if (input.variant === 'B1' || input.pilot !== undefined) {
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

/** A Codex CLI run's verified accounting comes from turn.completed.usage.
 * Intermediate objects may contain deltas or cumulative snapshots; never mix them.
 * A turn.failed event currently has no guaranteed final usage: preserve UNKNOWN.
 */
export function usageFromCompletedCodexEvent(value: unknown): CodexUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (value as Record<string,unknown>).type !== 'turn.completed') throw new TypeError('NOT_COMPLETED_CODEX_TURN');
  const event=value as Record<string,unknown>;
  const raw=event.usage;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('MISSING_COMPLETED_USAGE');
  const inputTokens=numberAt(raw,'input_tokens');
  const outputTokens=numberAt(raw,'output_tokens');
  const cachedInputTokens=numberAt(raw,'cached_input_tokens');
  if (inputTokens===null || outputTokens===null ||
      !Number.isSafeInteger(inputTokens+outputTokens) ||
      (cachedInputTokens!==null && cachedInputTokens>inputTokens))
    throw new TypeError('INVALID_COMPLETED_USAGE');
  return {inputTokens,cachedInputTokens,outputTokens};
}

/** A best-effort teardown helper, NOT an enforced process-containment sandbox. */
export function processTeardownPlan(pid: number, platform: NodeJS.Platform = process.platform):
  {readonly command:'taskkill'; readonly args:readonly string[]} | {readonly processGroup:number} {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError('INVALID_PROCESS_PID');
  return platform === 'win32'
    ? {command:'taskkill',args:['/PID',String(pid),'/T','/F']}
    : {processGroup:-pid};
}
function terminateProcessTreeBestEffort(child: ReturnType<typeof spawn>): void {
  if (!child.pid) { try { child.kill('SIGKILL'); } catch {} return; }
  const plan=processTeardownPlan(child.pid);
  try {
    if ('command' in plan) execFileSync(plan.command,[...plan.args],{
      windowsHide:true,timeout:3000,stdio:'ignore'
    });
    else process.kill(plan.processGroup,'SIGKILL');
  } catch { try { child.kill('SIGKILL'); } catch {} }
}
function parseEventLine(line: string, usage: CodexUsage, eventTypes: Set<string>): CodexUsage {
  if (!line.trim()) return usage;
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { throw new TypeError('INVALID_CODEX_JSONL_EVENT'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('INVALID_CODEX_EVENT');
  const event = parsed as Record<string, unknown>;
  if (event.type==='turn.completed' && eventTypes.has('turn.completed'))
    throw new TypeError('MULTIPLE_CODEX_TURNS_NOT_SUPPORTED');
  if (typeof event.type === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(event.type)) eventTypes.add(event.type);
  return event.type === 'turn.completed' ? usageFromCompletedCodexEvent(event) : usage;
}

/**
 * Execute exactly one explicitly approved Codex turn. This function is not
 * called by the routing policy or by any default CLI command.
 */
/** The request JSON is not its own authorization: the host must explicitly
 * allow this invocation and pin the canonical isolated worktree out-of-band.
 */
export function validateHostExecutionGate(root: string, env: NodeJS.ProcessEnv = process.env): void {
  if(env.SMART_JUICER_EXECUTE !== '1') throw new TypeError('EXECUTION_OPT_IN_REQUIRED');
  const hostRoot=env.SMART_JUICER_APPROVED_ROOT;
  if(typeof hostRoot!=='string'||!isAbsolute(hostRoot)) throw new TypeError('HOST_APPROVED_ROOT_REQUIRED');
  const actual=realpathSync(root);
  const approved=realpathSync(hostRoot);
  if(relative(actual,approved)!==''||relative(approved,actual)!=='') throw new TypeError('HOST_APPROVED_ROOT_MISMATCH');
}

/** Host-controlled, independently pinned pilot manifest. Never trust request JSON alone. */
export function validateHostPilotGate(input: ExecutionRequest, env: NodeJS.ProcessEnv = process.env): void {
  if (!input.pilot) return;
  const pinned = env.SMART_JUICER_PILOT_MANIFEST_SHA256;
  if (typeof pinned !== 'string' || !/^[0-9a-f]{64}$/.test(pinned) || pinned !== input.pilot.manifestSha256)
    throw new TypeError('HOST_PILOT_MANIFEST_MISMATCH');
}

/** Reject regular checkouts and submodules incorrectly marked "isolated".
 * This is still a snapshot, not a host sandbox / TOCTOU security boundary.
 */
export function assertLinkedGitWorktree(root: string): void {
  const dotGit=lstatSync(resolve(root,'.git'));
  if(dotGit.isSymbolicLink()||!dotGit.isFile()) throw new TypeError('LINKED_GIT_WORKTREE_REQUIRED');
  const opts={encoding:'utf8' as const,timeout:5000,windowsHide:true};
  const git=(argument:string)=>realpathSync(execFileSync('git',
    ['--no-optional-locks','-c','core.fsmonitor=false','-C',root,'rev-parse','--path-format=absolute',argument],opts).trim());
  const privateGitDir=git('--git-dir');
  const commonGitDir=git('--git-common-dir');
  if(relative(privateGitDir,commonGitDir)===''&&relative(commonGitDir,privateGitDir)==='') {
    throw new TypeError('LINKED_GIT_WORKTREE_REQUIRED');
  }
}

export async function executeCodexRun(input: ExecutionRequest): Promise<ExecutionResult> {
  validateExecutionRequest(input);
  const root = realpathSync(resolve(input.root));
  validateHostExecutionGate(root);
  validateHostPilotGate(input);
  const approvedRoot = realpathSync(resolve(input.approval.approvedRoot));
  if (relative(root, approvedRoot) !== '' || relative(approvedRoot, root) !== '') throw new TypeError('WORKTREE_IDENTITY_CHANGED');
  assertLinkedGitWorktree(root);
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
    detached: process.platform !== 'win32', // required for POSIX process-group teardown
    stdio: ['pipe', 'pipe', 'pipe']
  });
  // A stopped CLI may leave grandchildren behind on both platforms; the host
  // sandbox/job controller must independently enforce the true process boundary.
  child.stdin.on('error',()=>{ /* EPIPE after failure: terminal result remains failed */ });
  const finishLine = (line: string) => { usage = parseEventLine(line, usage, eventTypes); };
  const stdoutPromise = new Promise<void>((resolvePromise, rejectPromise) => {
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_OUTPUT_BYTES) { outputLimit = true; terminateProcessTreeBestEffort(child); return; }
      lineBuffer += chunk.toString('utf8');
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';
      try { for (const line of lines) { if (line.trim()) eventCount += 1; finishLine(line); } } catch (error) { parseError = true; rejectPromise(error); terminateProcessTreeBestEffort(child); }
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
  const timer = setTimeout(() => { timedOut = true; terminateProcessTreeBestEffort(child); }, input.approval.maxDurationMs);
  const [exit] = await Promise.all([exitPromise, stdoutPromise.catch(() => undefined)]);
  clearTimeout(timer);
  if (outputLimit) status = 'output_limit';
  else if (timedOut) status = 'timed_out';
  else if (!parseError && exit.code === 0 && eventTypes.has('turn.completed') && !eventTypes.has('turn.failed')) status = 'completed';
  else status = 'failed';
  return Object.freeze({executed:true, status, exitCode:exit.code, signal:exit.signal,
    modelId:input.modelId, variant:input.variant, durationMs:Date.now()-started,
    eventCount, eventTypes:Object.freeze([...eventTypes].sort()),
    usage:Object.freeze(status==='completed'?usage:{inputTokens:null,cachedInputTokens:null,outputTokens:null}),
    scope, stderrBytes, outputBytes, billingCostEur:null});
}

