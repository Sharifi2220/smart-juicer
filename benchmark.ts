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
