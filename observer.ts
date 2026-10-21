import { normalizeRelativePath, isPathSensitive } from './path-policy.ts';

/** Smart Juicer V0.1 – deterministic, pure, local observation only.
 * NO agent execution, NO model selection, NO file I/O, NO network and NO logging.
 * A caller cannot grant permissions by putting policy text in an untrusted prompt.
 */

export type Risk = 'LOW' | 'GUARDED' | 'CRITICAL' | 'UNKNOWN';
export type Domain = 'routine' | 'ui' | 'development' | 'database' | 'security' | 'deployment' | 'documentation' | 'research';
export type Uncertainty = 'LOW' | 'MEDIUM' | 'HIGH';
export type AdviceAction = 'KEEP_NATIVE_DEFAULT' | 'CANDIDATE_PROFILE' | 'REVIEW_REQUIRED';
export type Profile = 'sparsam' | 'standard' | 'expert';

export interface TaskInput {
  schema_version: 'v0.1';
  originalPrompt: string;
  sourceTrust: 'user_direct';
  fileMetadata?: { totalCount?: number; extensions?: string[]; changedRelativePaths?: string[] };
  repoSignals?: { gitDirty?: boolean; sensitivePathsTouched?: boolean; testsPresent?: boolean };
}

/** Trusted policy comes from the host, never from TaskInput. */
export interface TrustedPolicy {
  readonly allowProfileSuggestion: boolean;
  readonly prohibitAutomaticExecution: true;
  readonly requireReviewForGuarded: boolean;
  readonly maxPromptLength: number;
}

export interface Observation {
  schema_version: 'v0.1';
  domains: Domain[];
  risk_level: Risk;
  required_capabilities: string[];
  uncertainty: Uncertainty;
  reason_codes: string[];
  source_evidence_summary: { file_count_known: boolean; reported_file_count: number | null; extensions_count: number; relative_path_count: number; git_state_known: boolean };
  review_required: boolean;
  policy_gate_state: 'PASS_FOR_ADVICE_ONLY' | 'REVIEW_REQUIRED';
  routing_advice: { action: AdviceAction; profile: Profile | null; model_id: null; auto_execute: false };
}

/** Conservative defaults. No user-prompt text can override these. */
export const DEFAULT_POLICY: TrustedPolicy = Object.freeze({
  allowProfileSuggestion: true,
  prohibitAutomaticExecution: true,
  requireReviewForGuarded: true,
  maxPromptLength: 12000
});

const DOMAIN_PATTERNS: readonly [Domain, RegExp][] = [
  ['ui', /\b(?:ui|ux|css|html|button|layout|color|colour|frontend|style|design|screen|responsive|farbe|oberfl[aä]che|schaltfl[aä]che|ansicht|darstellung)\b/i],
  ['database', /\b(?:database|db|sql|postgres|sqlite|mysql|schema|migration|migrate|migrat(?:ion|e|ing)|datenbank|tabelle|tabellen|spalte|spalten)\b/i],
  ['security', /\b(?:auth(?:entication|orization)?|oauth|login|password|passwort|secret|credential|permissions?|berechtigung(?:en)?|sicherheit|security|token|2fa|mfa|anmeld(?:ung|en)?)\b/i],
  ['deployment', /\b(?:deploy(?:ment)?|production|prod(?:uction)?|release|publish|publizieren|ver[oö]ffentlich(?:en|ung)|ausrollen|bereitstellen)\b/i],
  ['documentation', /\b(?:readme|docs?|documentation|documentation|dokumentation|kommentar|comments?|beschreibung|text|schreiben)\b/i],
  ['research', /\b(?:research|recherche|untersuch(?:en|ung)|vergleich(?:en)?|analyse|analysis)\b/i],
  ['development', /\b(?:code|funktion|function|typescript|javascript|python|api|backend|implement(?:ieren|ation)|refactor|bug|fehler|test|fix|entwick(?:eln|lung))\b/i]
];

