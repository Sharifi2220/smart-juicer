/**
 * Smart Juicer V0.2 passive Shadow Mode.
 *
 * This module only evaluates metadata that a user explicitly imports or
 * synthetic fixtures supplied by the project. It never starts Codex, reads a
 * live session, stores prompts, prints raw events, changes Codex config, or
 * selects a model.
 */
import { readFileSync, statSync } from 'node:fs';
import { codexDoctor } from './codex-wrapper.ts';

export const SHADOW_SCHEMA_VERSION = 'v0.2-shadow' as const;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_LINES = 10000;

export type ShadowSource = 'synthetic' | 'codex_exec_jsonl' | 'codex_app_server' | 'usage_json';
export type ShadowQuality = 'PASS' | 'FAIL' | 'UNKNOWN';
export type ShadowStatus = 'completed' | 'failed' | 'interrupted' | 'unknown';
export type ShadowRecommendationAction = 'OBSERVE_ONLY' | 'KEEP_NATIVE_DEFAULT' | 'REVIEW_REQUIRED';

export interface ShadowRecord {
  readonly id: string;
  readonly source: ShadowSource;
  readonly model: string | null;
  readonly thinkingEffort: string | null;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly durationMs: number | null;
  readonly failedAttempts: number | null;
  readonly qualityStatus: ShadowQuality;
  readonly status: ShadowStatus;
  readonly observedAt: string | null;
  readonly noteCodes: readonly string[];
}

export interface ShadowSummary {
  readonly schema_version: typeof SHADOW_SCHEMA_VERSION;
  readonly mode: 'PASSIVE_SHADOW';
  readonly records: number;
  readonly statuses: { completed: number; failed: number; interrupted: number; unknown: number };
  readonly quality: { pass: number; fail: number; unknown: number };
  readonly usage: {
    completeRecords: number;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    durationMs: number | null;
    failedAttempts: number | null;
  };
  readonly observed: {
    model: string | null;
    thinkingEffort: string | null;
    sourceKinds: readonly ShadowSource[];
  };
  readonly recommendation: {
    action: ShadowRecommendationAction;
    suggestedModel: null;
    suggestedThinkingEffort: string | null;
    autoApply: false;
    reason: string;
  };
  readonly nativeCodex: {
    cliVersion: string | null;
    invocation: 'codex exec --json -';
    model: 'UNKNOWN';
    thinkingEffort: 'UNKNOWN';
    sandbox: 'UNKNOWN';
    configChanged: false;
    inferenceCalled: false;
  };
}

interface RecordLike {
  readonly [key: string]: unknown;
}

interface EventAccumulator {
  id: string;
  source: ShadowSource;
  model: string | null;
  thinkingEffort: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  failedAttempts: number | null;
  qualityStatus: ShadowQuality;
  status: ShadowStatus;
  observedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sawFailure: boolean;
  sawCompletion: boolean;
  notes: Set<string>;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
}

function nonNegativeIntegerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function requireCount(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  const parsed = nonNegativeIntegerOrNull(value);
  if (parsed === null) throw new TypeError(`INVALID_SHADOW_${field.toUpperCase()}`);
  return parsed;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = stringOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function pickRecord(...values: unknown[]): RecordLike | null {
  return values.find(isRecord) ?? null;
}

function valueAt(record: RecordLike | null, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) if (key in record) return record[key];
  return undefined;
}

function parseQuality(value: unknown, accepted: unknown): ShadowQuality {
  if (value === 'PASS' || value === 'pass' || value === 'accepted') return 'PASS';
  if (value === 'FAIL' || value === 'fail' || value === 'rejected') return 'FAIL';
  if (typeof accepted === 'boolean') return accepted ? 'PASS' : 'FAIL';
  return 'UNKNOWN';
}

function parseStatus(value: unknown, type = ''): ShadowStatus {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  const combined = `${type.toLowerCase()} ${normalized}`;
  if (combined.includes('interrupt')) return 'interrupted';
  if (combined.includes('fail') || combined.includes('error')) return 'failed';
  if (combined.includes('complete') || normalized === 'success' || normalized === 'succeeded') return 'completed';
  return 'unknown';
}

function timestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationBetween(start: string | null, end: string | null): number | null {
  const startMs = timestampMs(start);
  const endMs = timestampMs(end);
  return startMs !== null && endMs !== null && endMs >= startMs ? endMs - startMs : null;
}

function usageFrom(record: RecordLike | null): { input: number | null; cached: number | null; output: number | null } {
  const details = pickRecord(valueAt(record, 'input_tokens_details', 'inputTokensDetails'));
  return {
    input: requireCount(valueAt(record, 'input_tokens', 'inputTokens'), 'INPUT_TOKENS'),
    cached: requireCount(valueAt(record, 'cached_input_tokens', 'cachedInputTokens', 'cache_read_input_tokens', 'cacheReadInputTokens') ?? valueAt(details, 'cached_tokens', 'cachedTokens'), 'CACHED_INPUT_TOKENS'),
    output: requireCount(valueAt(record, 'output_tokens', 'outputTokens'), 'OUTPUT_TOKENS')
  };
}

function mergeUsage(acc: EventAccumulator, usage: RecordLike | null): void {
  if (!usage) return;
  const parsed = usageFrom(usage);
  if (parsed.input !== null) acc.inputTokens = parsed.input;
  if (parsed.cached !== null) acc.cachedInputTokens = parsed.cached;
  if (parsed.output !== null) acc.outputTokens = parsed.output;
}

function assertRecordShape(value: unknown, label: string): asserts value is RecordLike {
  if (!isRecord(value)) throw new TypeError(`INVALID_SHADOW_${label}`);
}

function normalizedRecord(raw: RecordLike, index: number, source: ShadowSource): ShadowRecord {
  const id = stringOrNull(raw.id) ?? stringOrNull(raw.turnId) ?? `shadow-${index + 1}`;
  const model = stringOrNull(raw.model);
  const thinkingEffort = pickString(raw.thinkingEffort, raw.reasoning_effort, raw.reasoningEffort);
  const usage = pickRecord(raw.usage);
  const inputTokens = requireCount(raw.inputTokens ?? raw.input_tokens ?? valueAt(usage, 'input_tokens', 'inputTokens'), 'INPUT_TOKENS');
  const cachedInputTokens = requireCount(raw.cachedInputTokens ?? raw.cached_input_tokens ?? valueAt(usage, 'cached_input_tokens', 'cachedInputTokens'), 'CACHED_INPUT_TOKENS');
  const outputTokens = requireCount(raw.outputTokens ?? raw.output_tokens ?? valueAt(usage, 'output_tokens', 'outputTokens'), 'OUTPUT_TOKENS');
  if (cachedInputTokens !== null && inputTokens !== null && cachedInputTokens > inputTokens) throw new TypeError('INVALID_SHADOW_CACHED_INPUT_TOKENS');
  const durationMs = requireCount(raw.durationMs ?? raw.duration_ms, 'DURATION_MS');
  const failedAttempts = requireCount(raw.failedAttempts ?? raw.failed_attempts ?? raw.attemptsFailed, 'FAILED_ATTEMPTS');
  const qualityStatus = parseQuality(raw.qualityStatus ?? raw.quality_status, raw.accepted);
  const status = parseStatus(raw.status, typeof raw.type === 'string' ? raw.type : '');
  const observedAt = stringOrNull(raw.observedAt ?? raw.observed_at ?? raw.completedAt ?? raw.completed_at);
  const noteCodes: string[] = [];
  if (model === null) noteCodes.push('MODEL_UNKNOWN');
  if (thinkingEffort === null) noteCodes.push('THINKING_EFFORT_UNKNOWN');
  if (inputTokens === null || outputTokens === null) noteCodes.push('USAGE_INCOMPLETE');
  if (cachedInputTokens === null) noteCodes.push('CACHED_TOKENS_UNKNOWN');
  if (durationMs === null) noteCodes.push('DURATION_UNKNOWN');
  if (qualityStatus === 'UNKNOWN') noteCodes.push('QUALITY_UNKNOWN');
  return Object.freeze({id,source,model,thinkingEffort,inputTokens,cachedInputTokens,outputTokens,durationMs,failedAttempts,qualityStatus,status,observedAt,noteCodes});
}

