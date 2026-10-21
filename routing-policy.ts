/**
 * Smart Juicer experimental evidence-gated model recommendation.
 * PURE: no network, agent execution, file writes or entitlement assumptions.
 * An imported "independent" label is a CLAIM, not independently authenticated proof.
 */
import { observeTask } from './observer.ts';

export const ROUTE_SCHEMA = 'v0.3-route-pilot' as const;
export type RouteClass = 'ui' | 'documentation' | 'development';
export type RouteArm = 'B0' | 'B1';

export interface RouteTrial {
  readonly fixtureId: string;
  readonly taskClass: RouteClass;
  readonly arm: RouteArm;
  readonly modelId: string | null;
  readonly accepted: boolean | null;
  readonly review: 'independent' | 'self_reported' | 'unknown';
  readonly costEur: number | null;
}

export interface RouteInput {
  readonly schema_version: typeof ROUTE_SCHEMA;
  readonly task: unknown;
  readonly candidateModel: string;
  readonly trials: readonly RouteTrial[];
}

export interface RouteResult {
  readonly schema_version: typeof ROUTE_SCHEMA;
  readonly action: 'KEEP_NATIVE_DEFAULT' | 'CANDIDATE_REQUIRES_REVIEW';
  readonly suggestedModel: string | null;
  readonly autoExecute: false;
  readonly modelEntitlementVerified: false;
  readonly independentEvidenceAuthenticated: false;
  readonly taskClass: RouteClass | null;
  readonly risk: string;
  readonly pairedFixtures: number;
  readonly claimedSavingsPercent: number | null;
  readonly reasonCode: string;
}

const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,100}$/;
const CLASSES: readonly string[] = ['ui', 'documentation', 'development'];
const ARMS: readonly string[] = ['B0', 'B1'];
const REVIEWS: readonly string[] = ['independent', 'self_reported', 'unknown'];
const MAX_TRIALS = 10000;
const MIN_PAIRS = 30;
const MIN_REDUCTION = 0.15;

function object(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function parseTrials(raw: unknown): RouteTrial[] {
  if (!Array.isArray(raw) || raw.length > MAX_TRIALS) throw new TypeError('INVALID_ROUTE_TRIALS');
  const seen = new Set<string>();
  return raw.map((item: unknown) => {
    if (!object(item) || typeof item.fixtureId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(item.fixtureId) ||
        !CLASSES.includes(item.taskClass as string) || !ARMS.includes(item.arm as string) ||
        !REVIEWS.includes(item.review as string) ||
        !(item.accepted === null || typeof item.accepted === 'boolean') ||
        !(item.costEur === null || (typeof item.costEur === 'number' && Number.isFinite(item.costEur) && item.costEur >= 0)) ||
        !(item.modelId === null || (typeof item.modelId === 'string' && MODEL_ID.test(item.modelId)))) {
      throw new TypeError('INVALID_ROUTE_TRIAL');
    }
    const key = item.taskClass + ':' + item.fixtureId + ':' + item.arm;
    if (seen.has(key)) throw new TypeError('DUPLICATE_ROUTE_TRIAL');
    seen.add(key);
    return item as unknown as RouteTrial;
  });
}

function result(risk: string, taskClass: RouteClass | null, reasonCode: string, pairedFixtures = 0,
                claimedSavingsPercent: number | null = null, suggestedModel: string | null = null): RouteResult {
  return Object.freeze({
    schema_version: ROUTE_SCHEMA,
    action: suggestedModel ? 'CANDIDATE_REQUIRES_REVIEW' : 'KEEP_NATIVE_DEFAULT',
    suggestedModel, autoExecute: false, modelEntitlementVerified: false,
    independentEvidenceAuthenticated: false, taskClass, risk, pairedFixtures,
    claimedSavingsPercent, reasonCode
  });
}

/** Select a candidate for *human review*, never authorize a model switch.
 * In particular, self-declared Git metadata and imported quality verdicts cannot grant execution rights.
 */
export function recommendModel(raw: unknown): RouteResult {
  if (!object(raw) || raw.schema_version !== ROUTE_SCHEMA ||
      typeof raw.candidateModel !== 'string' || !MODEL_ID.test(raw.candidateModel)) {
    throw new TypeError('INVALID_ROUTE_INPUT');
  }
  const trials = parseTrials(raw.trials);
  const obs = observeTask(raw.task);
  const classes = obs.domains.filter((d): d is RouteClass => CLASSES.includes(d));
  const taskClass = classes.length === 1 ? classes[0] : null;
  if (obs.risk_level !== 'GUARDED') return result(obs.risk_level, taskClass, 'TASK_NOT_VERIFIED_FOR_CANDIDATE');
  if (taskClass === null) return result(obs.risk_level, null, 'AMBIGUOUS_TASK_CLASS');
  const rows = trials.filter(r => r.taskClass === taskClass);
  const grouped = new Map<string, Partial<Record<RouteArm, RouteTrial>>>();
  for (const trial of rows) {
    const group = grouped.get(trial.fixtureId) ?? {};
    group[trial.arm] = trial;
    grouped.set(trial.fixtureId, group);
  }
  if (grouped.size < MIN_PAIRS) return result(obs.risk_level, taskClass, 'INSUFFICIENT_PAIRED_FIXTURES', grouped.size);
  let baselineCost = 0;
  let candidateCost = 0;
  for (const pair of grouped.values()) {
    const b = pair.B0, c = pair.B1;
    if (!b || !c || b.modelId !== null || c.modelId !== raw.candidateModel) {
      return result(obs.risk_level, taskClass, 'INVALID_OR_INCOMPLETE_PAIRS', grouped.size);
    }
    if (b.review !== 'independent' || c.review !== 'independent' ||
        b.accepted !== true || c.accepted !== true ||
        b.costEur === null || c.costEur === null) {
      return result(obs.risk_level, taskClass, 'MISSING_INDEPENDENT_QUALITY_OR_COST', grouped.size);
    }
    baselineCost += b.costEur;
    candidateCost += c.costEur;
  }
  if (baselineCost <= 0 || !Number.isFinite(baselineCost) || !Number.isFinite(candidateCost)) {
    return result(obs.risk_level, taskClass, 'INVALID_BASELINE_COST', grouped.size);
  }
  const reduction = 1 - candidateCost / baselineCost;
  const percentage = Math.round(reduction * 10000) / 100;
  if (reduction + Number.EPSILON < MIN_REDUCTION) {
    return result(obs.risk_level, taskClass, 'NO_MEANINGFUL_SAVINGS', grouped.size, percentage);
  }
  // The claimed saving is based on caller-supplied pricing and review flags.
  // No live entitlement, billing statement, or independent fixture acceptance is verified here.
  return result(obs.risk_level, taskClass, 'IMPORTED_EVIDENCE_CANDIDATE_ONLY',
                grouped.size, percentage, raw.candidateModel);
}
