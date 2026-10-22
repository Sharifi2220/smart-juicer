/** Smart Juicer paired pilot: offline manifest, source-specific usage, journal and ITT report.
 * This module NEVER runs an agent, reads user repositories, or authorizes payment.
 */
import { createHash } from 'node:crypto';
import { normalizeRelativePath } from './path-policy.ts';

export type PilotArm = 'B0' | 'B1';
export type PilotStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'crashed';
export type UsageSource = 'responses' | 'chat_completions' | 'codex_jsonl' | 'anthropic_messages';
export interface PilotTask {
  readonly id: string;
  readonly fixtureCommit: string;
  readonly promptSha256: string;
  readonly acceptanceId: string;
  readonly allowedTestPaths: readonly string[];
  readonly requiredMutationKills: number;
}
export interface PilotManifest {
  readonly schemaVersion: 'smart-juicer-pilot-v0.6';
  readonly cohortId: string;
  readonly modelId: string;
  readonly baselineEffort: 'medium';
  readonly candidateEffort: 'low';
  readonly tasks: readonly PilotTask[];
}
export interface PilotUsage {
  readonly source: UsageSource;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number;
}
export interface PilotVerifier {
  readonly accepted: boolean;
  readonly evidenceId: string;
  readonly mutationKills: number;
  /** The verifier must be an independent, fixed test procedure outside the agent workspace. */
  readonly source: 'external_verifier';
}
export interface PilotEventInput {
  readonly taskId: string;
  readonly arm: PilotArm;
  readonly status: Exclude<PilotStatus, 'pending'>;
  readonly usage?: PilotUsage | null;
  readonly verifier?: PilotVerifier | null;
}
export interface PilotEvent extends PilotEventInput {
  readonly sequence: number;
  readonly previousHash: string;
  readonly eventHash: string;
}
export interface PilotArmReport {
  readonly assigned: number;
  readonly accepted: number;
  readonly acceptanceRate: number;
  readonly statuses: Readonly<Record<PilotStatus, number>>;
  readonly usageComplete: boolean;
  readonly missingUsage: number;
  readonly totalTokens: number | null;
  readonly tokensPerAccepted: number | null;
}
export interface PairedContingencyTable {
  /** B0 success and B1 success. */
  readonly bothAccepted_n11: number;
  /** B0 success and B1 failure. */
  readonly b0OnlyAccepted_n10: number;
  /** B0 failure and B1 success. */
  readonly b1OnlyAccepted_n01: number;
  /** Neither arm accepted. */
  readonly neitherAccepted_n00: number;
}
export interface PilotReport {
  readonly schemaVersion: 'smart-juicer-pilot-report-v0.6';
  readonly manifestSha256: string;
  readonly assignedPairs: number;
  readonly arms: Readonly<Record<PilotArm, PilotArmReport>>;
  readonly acceptedDifferenceB1MinusB0: number;
  readonly bothAcceptedPairs: number;
  readonly contingency: PairedContingencyTable;
  readonly claimedSavingsPercent: number | null;
  readonly nonInferiorityEstablished: false;
  readonly safeForAutomaticRouting: false;
  readonly evidenceLevel: 'IMPORTED_UNVERIFIED';
  readonly warnings: readonly string[];
}
const HASH = /^[0-9a-f]{64}$/;
const GIT = /^[0-9a-f]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const hash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('INVALID_OBJECT');
  return raw as Record<string, unknown>;
}
function numberField(data: Record<string, unknown>, key: string): number {
  if (!count(data[key])) throw new TypeError(`INVALID_${key.toUpperCase()}`);
  return data[key] as number;
}
function optionalNumber(data: Record<string, unknown>, key: string): number | null {
  if (data[key] === undefined || data[key] === null) return null;
  return numberField(data, key);
}
/** Endpoint-specific adapters, never add cached or reasoning tokens again. */
export function normalizePilotUsage(value: unknown, source: UsageSource): PilotUsage {
  if (!['responses', 'chat_completions', 'codex_jsonl', 'anthropic_messages'].includes(source)) throw new TypeError('INVALID_USAGE_SOURCE');
  const root = record(value);
  const usage = record(root.usage && typeof root.usage === 'object' ? root.usage : root);
  const inputKey = source === 'responses' ? 'input_tokens' : source === 'chat_completions' ? 'prompt_tokens' : 'input_tokens';
  const outputKey = source === 'responses' ? 'output_tokens' : source === 'chat_completions' ? 'completion_tokens' : 'output_tokens';
  // Claude Messages usage fields are disjoint; OpenAI/Codex input already
  // includes cached tokens. Never reuse the same accounting formula across APIs.
  const inputTokens = source === 'anthropic_messages'
    ? numberField(usage, 'input_tokens')
      + (optionalNumber(usage, 'cache_creation_input_tokens') ?? 0)
      + (optionalNumber(usage, 'cache_read_input_tokens') ?? 0)
    : numberField(usage, inputKey);
  const outputTokens = numberField(usage, outputKey);
  const inputDetails = source === 'responses' ? usage.input_tokens_details : source === 'chat_completions' ? usage.prompt_tokens_details : null;
  const outputDetails = source === 'responses' ? usage.output_tokens_details : source === 'chat_completions' ? usage.completion_tokens_details : null;
  const cachedInputTokens = source === 'anthropic_messages'
    ? optionalNumber(usage, 'cache_read_input_tokens')
    : source === 'codex_jsonl'
    ? optionalNumber(usage, 'cached_input_tokens')
    : inputDetails == null ? null : optionalNumber(record(inputDetails), 'cached_tokens');
  const reasoningTokens = outputDetails == null ? null : optionalNumber(record(outputDetails), 'reasoning_tokens');
  if (cachedInputTokens !== null && cachedInputTokens > inputTokens) throw new TypeError('CACHED_EXCEEDS_INPUT');
  if (reasoningTokens !== null && reasoningTokens > outputTokens) throw new TypeError('REASONING_EXCEEDS_OUTPUT');
  const totalTokens = inputTokens + outputTokens;
  if (!Number.isSafeInteger(totalTokens)) throw new TypeError('TOKEN_OVERFLOW');
  if (usage.total_tokens !== undefined && usage.total_tokens !== null && numberField(usage, 'total_tokens') !== totalTokens) {
    throw new TypeError('INCONSISTENT_TOTAL_TOKENS');
  }
  return Object.freeze({ source, inputTokens, outputTokens, cachedInputTokens, reasoningTokens, totalTokens });
}
/** Validate a deterministic, pre-registered set of tasks; hash authenticates equality, not authorship. */
export function sealPilotManifest(manifest: PilotManifest): { readonly manifest: PilotManifest; readonly sha256: string } {
  const root = record(manifest);
  if (root.schemaVersion !== 'smart-juicer-pilot-v0.6' || typeof root.cohortId !== 'string' || !ID.test(root.cohortId)
      || typeof root.modelId !== 'string' || !ID.test(root.modelId)
      || root.baselineEffort !== 'medium' || root.candidateEffort !== 'low') throw new TypeError('INVALID_PILOT_MANIFEST');
  if (!Array.isArray(manifest.tasks) || manifest.tasks.length < 1 || manifest.tasks.length > 1000) throw new TypeError('INVALID_TASK_COUNT');
  const seen = new Set<string>();
  for (const task of manifest.tasks) {
    if (!task || typeof task.id !== 'string' || !ID.test(task.id) || seen.has(task.id)
      || !GIT.test(task.fixtureCommit) || !HASH.test(task.promptSha256)
      || typeof task.acceptanceId !== 'string' || !ID.test(task.acceptanceId)
      || !count(task.requiredMutationKills) || task.requiredMutationKills < 1
      || !Array.isArray(task.allowedTestPaths) || task.allowedTestPaths.length === 0
      || task.allowedTestPaths.some((p: string) => { try { return normalizeRelativePath(p) !== p; } catch { return true; } })
      || new Set(task.allowedTestPaths).size !== task.allowedTestPaths.length)
      throw new TypeError('INVALID_PILOT_TASK');
    seen.add(task.id);
  }
  // Canonical representation of the validated fields; unknown fields cannot silently alter the contract.
  const normalized: PilotManifest = {
    schemaVersion: 'smart-juicer-pilot-v0.6', cohortId: manifest.cohortId, modelId: manifest.modelId,
    baselineEffort: 'medium', candidateEffort: 'low',
    tasks: manifest.tasks.map(t => ({id:t.id,fixtureCommit:t.fixtureCommit,promptSha256:t.promptSha256,
      acceptanceId:t.acceptanceId, allowedTestPaths:[...t.allowedTestPaths], requiredMutationKills:t.requiredMutationKills}))
  };
  return {manifest:normalized, sha256:hash(JSON.stringify(normalized))};
}
function replay(manifest: PilotManifest, sha256: string, events: readonly PilotEvent[]) {
  const sealed = sealPilotManifest(manifest);
  if (!HASH.test(sha256) || sha256 !== sealed.sha256) throw new TypeError('MANIFEST_HASH_MISMATCH');
  if (!Array.isArray(events) || events.length > manifest.tasks.length * 6) throw new TypeError('EVENT_LIMIT');
  const slots = new Map<string, {status:PilotStatus;usage:PilotUsage|null;verifier:PilotVerifier|null}>();
  for (const task of sealed.manifest.tasks) for (const arm of ['B0', 'B1'] as const) {
    slots.set(`${task.id}:${arm}`, {status:'pending',usage:null,verifier:null});
  }
  let previousHash = sha256;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const {eventHash, ...unsigned} = event;
    if (event.sequence !== i + 1 || event.previousHash !== previousHash
      || eventHash !== hash(JSON.stringify(unsigned))) throw new TypeError('INVALID_EVENT_CHAIN');
    const slot = slots.get(`${event.taskId}:${event.arm}`);
    if (!slot) throw new TypeError('UNREGISTERED_RUN');
    if (!(slot.status === 'pending' && event.status === 'running')
      && !(slot.status === 'running' && ['completed','failed','timeout','crashed'].includes(event.status)))
      throw new TypeError('ILLEGAL_RUN_TRANSITION');
    if (event.status === 'running' && (event.usage != null || event.verifier != null)) throw new TypeError('EARLY_VERIFIER_OR_USAGE');
    if (event.usage != null) {
      if (!['responses','chat_completions','codex_jsonl','anthropic_messages'].includes(event.usage.source)
        || !count(event.usage.inputTokens) || !count(event.usage.outputTokens)
        || event.usage.totalTokens !== event.usage.inputTokens + event.usage.outputTokens
        || (event.usage.cachedInputTokens !== null && (!count(event.usage.cachedInputTokens) || event.usage.cachedInputTokens > event.usage.inputTokens))
        || (event.usage.reasoningTokens !== null && (!count(event.usage.reasoningTokens) || event.usage.reasoningTokens > event.usage.outputTokens)))
        throw new TypeError('INVALID_EVENT_USAGE');
    }
    if (event.verifier != null && (event.verifier.source !== 'external_verifier'
      || typeof event.verifier.accepted !== 'boolean' || typeof event.verifier.evidenceId !== 'string'
      || !ID.test(event.verifier.evidenceId) || !count(event.verifier.mutationKills))) throw new TypeError('INVALID_VERIFIER');
    slot.status = event.status;
    slot.usage = event.usage ?? null;
    slot.verifier = event.verifier ?? null;
    previousHash = eventHash;
  }
  return slots;
}
/** Build the next hash-chained journal entry. Persist and fsync before acting on it. */
export function nextPilotEvent(manifest: PilotManifest, sha256: string, events: readonly PilotEvent[], input: PilotEventInput): PilotEvent {
  replay(manifest, sha256, events);
  const event = {
    taskId: input.taskId, arm: input.arm, status: input.status,
    ...(input.usage !== undefined ? {usage:input.usage} : {}),
    ...(input.verifier !== undefined ? {verifier:input.verifier} : {}),
    sequence:events.length + 1, previousHash:events.at(-1)?.eventHash ?? sha256
  };
  const stamped = Object.freeze({...event, eventHash:hash(JSON.stringify(event))});
  replay(manifest, sha256, [...events,stamped]);
  return stamped;
}
/** Intention-to-treat over the entire assigned cohort. Not an inferential quality claim. */
export function evaluatePilot(manifest: PilotManifest, sha256: string, events: readonly PilotEvent[]): PilotReport {
  const slots = replay(manifest, sha256, events);
  const arms = {} as Record<PilotArm, PilotArmReport>;
  let bothAcceptedPairs = 0;
  const warnings: string[] = [];
  const passes = (task: PilotTask, arm: PilotArm): boolean => {
    const s = slots.get(`${task.id}:${arm}`)!;
    return s.status === 'completed' && s.verifier?.accepted === true
      && s.verifier.mutationKills >= task.requiredMutationKills;
  };
  let n10 = 0, n01 = 0, n00 = 0;
  for (const task of manifest.tasks) {
    const baseline = passes(task,'B0');
    const candidate = passes(task,'B1');
    if (baseline && candidate) bothAcceptedPairs++;
    else if (baseline) n10++;
    else if (candidate) n01++;
    else n00++;
  }
  const contingency: PairedContingencyTable = {
    bothAccepted_n11: bothAcceptedPairs, b0OnlyAccepted_n10: n10,
    b1OnlyAccepted_n01: n01, neitherAccepted_n00: n00
  };
  for (const arm of ['B0','B1'] as const) {
    const records = manifest.tasks.map(task => slots.get(`${task.id}:${arm}`)!);
    const statuses: Record<PilotStatus,number> = {pending:0,running:0,completed:0,failed:0,timeout:0,crashed:0};
    records.forEach(x => { statuses[x.status]++; });
    const accepted = manifest.tasks.filter(task => passes(task,arm)).length;
    const missingUsage = records.filter(r => r.usage === null).length;
    const total = records.reduce((n,r) => n+(r.usage?.totalTokens ?? 0),0);
    const totalTokens = missingUsage === 0 && Number.isSafeInteger(total) ? total : null;
    arms[arm] = {assigned:records.length,accepted,acceptanceRate:accepted/records.length,
      statuses,usageComplete:totalTokens !== null,missingUsage,totalTokens,
      tokensPerAccepted:totalTokens !== null && accepted > 0 ? totalTokens/accepted : null};
    if (missingUsage) warnings.push(`${arm}_UNKNOWN_USAGE_${missingUsage}`);
    if (statuses.pending || statuses.running) warnings.push(`${arm}_UNFINISHED_${statuses.pending+statuses.running}`);
  }
  const b0 = arms.B0.totalTokens, b1 = arms.B1.totalTokens;
  const claimedSavingsPercent = b0 !== null && b1 !== null && b0 > 0
    ? (1-b1/b0)*100 : null;
  if (claimedSavingsPercent === null) warnings.push('TOKEN_SAVINGS_UNKNOWN');
  warnings.push('NO_STATISTICAL_NON_INFERIORITY_INFERENCE','UNVERIFIED_IMPORTED_QUALITY_AND_USAGE');
  return {schemaVersion:'smart-juicer-pilot-report-v0.6',manifestSha256:sha256,
    assignedPairs:manifest.tasks.length,arms,acceptedDifferenceB1MinusB0:arms.B1.acceptanceRate-arms.B0.acceptanceRate,
    bothAcceptedPairs,contingency,claimedSavingsPercent,nonInferiorityEstablished:false,
    safeForAutomaticRouting:false,evidenceLevel:'IMPORTED_UNVERIFIED',warnings};
}
