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
  costEvidenceSource:CostEvidenceSource;
  costEvidenceRef:string;
  capturedAt:string;
  pricingVersion:string;
}
export interface BenchmarkGateReport {
  schema_version:'v0.4-benchmark-gate';
  minPairs:number;
  pairCount:number;
  completePairs:boolean;
  independentQuality:boolean;
  realCostEvidence:boolean;
  usageComplete:boolean;
  qualityRegression:boolean;
  baselineCostEur:number|null;
  candidateCostEur:number|null;
  claimedSavingsPercent:number|null;
  readyForManualCandidateReview:boolean;
  safeForAutomaticRouting:false;
  reasons:readonly string[];
}

const TASK_CLASSES:readonly string[]=['ui','documentation','development'];
const COST_SOURCES:readonly string[]=['provider_invoice','provider_billing_export','provider_usage_export'];
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

/**
 * Validate a paired B0/B1 evidence set without treating imported labels as
 * authenticated proof. Missing quality, usage or provider-cost evidence keeps
 * the result ineligible and never creates an automatic routing decision.
 */
export function assessIndependentB0B1(records:readonly unknown[], candidateModel:string, minPairs=30): BenchmarkGateReport {
  const reasons:string[]=[];
  const rows:IndependentBenchmarkTrial[]=[];
  const seen=new Set<string>();
  if(!ID.test(candidateModel)||candidateModel.length>100) reasons.push('INVALID_CANDIDATE_MODEL');
  if(!Number.isSafeInteger(minPairs)||minPairs<1) throw new TypeError('INVALID_MIN_PAIRS');
  for(const raw of records){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) { reasons.push('INVALID_RECORD'); continue; }
    const r=raw as Record<string,unknown>;
    const valid=typeof r.id==='string'&&ID.test(r.id)&&typeof r.pairId==='string'&&ID.test(r.pairId)&&
      typeof r.fixture==='string'&&ID.test(r.fixture)&&typeof r.taskClass==='string'&&TASK_CLASSES.includes(r.taskClass)&&
      (r.arm==='B0'||r.arm==='B1')&&typeof r.accepted==='boolean'&&r.review==='independent'&&
      (r.modelId===null||(typeof r.modelId==='string'&&ID.test(r.modelId)))&&
      typeof r.acceptanceEvidenceId==='string'&&ID.test(r.acceptanceEvidenceId)&&
      typeof r.costEvidenceSource==='string'&&COST_SOURCES.includes(r.costEvidenceSource)&&
      typeof r.costEvidenceRef==='string'&&r.costEvidenceRef.trim().length>0&&r.costEvidenceRef.length<=400&&
      typeof r.capturedAt==='string'&&Number.isFinite(Date.parse(r.capturedAt))&&
      typeof r.pricingVersion==='string'&&r.pricingVersion.trim().length>0&&r.pricingVersion.length<=200;
    if(!valid){ reasons.push('INVALID_RECORD'); continue; }
    try { summarizeTrials([r as unknown as Trial]); } catch { reasons.push('INVALID_MEASUREMENT'); continue; }
    const row=r as unknown as IndependentBenchmarkTrial;
    if(seen.has(row.id)){ reasons.push('DUPLICATE_TRIAL_ID'); continue; }
    seen.add(row.id); rows.push(row);
  }
  const grouped=new Map<string,IndependentBenchmarkTrial[]>();
  for(const row of rows){ const group=grouped.get(row.pairId)??[]; group.push(row); grouped.set(row.pairId,group); }
  const pairs=[...grouped.values()].filter(group=>group.length===2&&group.some(r=>r.arm==='B0')&&group.some(r=>r.arm==='B1'));
  const completePairs=pairs.length>=minPairs&&pairs.every(group=>group.length===2);
  if(!completePairs) reasons.push('INSUFFICIENT_COMPLETE_PAIRS');
  const independentQuality=pairs.length>0&&pairs.every(group=>group.every(r=>r.review==='independent'&&r.accepted===true&&r.acceptanceEvidenceId.length>0));
  if(!independentQuality) reasons.push('INDEPENDENT_QUALITY_GATE_FAIL');
  const realCostEvidence=pairs.length>0&&pairs.every(group=>group.every(r=>r.costEur!==null&&COST_SOURCES.includes(r.costEvidenceSource)&&r.costEvidenceRef.trim().length>0));
  if(!realCostEvidence) reasons.push('REAL_COST_EVIDENCE_MISSING');
  const usageComplete=pairs.length>0&&pairs.every(group=>group.every(r=>r.inputTokens!==null&&r.outputTokens!==null));
  if(!usageComplete) reasons.push('USAGE_MISSING');
  const qualityRegression=pairs.some(group=>group.some(r=>r.accepted!==true));
  if(qualityRegression) reasons.push('QUALITY_REGRESSION');
  let baselineCostEur:number|null=null,candidateCostEur:number|null=null;
  if(completePairs&&independentQuality&&realCostEvidence){
    baselineCostEur=pairs.reduce((sum,group)=>sum+group.find(r=>r.arm==='B0')!.costEur!,0);
    candidateCostEur=pairs.reduce((sum,group)=>sum+group.find(r=>r.arm==='B1')!.costEur!,0);
  }
  const claimedSavingsPercent=baselineCostEur!==null&&baselineCostEur>0&&candidateCostEur!==null ?
    Math.round((1-candidateCostEur/baselineCostEur)*10000)/100 : null;
  const ready=completePairs&&independentQuality&&realCostEvidence&&usageComplete&&!qualityRegression&&
    baselineCostEur!==null&&baselineCostEur>0&&candidateCostEur!==null;
  if(!ready) reasons.push('NOT_READY_FOR_MANUAL_CANDIDATE_REVIEW');
  return {schema_version:'v0.4-benchmark-gate',minPairs,pairCount:pairs.length,completePairs,independentQuality,
    realCostEvidence,usageComplete,qualityRegression,baselineCostEur,candidateCostEur,claimedSavingsPercent,
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

