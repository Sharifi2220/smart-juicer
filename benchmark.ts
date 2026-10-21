/** Benchmark math on external, explicitly quality-verified records; no agent execution.
 * UNKNOWN is null, not zero. Cost numbers are valid only with independently documented rates.
 */
export type Arm='B0'|'B1'|'R_EFFORT'|'R_FULL';
export interface Trial {
  id:string; fixture:string; arm:Arm; accepted:boolean;
  inputTokens:number|null; cachedInputTokens:number|null; outputTokens:number|null;
  costEur:number|null; durationMs:number|null;
  attempts:number|null;
}
export interface ArmSummary {
  arm:Arm; runs:number; accepted:number; acceptanceRate:number|null;
  tokensPerAccepted:number|null; eurosPerAccepted:number|null;
  totalDurationMs:number|null; missingUsage:number; missingCost:number;
}
export type BenchmarkTaskClass='ui'|'documentation'|'development';
export type CostEvidenceSource='provider_invoice'|'provider_billing_export'|'provider_usage_export';
export interface IndependentBenchmarkTrial extends Trial {
  pairId:string;
  taskClass:BenchmarkTaskClass;
  modelId:string|null;
  review:'independent';
  acceptanceEvidenceId:string;
  /** Explicit usage metadata source; label is not independently authenticated. */
  usageEvidenceSource:'codex_jsonl'|'provider_usage_export';
  usageEvidenceRef:string;
  capturedAt:string;
  costEvidenceSource?:CostEvidenceSource;
  costEvidenceRef?:string;
  pricingVersion?:string;
}
export interface BenchmarkGateReport {
  schema_version:'v0.5-token-gate';
  minPairs:number;
  pairCount:number;
  completePairs:boolean;
  independentQuality:boolean;
  usageComplete:boolean;
  qualityRegression:boolean;
  baselineTotalTokens:number|null;
  candidateTotalTokens:number|null;
  /** Token-volume reduction calculated from imported usage records, NOT EUR savings. */
  claimedTokenSavingsPercent:number|null;
  readyForManualCandidateReview:boolean;
  safeForAutomaticRouting:false;
  reasons:readonly string[];
}

const TASK_CLASSES:readonly string[]=['ui','documentation','development'];
const COST_SOURCES:readonly string[]=['provider_invoice','provider_billing_export','provider_usage_export'];
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

/**
 * Validate a paired B0/B1 TOKEN comparison without treating imported labels as
 * authenticated proof. Price data is deliberately irrelevant.
 * Missing quality or usage evidence blocks selection and never grants routing.
 */
