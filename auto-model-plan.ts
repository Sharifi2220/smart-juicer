/** Offline model-selection PLAN with signed imported evidence.
 * Pure with respect to filesystem/network/agent execution.
 * The trusted signer key and model allowlist MUST come from the host,
 * never from the signed payload. A signature authenticates an issuer,
 * NOT the correctness or independence of their data.
 */
import {createPublicKey, verify} from 'node:crypto';
import {observeTask} from './observer.ts';
import {assessIndependentB0B1, type IndependentBenchmarkTrial} from './benchmark.ts';

export const AUTO_PLAN_SCHEMA='v0.1-auto-model-plan' as const;
export const AUTO_EVIDENCE_SCHEMA='v0.1-signed-evidence' as const;
type RouteClass='ui'|'documentation'|'development';
type Effort='low'|'medium'|'high'|'xhigh';
const MODEL=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,100}$/;
const SHA=/^[a-f0-9]{40}$/i;
const CLASSES=['ui','documentation','development'];
const EFFORTS=['low','medium','high','xhigh'];
const MAX_EVIDENCE_BYTES=1024*1024;
const MAX_EVIDENCE_AGE_MS=30*86400*1000;
const MIN_WIN_RATE=0.8; // conservative pilot parameter, NOT an empirically calibrated value