/** Parse metadata records from a deliberately explicit, user-imported JSON document. */
export function parseImportedUsageData(raw: unknown): ShadowRecord[] {
  assertRecordShape(raw, 'DOCUMENT');
  if (raw.schema_version !== SHADOW_SCHEMA_VERSION || raw.sourceTrust !== 'explicit_user_import' || raw.privacyMode !== 'metadata_only' || !Array.isArray(raw.records)) {
    throw new TypeError('INVALID_SHADOW_IMPORT_CONTRACT');
  }
  if (raw.records.length > MAX_IMPORT_LINES) throw new TypeError('SHADOW_IMPORT_TOO_MANY_RECORDS');
  return raw.records.map((value, index) => {
    assertRecordShape(value, 'RECORD');
    return normalizedRecord(value, index, 'usage_json');
  });
}

function eventType(event: RecordLike): string {
  const params = pickRecord(event.params);
  return pickString(event.type, event.method, event.event_type, event.eventType, valueAt(params, 'type', 'method', 'event_type', 'eventType')) ?? '';
}

function normalizedEventType(type: string): string {
  return type.toLowerCase().replace(/[._-]+/g, '/');
}

function isThreadLifecycleType(type: string): boolean {
  return normalizedEventType(type).startsWith('thread/');
}

function isTurnLifecycleType(type: string): boolean {
  return normalizedEventType(type).startsWith('turn/');
}

function isTurnStartedType(type: string): boolean {
  return normalizedEventType(type) === 'turn/started';
}

function isTurnTerminalType(type: string): boolean {
  const normalized = normalizedEventType(type);
  return normalized === 'turn/completed' || normalized === 'turn/failed' || normalized === 'turn/interrupted' || normalized === 'turn/error';
}

function explicitTurnId(event: RecordLike): string | null {
  const payload = pickRecord(event.params) ?? event;
  const turn = pickRecord(payload.turn);
  return pickString(payload.turn_id, payload.turnId, valueAt(turn, 'id'), event.turn_id, event.turnId, valueAt(pickRecord(event.turn), 'id'));
}

function newAccumulator(id: string, source: ShadowSource): EventAccumulator {
  return {id,source,model:null,thinkingEffort:null,inputTokens:null,cachedInputTokens:null,outputTokens:null,durationMs:null,failedAttempts:null,qualityStatus:'UNKNOWN',status:'unknown',observedAt:null,startedAt:null,completedAt:null,sawFailure:false,sawCompletion:false,notes:new Set()};
}