const CRITICAL_PATTERNS: readonly [string, RegExp][] = [
  ['AUTH_OR_ACCESS', /\b(?:auth(?:entication|orization)?|oauth|login|password|passwort|2fa|mfa|access[ -]?control|permissions?|berechtigung(?:en)?|anmeld(?:ung|en)?|passwort[ -]?zur[uü]ckset(?:zen|zung))\b/i],
  ['SECRETS_OR_KEYS', /\b(?:secret|secrets|credential|credentials|api[ -]?key|access[ -]?token|private[ -]?key|schl[uü]ssel|geheimnis|\.env)\b/i],
  ['PAYMENT', /\b(?:payment|payments|billing|invoice|bezahl(?:en|ung)|zahlung(?:en)?|abrechnung|stripe)\b/i],
  ['DATABASE_CHANGE', /\b(?:migration|migrate|migrat(?:e|ion|ing)|datenbank(?:migration)?|database|db[ -]?schema|schema|drop[ -]?table|spalte(?:n)?|tabellen?)\b/i],
  ['DESTRUCTIVE', /\b(?:delete|deletion|destroy|erase|remove[ -]?all|drop|truncate|rm[ ]+-rf|l[oö]sch(?:en|ung|e)|entfern(?:en|ung)|vernicht(?:en|ung))\b/i],
  ['DEPLOY_OR_PUBLISH', /\b(?:deploy(?:ment)?|production|prod(?:uction)?|release|publish|publizieren|ver[oö]ffentlich(?:en|ung)|ausrollen)\b/i],
  ['PERSONAL_DATA', /\b(?:personal[ -]?data|gdpr|dsgvo|personenbezogen(?:e|en|er)?|kundendaten|user[ -]?data|nutzerdateien)\b/i],
  ['PRIVILEGE_CHANGE', /\b(?:sudo|admin[ -]?rights|sandbox|firewall|privilege|root[ -]?access|zugriffsrecht(?:e)?|systemrechte)\b/i],
  // Conservative *positive* signals only; the absence of a match cannot establish safety.
  ['ACCOUNT_DESTRUCTION', /\b(?:wipe|purge|destroy|disable|erase|remove|vernicht(?:en|ung)|sperr(?:en|ung))\b.{0,70}\b(?:accounts?|users?|users?\s+records?|nutzerkonten|benutzerkonten)\b|\b(?:accounts?|nutzerkonten|benutzerkonten)\b.{0,70}\b(?:wipe|purge|destroy|erase|l[oö]sch(?:en|ung))\b/i],
  ['EXFILTRATION', /\b(?:exfiltrat(?:e|ion)|steal|leak|send\s+out|extract|abgreifen|ausschleus(?:en|ung))\b|\b(?:ssh[ -]?key|privat(?:er|en)?[ -]?schl[uü]ssel)\b/i],
  ['AUDIT_TAMPERING', /\b(?:disable|turn off|suppress|erase|delete|deaktivier(?:en|ung)|abschalten|unterdr[uü]ck(?:en|ung))\b.{0,70}\b(?:audit[ -]?logs?|protokollier(?:ung|en)?|security[ -]?logs?)\b/i],
  ['GRANT_PRIVILEGES', /\b(?:grant|give|assign|gew[aä]hr(?:en|ung)|erteil(?:en|ung)|vergib|verleihe)\b.{0,70}\b(?:root|admin|privileges?|sudo|rechte|berechtigung(?:en)?)\b/i],
  ['FUNDS_TRANSFER', /\b(?:transfer|wire|geld[ -]?senden|auszahl(?:en|ung))\b.{0,70}\b(?:funds?|money|credit|guthaben|geld|euro|eur)\b|\b(?:funds?|guthaben|geld)\b.{0,50}\b(?:transfer|auszahl(?:en|ung))\b|[uü]berweis(?:e|en|ung|t)[ ]+(?:guthaben|geld|euro|eur)/i]
];

// Sensitive file names are classified by path-policy.ts; no partial regex gate.
const NEGATION_PATTERN = /\b(?:nicht|kein(?:e|en|er|es)?|never|not|without|ohne|unless|except|au[sß]er)\b/i;
const INJECTION_PATTERN = /\b(?:ignore (?:all |any )?(?:previous|prior|above)|ignoriere (?:alle |bisherige |vorherige )?(?:regeln|anweisungen)|bypass (?:security|policy)|override (?:safety|policy))\b/i;
const MIXED_SCOPE = /\b(?:und|and|plus|zus[aä]tzlich|also|gleichzeitig)\b/i;
const MAX_FILES = 1000000;
const MAX_PATHS = 200;
const MAX_EXTENSIONS = 50;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function boolOrAbsent(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}
function safeString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && !value.includes('\0');
}
function validPath(p: unknown): p is string {
  if (!safeString(p, 300) || !p) return false;
  try { normalizeRelativePath(p); return true; } catch { return false; }
}
function validExtension(x: unknown): x is string {
  return typeof x === 'string' && /^\.[a-zA-Z0-9]{1,12}$/.test(x);
}
function uniqueSort<T extends string>(items: T[]): T[] { return [...new Set(items)].sort(); }