export interface SignedEvidence {
  readonly payloadBase64:string;
  readonly signatureBase64:string;
}
export interface AutomaticPlanInput {
  readonly task:unknown;
  readonly evidence:SignedEvidence|null;
  readonly host:{
    /** Trusted outside evidence JSON; not proof of account entitlement. */
    readonly trustedEvidencePublicKeyPem:string|null;
    readonly allowlistedModels:readonly string[];
    /** Exact revision for a controlled task fixture; supplied by the host. */
    readonly repositoryCommit:string;
  };
}
export interface EvidencePayload {
  readonly schema_version:typeof AUTO_EVIDENCE_SCHEMA;
  readonly candidateModel:string;
  readonly candidateEffort:Effort;
  readonly taskClass:RouteClass;
  readonly repositoryCommit:string;
  readonly generatedAt:string;
  readonly expiresAt:string;
  readonly trials:readonly IndependentBenchmarkTrial[];
}
export interface AutomaticPlan {
  readonly schema_version:typeof AUTO_PLAN_SCHEMA;
  readonly action:'KEEP_NATIVE_DEFAULT'|'AUTO_SELECT_CANDIDATE_PLAN';
  readonly selectedModel:string|null;
  readonly selectedEffort:Effort|null;
  readonly autoExecute:false;
  readonly modelEntitlementVerified:false;
  readonly sourceSignatureVerified:boolean;
  readonly importedQualityIndependentlyAuthenticated:false;
  readonly taskClass:RouteClass|null;
  readonly claimedTokenSavingsPercent:number|null;
  readonly pairedFixtures:number;
  readonly reasonCode:string;
}
function plan(taskClass:RouteClass|null, reasonCode:string, signature=false,
  savings:number|null=null, pairs=0, model:string|null=null, effort:Effort|null=null):AutomaticPlan {
  return Object.freeze({schema_version:AUTO_PLAN_SCHEMA,
    action:model===null?'KEEP_NATIVE_DEFAULT':'AUTO_SELECT_CANDIDATE_PLAN',
    selectedModel:model,selectedEffort:effort,autoExecute:false,modelEntitlementVerified:false,
    sourceSignatureVerified:signature,importedQualityIndependentlyAuthenticated:false,
    taskClass,claimedTokenSavingsPercent:savings,pairedFixtures:pairs,reasonCode});
}
function object(v:unknown):v is Record<string,unknown>{
  return v!==null && typeof v==='object' && !Array.isArray(v);
}
function parseUtc(value:unknown):number|null {
  if(typeof value!=='string'||!/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z/.test(value)) return null;
  const t=Date.parse(value);
  return Number.isFinite(t)?t:null;
}
function strictB64(value:unknown, maxChars:number):Buffer|null{
  if(typeof value!=='string'||value.length===0||value.length>maxChars||
    value.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return null;
  const buf=Buffer.from(value,'base64');
  return buf.toString('base64')===value?buf:null;
}
/**
 * Derive a candidate model for an OFFLINE, nonexecuting plan. No model selection
 * is connected to Codex, routing-cli, config writes or a running agent.
 */
export function planAutomaticModel(input:AutomaticPlanInput,now=Date.now()):AutomaticPlan {
  if(!object(input)||!object(input.host))throw new TypeError('INVALID_AUTO_PLAN_REQUEST');
  if(!Number.isFinite(now))throw new TypeError('INVALID_CLOCK');
  const obs=observeTask(input.task);
  const domains=obs.domains.filter((v):v is RouteClass=>CLASSES.includes(v));
  const taskClass=domains.length===1?domains[0]:null;
  if(obs.risk_level!=='GUARDED')return plan(taskClass,'TASK_NOT_SAFE_FOR_SELECTION');
  if(!taskClass)return plan(null,'AMBIGUOUS_TASK_CLASS');
  const host=input.host;
  if(typeof host.repositoryCommit!=='string'||!SHA.test(host.repositoryCommit)||
    !Array.isArray(host.allowlistedModels)||host.allowlistedModels.length===0||
    host.allowlistedModels.length>32||host.allowlistedModels.some(x=>typeof x!=='string'||!MODEL.test(x))||
    new Set(host.allowlistedModels).size!==host.allowlistedModels.length) {
    return plan(taskClass,'INVALID_HOST_SCOPE');
  }
  if(!input.evidence||!object(input.evidence)||
    typeof host.trustedEvidencePublicKeyPem!=='string'||
    host.trustedEvidencePublicKeyPem.length<50||host.trustedEvidencePublicKeyPem.length>4096)
    return plan(taskClass,'TRUSTED_EVIDENCE_NOT_CONFIGURED');
  const raw=strictB64(input.evidence.payloadBase64,Math.ceil(MAX_EVIDENCE_BYTES/3)*4+4);
  const sig=strictB64(input.evidence.signatureBase64,256);
  if(!raw||!sig||raw.byteLength>MAX_EVIDENCE_BYTES||sig.length!==64)
    return plan(taskClass,'INVALID_SIGNED_EVIDENCE');
  let pub;
  try {
    pub=createPublicKey(host.trustedEvidencePublicKeyPem);
    if(pub.asymmetricKeyType!=='ed25519'||!verify(null,raw,pub,sig))
      return plan(taskClass,'INVALID_EVIDENCE_SIGNATURE');
  } catch {return plan(taskClass,'INVALID_EVIDENCE_SIGNATURE');}
  let payload:unknown;
  try {payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch{return plan(taskClass,'INVALID_EVIDENCE_PAYLOAD',true);}
  if(!object(payload)||payload.schema_version!==AUTO_EVIDENCE_SCHEMA||
    typeof payload.candidateModel!=='string'||!MODEL.test(payload.candidateModel)||
    !EFFORTS.includes(payload.candidateEffort as string)||
    payload.taskClass!==taskClass||
    typeof payload.repositoryCommit!=='string'||payload.repositoryCommit!==host.repositoryCommit||
    !Array.isArray(payload.trials))
    return plan(taskClass,'EVIDENCE_SCOPE_OR_SCHEMA_MISMATCH',true);
  const generated=parseUtc(payload.generatedAt);
  const expires=parseUtc(payload.expiresAt);
  if(generated===null||expires===null||generated>now||expires<=now||
    expires<=generated||expires-generated>MAX_EVIDENCE_AGE_MS||now-generated>MAX_EVIDENCE_AGE_MS)
    return plan(taskClass,'STALE_OR_INVALID_EVIDENCE',true);
  if(!host.allowlistedModels.includes(payload.candidateModel))
    return plan(taskClass,'MODEL_NOT_ALLOWLISTED',true);
  const rows=payload.trials as readonly unknown[];
  // The signed cohort MUST represent exactly the task class evaluated.
  if(rows.some(x=>!object(x)||x.taskClass!==taskClass))
    return plan(taskClass,'MIXED_TASK_CLASS_EVIDENCE',true);
  const report=assessIndependentB0B1(rows,payload.candidateModel);
  if(!report.readyForManualCandidateReview)
    return plan(taskClass,'BENCHMARK_GATE_REJECTED',true,report.claimedTokenSavingsPercent,report.pairCount);
  // The 15% aggregate improvement may conceal individual severe regressions.
  let wins=0;
  const b0=new Map<string,IndependentBenchmarkTrial>();
  const b1=new Map<string,IndependentBenchmarkTrial>();
  for(const row of rows as readonly IndependentBenchmarkTrial[]) {
    (row.arm==='B0'?b0:b1).set(row.pairId,row);
  }
  for(const [id,b] of b0){
    const c=b1.get(id);
    if(!c||b.inputTokens===null||b.outputTokens===null||c.inputTokens===null||c.outputTokens===null)
      return plan(taskClass,'INCOMPLETE_WIN_RATE_EVIDENCE',true);
    const baseline=b.inputTokens+b.outputTokens;
    const candidate=c.inputTokens+c.outputTokens;
    if(!Number.isSafeInteger(baseline)||!Number.isSafeInteger(candidate)||baseline<=0)
      return plan(taskClass,'INVALID_PAIR_TOKEN_TOTALS',true);
    if(candidate<=baseline)wins++;
  }
  if(wins<Math.ceil(b0.size*MIN_WIN_RATE))
    return plan(taskClass,'LOW_PER_PAIR_WIN_RATE',true,report.claimedTokenSavingsPercent,report.pairCount);
  return plan(taskClass,'SIGNED_EVIDENCE_CANDIDATE_FOR_OFFLINE_PLAN',true,
    report.claimedTokenSavingsPercent,report.pairCount,payload.candidateModel,payload.candidateEffort as Effort);
}