function updateAccumulator(acc: EventAccumulator, event: RecordLike): void {
  const payload = pickRecord(event.params) ?? event;
  const type = eventType(event);
  const turnLifecycle = isTurnLifecycleType(type);
  const turnTerminal = isTurnTerminalType(type);
  const turn = pickRecord(payload.turn);
  const item = pickRecord(payload.item);
  const usage = pickRecord(payload.usage, valueAt(turn, 'usage'), valueAt(item, 'usage'));
  acc.model = pickString(acc.model, payload.model, valueAt(turn, 'model'), valueAt(item, 'model'));
  acc.thinkingEffort = pickString(acc.thinkingEffort, payload.thinking_effort, payload.thinkingEffort, payload.reasoning_effort, payload.reasoningEffort, valueAt(turn, 'thinking_effort', 'thinkingEffort', 'reasoning_effort', 'reasoningEffort'));
  mergeUsage(acc, usage);
  // Item lifecycle events describe parts of a turn. They must not turn an
  // otherwise incomplete turn into a successful/completed turn.
  // Only terminal turn events establish the final turn status. In
  // particular, a contradictory status field on turn.started is metadata,
  // not evidence that the turn completed.
  const status = turnTerminal ? parseStatus(valueAt(payload, 'status') ?? valueAt(turn, 'status'), type) : 'unknown';
  if (turnTerminal && status !== 'unknown') acc.status = status;
  if (turnTerminal && status === 'failed') { acc.failedAttempts = (acc.failedAttempts ?? 0) + 1; acc.sawFailure = true; }
  if (turnTerminal && status === 'completed') acc.sawCompletion = true;
  const quality = turnTerminal
    ? parseQuality(payload.quality_status ?? payload.qualityStatus ?? valueAt(turn, 'quality_status', 'qualityStatus'), payload.accepted ?? valueAt(turn, 'accepted'))
    : 'UNKNOWN';
  if (quality !== 'UNKNOWN') acc.qualityStatus = quality;
  const start = pickString(payload.started_at, payload.startedAt, valueAt(turn, 'started_at', 'startedAt'));
  const end = pickString(payload.completed_at, payload.completedAt, valueAt(turn, 'completed_at', 'completedAt'));
  if (start !== null) acc.startedAt = start;
  if (end !== null) acc.completedAt = end;
  acc.observedAt = end ?? acc.observedAt ?? start;
  const explicitDuration = requireCount(payload.duration_ms ?? payload.durationMs ?? valueAt(turn, 'duration_ms', 'durationMs'), 'DURATION_MS');
  if (explicitDuration !== null) acc.durationMs = explicitDuration;
  else acc.durationMs = durationBetween(acc.startedAt, acc.completedAt);
  if (type.includes('failed') || type.includes('error')) acc.notes.add('FAILED_EVENT_OBSERVED');
  if (turnTerminal && usage === null) acc.notes.add('COMPLETION_USAGE_MISSING');
}

function finishAccumulator(acc: EventAccumulator): ShadowRecord {
  const failedAttempts = acc.failedAttempts;
  const noteCodes = [...acc.notes];
  if (acc.model === null) noteCodes.push('MODEL_UNKNOWN');
  if (acc.thinkingEffort === null) noteCodes.push('THINKING_EFFORT_UNKNOWN');
  if (acc.inputTokens === null || acc.outputTokens === null) noteCodes.push('USAGE_INCOMPLETE');
  if (acc.cachedInputTokens === null) noteCodes.push('CACHED_TOKENS_UNKNOWN');
  if (acc.durationMs === null) noteCodes.push('DURATION_UNKNOWN');
  if (acc.qualityStatus === 'UNKNOWN') noteCodes.push('QUALITY_UNKNOWN');
  if (acc.cachedInputTokens !== null && acc.inputTokens !== null && acc.cachedInputTokens > acc.inputTokens) throw new TypeError('INVALID_SHADOW_CACHED_INPUT_TOKENS');
  return Object.freeze({id:acc.id,source:acc.source,model:acc.model,thinkingEffort:acc.thinkingEffort,inputTokens:acc.inputTokens,cachedInputTokens:acc.cachedInputTokens,outputTokens:acc.outputTokens,durationMs:acc.durationMs,failedAttempts,qualityStatus:acc.qualityStatus,status:acc.status,observedAt:acc.observedAt,noteCodes:[...new Set(noteCodes)]});
}