/** Runtime validation is mandatory even with TypeScript callers. Never echo private input in errors. */
export function parseTaskInput(input: unknown, maxPromptLength = DEFAULT_POLICY.maxPromptLength): TaskInput {
  if (!record(input) || input.schema_version !== 'v0.1' || input.sourceTrust !== 'user_direct' ||
      !safeString(input.originalPrompt, maxPromptLength) || !input.originalPrompt.trim()) {
    throw new TypeError('INVALID_TASK_INPUT');
  }
  const allowedTop = new Set(['schema_version', 'sourceTrust', 'originalPrompt', 'fileMetadata', 'repoSignals']);
  if (Object.keys(input).some(k => !allowedTop.has(k))) throw new TypeError('UNEXPECTED_INPUT_FIELD');
  const file = input.fileMetadata;
  if (file !== undefined) {
    if (!record(file) || Object.keys(file).some(k => !['totalCount','extensions','changedRelativePaths'].includes(k))) throw new TypeError('INVALID_FILE_METADATA');
    if (file.totalCount !== undefined && (!Number.isSafeInteger(file.totalCount) || (file.totalCount as number) < 0 || (file.totalCount as number) > MAX_FILES)) throw new TypeError('INVALID_FILE_COUNT');
    if (file.extensions !== undefined && (!Array.isArray(file.extensions) || file.extensions.length > MAX_EXTENSIONS || !file.extensions.every(validExtension))) throw new TypeError('INVALID_EXTENSIONS');
    if (file.changedRelativePaths !== undefined && (!Array.isArray(file.changedRelativePaths) || file.changedRelativePaths.length > MAX_PATHS || !file.changedRelativePaths.every(validPath))) throw new TypeError('INVALID_PATHS');
  }
  const repo = input.repoSignals;
  if (repo !== undefined) {
    if (!record(repo) || Object.keys(repo).some(k => !['gitDirty','sensitivePathsTouched','testsPresent'].includes(k)) ||
        !boolOrAbsent(repo.gitDirty) || !boolOrAbsent(repo.sensitivePathsTouched) || !boolOrAbsent(repo.testsPresent)) throw new TypeError('INVALID_REPO_SIGNALS');
  }
  return input as unknown as TaskInput;
}

function parsePolicy(policy: TrustedPolicy): TrustedPolicy {
  if (!record(policy) || policy.prohibitAutomaticExecution !== true || typeof policy.allowProfileSuggestion !== 'boolean' ||
      typeof policy.requireReviewForGuarded !== 'boolean' || !Number.isSafeInteger(policy.maxPromptLength) || policy.maxPromptLength < 1 || policy.maxPromptLength > 12000) {
    throw new TypeError('INVALID_TRUSTED_POLICY');
  }
  return policy;
}