export function assessIndependentB0B1(records:readonly unknown[], candidateModel:string, minPairs=30): BenchmarkGateReport {
  const reasons:string[]=[];
  const rows:IndependentBenchmarkTrial[]=[];
  const seen=new Set<string>();
  if(typeof candidateModel!=='string'||!ID.test(candidateModel)||candidateModel.length>100) reasons.push('INVALID_CANDIDATE_MODEL');
  if(!Number.isSafeInteger(minPairs)||minPairs<30) throw new TypeError('MINIMUM_30_PAIRS_REQUIRED');
  if(!Array.isArray(records)||records.length>10000) throw new TypeError('INVALID_BENCHMARK_RECORD_COLLECTION');
  for(const raw of records){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) { reasons.push('INVALID_RECORD'); continue; }
    const r=raw as Record<string,unknown>;
    const valid=typeof r.id==='string'&&ID.test(r.id)&&typeof r.pairId==='string'&&ID.test(r.pairId)&&
      typeof r.fixture==='string'&&ID.test(r.fixture)&&typeof r.taskClass==='string'&&TASK_CLASSES.includes(r.taskClass)&&
      (r.arm==='B0'||r.arm==='B1')&&typeof r.accepted==='boolean'&&r.review==='independent'&&
      (r.modelId===null||(typeof r.modelId==='string'&&ID.test(r.modelId)))&&
      typeof r.acceptanceEvidenceId==='string'&&ID.test(r.acceptanceEvidenceId)&&
      (r.usageEvidenceSource==='codex_jsonl'||r.usageEvidenceSource==='provider_usage_export')&&
      typeof r.usageEvidenceRef==='string'&&r.usageEvidenceRef.trim().length>0&&r.usageEvidenceRef.length<=400&&
      typeof r.capturedAt==='string'&&Number.isFinite(Date.parse(r.capturedAt));
    if(!valid){ reasons.push('INVALID_RECORD'); continue; }
    // Cost is optional for a token metric; missing cost must not be read as EUR 0.
    const normalized={costEur:null,cachedInputTokens:null,...r};
    try { summarizeTrials([normalized as unknown as Trial]); } catch { reasons.push('INVALID_MEASUREMENT'); continue; }
    const row=normalized as unknown as IndependentBenchmarkTrial;
    if(seen.has(row.id)){ reasons.push('DUPLICATE_TRIAL_ID'); continue; }
    seen.add(row.id); rows.push(row);
  }
  const grouped=new Map<string,IndependentBenchmarkTrial[]>();
  for(const row of rows){ const group=grouped.get(row.pairId)??[]; group.push(row); grouped.set(row.pairId,group); }
  const pairs=[...grouped.values()].filter(group=>group.length===2&&group.some(r=>r.arm==='B0')&&group.some(r=>r.arm==='B1'));
  // Never silently drop invalid, duplicate, extra or unpaired records. A
  // superficially valid subset cannot turn a malformed imported dataset PASS.
  const noRejectedRecords=reasons.length===0&&pairs.length===grouped.size&&pairs.length*2===records.length;
  if(!noRejectedRecords) reasons.push('REJECTED_OR_UNPAIRED_TRIALS');
  const modelAndFixtureMatch=pairs.every(group=>{
    const b=group.find(r=>r.arm==='B0')!;
    const c=group.find(r=>r.arm==='B1')!;
    return b.modelId===null&&c.modelId===candidateModel&&
      b.fixture===c.fixture&&b.fixture===b.pairId&&
      b.taskClass===c.taskClass;
  });
  if(!modelAndFixtureMatch) reasons.push('INCONSISTENT_PAIR_OR_MODEL');
  const completePairs=pairs.length>=minPairs&&noRejectedRecords&&modelAndFixtureMatch;
  if(!completePairs) reasons.push('INSUFFICIENT_COMPLETE_PAIRS');
  const independentQuality=pairs.length>0&&pairs.every(group=>group.every(r=>r.review==='independent'&&r.accepted===true&&r.acceptanceEvidenceId.length>0));
  if(!independentQuality) reasons.push('INDEPENDENT_QUALITY_GATE_FAIL');
  const usageComplete=pairs.length>0&&pairs.every(group=>group.every(r=>
    r.inputTokens!==null&&r.outputTokens!==null&&
    r.usageEvidenceRef.length>0&&(r.usageEvidenceSource==='codex_jsonl'||r.usageEvidenceSource==='provider_usage_export')));
  if(!usageComplete) reasons.push('USAGE_MISSING');
  const qualityRegression=pairs.some(group=>group.some(r=>r.accepted!==true));
  if(qualityRegression) reasons.push('QUALITY_REGRESSION');
  let baselineTotalTokens:number|null=null,candidateTotalTokens:number|null=null;
  if(completePairs&&independentQuality&&usageComplete&&!qualityRegression){
    const total=(arm:Arm)=>pairs.reduce((sum,group)=>{
      const r=group.find(row=>row.arm===arm)!;
      return sum+r.inputTokens!+r.outputTokens!;
    },0);
    const b=total('B0'),c=total('B1');
    if(Number.isSafeInteger(b)&&Number.isSafeInteger(c)&&b>0){
      baselineTotalTokens=b; candidateTotalTokens=c;
    } else reasons.push('INVALID_TOKEN_TOTALS');
  }
  const claimedTokenSavingsPercent=baselineTotalTokens!==null&&candidateTotalTokens!==null?
    Math.round((1-candidateTotalTokens/baselineTotalTokens)*10000)/100:null;
  const ready=completePairs&&noRejectedRecords&&modelAndFixtureMatch&&independentQuality&&usageComplete&&!qualityRegression&&
    claimedTokenSavingsPercent!==null&&claimedTokenSavingsPercent>=15;
  if(claimedTokenSavingsPercent!==null&&claimedTokenSavingsPercent<15) reasons.push('NO_MEANINGFUL_TOKEN_SAVINGS');
  if(!ready) reasons.push('NOT_READY_FOR_MANUAL_CANDIDATE_REVIEW');
  return {schema_version:'v0.5-token-gate',minPairs,pairCount:pairs.length,completePairs,independentQuality,
    usageComplete,qualityRegression,baselineTotalTokens,candidateTotalTokens,claimedTokenSavingsPercent,
    readyForManualCandidateReview:ready,safeForAutomaticRouting:false,reasons:[...new Set(reasons)]};
}
const count=(v:number|null)=>v!==null && Number.isFinite(v) && v>=0;
export function summarizeTrials(records:readonly Trial[]):ArmSummary[] {
  const arms:Arm[]=['B0','B1','R_EFFORT','R_FULL'];
  const usedIds = new Set<string>();
  for(const t of records){
    if (!arms.includes(t.arm)||typeof t.fixture!=='string'||!t.fixture||typeof t.id!=='string'||!t.id||typeof t.accepted!=='boolean') throw new TypeError('INVALID_TRIAL');
    if (usedIds.has(t.id)) throw new TypeError('DUPLICATE_TRIAL_ID');
    usedIds.add(t.id);
    if (![t.inputTokens,t.cachedInputTokens,t.outputTokens,t.costEur,t.durationMs,t.attempts].every(x=>x===null||count(x))) throw new TypeError('INVALID_MEASUREMENT');
    // Token and attempt quantities are counts, not fractional estimates.
    if (![t.inputTokens,t.cachedInputTokens,t.outputTokens,t.attempts].every(v=>v===null||Number.isSafeInteger(v))) throw new TypeError('INVALID_COUNT');
    if (t.attempts!==null && t.attempts<1) throw new TypeError('INVALID_ATTEMPTS');
    if (t.cachedInputTokens!==null && t.inputTokens!==null && t.cachedInputTokens>t.inputTokens) throw new TypeError('INVALID_CACHED_TOKENS');
  }
  return arms.map(arm=>{
    const rows=records.filter(r=>r.arm===arm);
    const accepted=rows.filter(r=>r.accepted).length;
    const completeUsage=rows.every(r=>r.inputTokens!==null&&r.outputTokens!==null);
    const completeCost=rows.every(r=>r.costEur!==null);
    const completeDuration=rows.every(r=>r.durationMs!==null);
    return {arm,runs:rows.length,accepted,acceptanceRate:rows.length?accepted/rows.length:null,
      tokensPerAccepted: accepted&&completeUsage ?rows.reduce((v,r)=>v+r.inputTokens!+r.outputTokens!,0)/accepted:null,
      eurosPerAccepted:accepted&&completeCost?rows.reduce((v,r)=>v+r.costEur!,0)/accepted:null,
      totalDurationMs:rows.length&&completeDuration?rows.reduce((v,r)=>v+r.durationMs!,0):null,
      missingUsage:rows.filter(r=>r.inputTokens===null||r.outputTokens===null).length,
      missingCost:rows.filter(r=>r.costEur===null).length};
  });
}