/** Parse a user-supplied JSONL event export without retaining or returning event text. */
export function parseCodexJsonl(text: string, source: Exclude<ShadowSource, 'synthetic' | 'usage_json'> = 'codex_exec_jsonl'): ShadowRecord[] {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) throw new TypeError('SHADOW_IMPORT_TOO_LARGE');
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length > MAX_IMPORT_LINES) throw new TypeError('SHADOW_IMPORT_TOO_MANY_LINES');
  const groups = new Map<string, EventAccumulator>();
  const orderedKeys: string[] = [];
  let activeImplicitKey: string | null = null;
  let implicitTurnNumber = 0;
  const getOrCreate = (key: string, id: string): EventAccumulator => {
    const existing = groups.get(key);
    if (existing) return existing;
    const created = newAccumulator(id, source);
    groups.set(key, created);
    orderedKeys.push(key);
    return created;
  };
  lines.forEach((line, index) => {
    let event: unknown;
    try { event = JSON.parse(line); } catch { throw new TypeError(`INVALID_SHADOW_JSONL_LINE_${index + 1}`); }
    assertRecordShape(event, 'EVENT');
    const type = eventType(event);
    const turnId = explicitTurnId(event);
    if (turnId !== null) {
      const acc = getOrCreate(`explicit:${turnId}`, turnId);
      updateAccumulator(acc, event);
      return;
    }
    // Thread lifecycle notifications do not identify a turn and must not
    // fabricate a record or become a boundary for the active implicit turn.
    if (isThreadLifecycleType(type)) return;
    if (isTurnStartedType(type)) {
      // A new boundary closes an earlier ID-less turn conservatively. Its
      // status/quality remain UNKNOWN when no terminal event was observed.
      activeImplicitKey = `implicit:${++implicitTurnNumber}`;
      const acc = getOrCreate(activeImplicitKey, `implicit-turn-${implicitTurnNumber}`);
      updateAccumulator(acc, event);
      return;
    }
    if (isTurnTerminalType(type)) {
      if (activeImplicitKey === null) {
        activeImplicitKey = `implicit:${++implicitTurnNumber}`;
        getOrCreate(activeImplicitKey, `implicit-turn-${implicitTurnNumber}`);
      }
      updateAccumulator(groups.get(activeImplicitKey) as EventAccumulator, event);
      activeImplicitKey = null;
      return;
    }
    // ID-less item events belong to the currently open turn. A standalone
    // item is ignored rather than fabricated into a successful turn.
    if (activeImplicitKey !== null) updateAccumulator(groups.get(activeImplicitKey) as EventAccumulator, event);
  });
  return orderedKeys.map(key => finishAccumulator(groups.get(key) as EventAccumulator));
}

/** Read only the explicit file named by the user; no live Codex/session discovery occurs. */
export function loadExplicitShadowFile(path: string): ShadowRecord[] {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1000) throw new TypeError('INVALID_SHADOW_FILE_PATH');
  const stats = statSync(path);
  if (!stats.isFile() || stats.size > MAX_IMPORT_BYTES) throw new TypeError('SHADOW_IMPORT_TOO_LARGE');
  const text = readFileSync(path, 'utf8');
  const trimmed = text.trim();
  if (!trimmed) throw new TypeError('EMPTY_SHADOW_IMPORT');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isRecord(parsed) && parsed.schema_version === SHADOW_SCHEMA_VERSION) return parseImportedUsageData(parsed);
    if (Array.isArray(parsed)) return parsed.map((value, index) => { assertRecordShape(value, 'RECORD'); return normalizedRecord(value, index, 'usage_json'); });
  } catch (error) {
    if (error instanceof TypeError) throw error;
  }
  return parseCodexJsonl(text);
}

function dominant(values: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  let winner: string | null = null;
  let count = 0;
  for (const [value, occurrences] of counts) if (occurrences > count) { winner = value; count = occurrences; }
  return winner;
}

function sumKnown(records: readonly ShadowRecord[], field: 'inputTokens' | 'cachedInputTokens' | 'outputTokens' | 'durationMs' | 'failedAttempts'): number | null {
  return records.every(record => record[field] !== null) ? records.reduce((sum, record) => sum + (record[field] ?? 0), 0) : null;
}