/** Return deterministic risk-advice; never performs any requested action. */
export function observeTask(raw: unknown, policy: TrustedPolicy = DEFAULT_POLICY): Observation {
  const trusted = parsePolicy(policy);
  const input = parseTaskInput(raw, trusted.maxPromptLength);
  const normalized = input.originalPrompt.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const file = input.fileMetadata;
  const repo = input.repoSignals;
  const reasons: string[] = [];
  const domains: Domain[] = [];
  const capabilities: string[] = [];
  for (const [domain, expression] of DOMAIN_PATTERNS) {
    if (expression.test(normalized)) domains.push(domain);
  }
  if (domains.length === 0) domains.push('routine');
  if (domains.includes('ui')) capabilities.push('frontend');
  if (domains.includes('development') || domains.includes('database') || domains.includes('security')) capabilities.push('coding');
  if (domains.includes('database')) capabilities.push('database_review');
  if (domains.includes('security')) capabilities.push('security_review');
  if (domains.includes('deployment')) capabilities.push('release_review');
  for (const [code, expression] of CRITICAL_PATTERNS) {
    if (expression.test(normalized)) reasons.push(code);
  }
  const paths = (file?.changedRelativePaths ?? []).map(normalizeRelativePath);
  const sensitivePath = paths.some(isPathSensitive);
  if (sensitivePath || repo?.sensitivePathsTouched === true) reasons.push('SENSITIVE_PATH');
  if (INJECTION_PATTERN.test(normalized)) reasons.push('UNTRUSTED_INSTRUCTION_PATTERN');
  if (NEGATION_PATTERN.test(normalized)) reasons.push('NEGATION_OR_EXCEPTION');
  // A connector may combine an innocuous request with an *unrecognized* dangerous subtask.
  if (MIXED_SCOPE.test(normalized)) reasons.push('MULTI_CLAUSE_UNVERIFIED');
  if (repo?.gitDirty === true) reasons.push('DIRTY_WORKTREE');
  const metadataMissing = file?.totalCount === undefined || file.changedRelativePaths === undefined || repo?.gitDirty === undefined;
  if (metadataMissing) reasons.push('INCOMPLETE_METADATA');
  const metadataContradiction = (file?.totalCount === 0 && paths.length > 0) || (file?.totalCount !== undefined && paths.length > file.totalCount) ||
    (repo?.sensitivePathsTouched === false && sensitivePath);
  if (metadataContradiction) reasons.push('CONFLICTING_METADATA');
  const critical = reasons.some(r => ['AUTH_OR_ACCESS','SECRETS_OR_KEYS','PAYMENT','DATABASE_CHANGE','DESTRUCTIVE','DEPLOY_OR_PUBLISH','PERSONAL_DATA','PRIVILEGE_CHANGE','SENSITIVE_PATH','UNTRUSTED_INSTRUCTION_PATTERN','ACCOUNT_DESTRUCTION','EXFILTRATION','AUDIT_TAMPERING','GRANT_PRIVILEGES','FUNDS_TRANSFER'].includes(r));
  // V0.1 receives self-declared JSON, not authenticated repo evidence.
  // No regex whitelist or filename suffix can establish a safe low-risk scope.
  // Keep LOW / CANDIDATE_PROFILE in the versioned schema for a later reviewed collector,
  // but do not emit them from this standalone unverified observer.
  reasons.push('PROTOTYPE_NO_MODEL_MAPPING');
  if (!critical) reasons.push('UNVERIFIED_SCOPE_NO_LOW_ADVICE');
  let risk: Risk;
  if (critical) risk = 'CRITICAL';
  else if (metadataContradiction || metadataMissing || reasons.includes('NEGATION_OR_EXCEPTION') ||
           reasons.includes('MULTI_CLAUSE_UNVERIFIED')) risk = 'UNKNOWN';
  else risk = 'GUARDED';
  if (risk === 'UNKNOWN' && !reasons.includes('CONFLICTING_METADATA') && !reasons.includes('INCOMPLETE_METADATA')) {
    reasons.push('INSUFFICIENT_EVIDENCE');
  }
  const review = risk === 'CRITICAL' || risk === 'UNKNOWN' || (risk === 'GUARDED' && trusted.requireReviewForGuarded);
  const action: AdviceAction = review ? 'REVIEW_REQUIRED' : 'KEEP_NATIVE_DEFAULT';
  return {
    schema_version: 'v0.1',
    domains: uniqueSort(domains),
    risk_level: risk,
    required_capabilities: uniqueSort(capabilities),
    uncertainty: (risk === 'UNKNOWN' || metadataMissing || metadataContradiction) ? 'HIGH' : (risk === 'GUARDED' || reasons.includes('MULTI_CLAUSE_UNVERIFIED')) ? 'MEDIUM' : 'LOW',
    reason_codes: uniqueSort(reasons),
    source_evidence_summary: { file_count_known: file?.totalCount !== undefined, reported_file_count: file?.totalCount ?? null, extensions_count: file?.extensions?.length ?? 0, relative_path_count: paths.length, git_state_known: repo?.gitDirty !== undefined },
    review_required: review,
    policy_gate_state: review ? 'REVIEW_REQUIRED' : 'PASS_FOR_ADVICE_ONLY',
    routing_advice: { action, profile: null, model_id: null, auto_execute: false }
  };
}