export function summarizeShadow(records: readonly ShadowRecord[], native = codexDoctor()): ShadowSummary {
  const statuses = {completed:0,failed:0,interrupted:0,unknown:0};
  const quality = {pass:0,fail:0,unknown:0};
  for (const record of records) { statuses[record.status] += 1; quality[record.qualityStatus.toLowerCase() as 'pass'|'fail'|'unknown'] += 1; }
  const completeRecords = records.filter(record => record.inputTokens !== null && record.outputTokens !== null).length;
  const allQualityPass = records.length > 0 && records.every(record => record.qualityStatus === 'PASS');
  const suggestion = dominant(records.map(record => record.thinkingEffort));
  const reason = records.length === 0
    ? 'NO_IMPORTED_EVENTS'
    : !allQualityPass
      ? 'QUALITY_NOT_FULLY_VERIFIED_KEEP_NATIVE_DEFAULT'
      : completeRecords !== records.length
        ? 'USAGE_INCOMPLETE_KEEP_NATIVE_DEFAULT'
        : 'OBSERVE_ONLY_HUMAN_REVIEW_REQUIRED';
  const action: ShadowRecommendationAction = records.length === 0 ? 'OBSERVE_ONLY' : (!allQualityPass || completeRecords !== records.length ? 'KEEP_NATIVE_DEFAULT' : 'REVIEW_REQUIRED');
  return {schema_version:SHADOW_SCHEMA_VERSION,mode:'PASSIVE_SHADOW',records:records.length,statuses,quality,
    usage:{completeRecords,inputTokens:sumKnown(records,'inputTokens'),cachedInputTokens:sumKnown(records,'cachedInputTokens'),outputTokens:sumKnown(records,'outputTokens'),durationMs:sumKnown(records,'durationMs'),failedAttempts:sumKnown(records,'failedAttempts')},
    observed:{model:dominant(records.map(record => record.model)),thinkingEffort:suggestion,sourceKinds:[...new Set(records.map(record => record.source))]},
    recommendation:{action,suggestedModel:null,suggestedThinkingEffort:suggestion,autoApply:false,reason},
    nativeCodex:{cliVersion:native.version,invocation:'codex exec --json -',model:'UNKNOWN',thinkingEffort:'UNKNOWN',sandbox:'UNKNOWN',configChanged:false,inferenceCalled:false}};
}

export const SYNTHETIC_SHADOW_RECORDS: readonly ShadowRecord[] = Object.freeze([
  normalizedRecord({id:'synthetic-css',model:'gpt-5.6-sol',thinkingEffort:'medium',inputTokens:120,cachedInputTokens:80,outputTokens:20,durationMs:1200,failedAttempts:0,qualityStatus:'PASS',status:'completed'},0,'synthetic'),
  normalizedRecord({id:'synthetic-retry',model:'gpt-5.6-sol',thinkingEffort:'medium',inputTokens:200,cachedInputTokens:100,outputTokens:50,durationMs:2400,failedAttempts:1,qualityStatus:'PASS',status:'completed'},1,'synthetic'),
  normalizedRecord({id:'synthetic-unknown',model:null,thinkingEffort:null,inputTokens:null,cachedInputTokens:null,outputTokens:null,durationMs:null,failedAttempts:null,qualityStatus:'UNKNOWN',status:'unknown'},2,'synthetic')
]);

export function formatShadowReport(summary: ShadowSummary): string {
  const usage = summary.usage;
  return [
    'Smart Juicer V0.2 – passiver Shadow Mode',
    `Datensätze: ${summary.records} | abgeschlossen: ${summary.statuses.completed} | fehlgeschlagen: ${summary.statuses.failed} | Qualität PASS/FAIL/UNKNOWN: ${summary.quality.pass}/${summary.quality.fail}/${summary.quality.unknown}`,
    `Modell beobachtet: ${summary.observed.model ?? 'UNKNOWN'} | Thinking-Effort: ${summary.observed.thinkingEffort ?? 'UNKNOWN'}`,
    `Tokens input/cached/output: ${usage.inputTokens ?? 'UNKNOWN'}/${usage.cachedInputTokens ?? 'UNKNOWN'}/${usage.outputTokens ?? 'UNKNOWN'} | Dauer ms: ${usage.durationMs ?? 'UNKNOWN'} | Fehlversuche: ${usage.failedAttempts ?? 'UNKNOWN'}`,
    `Empfehlung: ${summary.recommendation.action} – ${summary.recommendation.reason}`,
    `Native Codex-Konfiguration: CLI ${summary.nativeCodex.cliVersion ?? 'UNKNOWN'} | Modell/Effort/Sandbox: UNKNOWN/UNKNOWN/UNKNOWN`,
    'Automatische Anwendung: NEIN | Live-Sitzungen/Prompts/Rohprotokolle: NEIN'
  ].join('\n');
}
