import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {planAutomaticModel,AUTO_EVIDENCE_SCHEMA} from './auto-model-plan.ts';

const keys=generateKeyPairSync('ed25519');
const pem=keys.publicKey.export({format:'pem',type:'spki'}).toString();
const revision='0123456789abcdef0123456789abcdef01234567';
const clock=Date.parse('2026-10-21T12:00:00Z');
function task(prompt='Change CSS button color') {
  return {schema_version:'v0.1',sourceTrust:'user_direct',originalPrompt:prompt,
    fileMetadata:{totalCount:1,changedRelativePaths:['src/button.css'],extensions:['.css']},
    repoSignals:{gitDirty:false,sensitivePathsTouched:false,testsPresent:true}};
}
function rows() {
  return Array.from({length:30},(_,i)=>{
    const id='case-'+String(i+1).padStart(3,'0');
    const common={fixture:id,pairId:id,taskClass:'ui',accepted:true,review:'independent',
      acceptanceEvidenceId:'review-'+id,usageEvidenceSource:'codex_jsonl',
      usageEvidenceRef:'usage-'+id,capturedAt:'2026-10-21T10:00:00Z',
      cachedInputTokens:10,durationMs:1000,attempts:1,costEur:null};
    return [
      {...common,id:id+'-b0',arm:'B0',modelId:null,inputTokens:100,outputTokens:50},
      {...common,id:id+'-b1',arm:'B1',modelId:'candidate-1',inputTokens:70,outputTokens:35}
    ];
  }).flat();
}
function evidence(changes={}) {
  const doc={schema_version:AUTO_EVIDENCE_SCHEMA,candidateModel:'candidate-1',
    candidateEffort:'low',taskClass:'ui',repositoryCommit:revision,
    generatedAt:'2026-10-21T09:00:00Z',expiresAt:'2026-10-22T09:00:00Z',
    trials:rows(),...changes};
  const data=Buffer.from(JSON.stringify(doc),'utf8');
  return {payloadBase64:data.toString('base64'),
    signatureBase64:sign(null,data,keys.privateKey).toString('base64')};
}
function request(e=evidence()){
  return {task:task(),evidence:e,host:{trustedEvidencePublicKeyPem:pem,
    allowlistedModels:['candidate-1'],repositoryCommit:revision}};
}
test('valid signed cohort yields an OFFLINE model selection plan',()=>{
  const result=planAutomaticModel(request(),clock);
  assert.equal(result.selectedModel,'candidate-1');
  assert.equal(result.selectedEffort,'low');
  assert.equal(result.claimedTokenSavingsPercent,30);
  assert.equal(result.pairedFixtures,30);
  assert.equal(result.autoExecute,false);
  assert.equal(result.modelEntitlementVerified,false);
  assert.equal(result.importedQualityIndependentlyAuthenticated,false);
});
test('no host trust anchor means native default',()=>{
  const req=request();req.host.trustedEvidencePublicKeyPem=null;
  assert.equal(planAutomaticModel(req,clock).reasonCode,'TRUSTED_EVIDENCE_NOT_CONFIGURED');
});
test('invalid signature fails closed',()=>{
  const fake=request();fake.evidence.signatureBase64='bad';
  assert.equal(planAutomaticModel(fake,clock).selectedModel,null);
});
test('expired signed evidence never selects',()=>{
  const x=request(evidence({expiresAt:'2026-10-20T13:00:00Z'}));
  assert.equal(planAutomaticModel(x,clock).reasonCode,'STALE_OR_INVALID_EVIDENCE');
});
test('host allowlist and commit scope cannot be overridden by issuer',()=>{
  const x=request();x.host.allowlistedModels=['other'];
  assert.equal(planAutomaticModel(x,clock).reasonCode,'MODEL_NOT_ALLOWLISTED');
  x.host.allowlistedModels=['candidate-1'];
  x.host.repositoryCommit='1111111111111111111111111111111111111111';
  assert.equal(planAutomaticModel(x,clock).reasonCode,'EVIDENCE_SCOPE_OR_SCHEMA_MISMATCH');
});
test('30 matched quality successes are required',()=>{
  const r=rows();r[1].accepted=false;
  assert.equal(planAutomaticModel(request(evidence({trials:r})),clock).selectedModel,null);
});
test('every pair must match the class, and partial cohorts are rejected',()=>{
  const r=rows();r[2].taskClass='documentation';
  assert.equal(planAutomaticModel(request(evidence({trials:r})),clock).reasonCode,'MIXED_TASK_CLASS_EVIDENCE');
  assert.equal(planAutomaticModel(request(evidence({trials:rows().slice(0,58)})),clock).selectedModel,null);
});

test('validly signed but uneven cohort fails the minimum per-pair win rate',()=>{
  const r=rows();
  for(let i=1;i<r.length;i+=2){
    const idx=(i-1)/2;
    if(idx<8){r[i].inputTokens=205;r[i].outputTokens=20;}
    else {r[i].inputTokens=0;r[i].outputTokens=0;r[i].cachedInputTokens=0;}
  }
  const out=planAutomaticModel(request(evidence({trials:r})),clock);
  assert.equal(out.reasonCode,'LOW_PER_PAIR_WIN_RATE');
  assert.equal(out.selectedModel,null);
});
test('signature rejects altered but well-formed cohort',()=>{
  const x=request();
  x.evidence.payloadBase64=evidence({candidateModel:'other-model'}).payloadBase64;
  assert.equal(planAutomaticModel(x,clock).reasonCode,'INVALID_EVIDENCE_SIGNATURE');
});
test('unsafe task and ambiguous classification retain native settings',()=>{
  const x=request();
  x.task=task('README CSS button');
  assert.equal(planAutomaticModel(x,clock).selectedModel,null);
});

test('synthetic demo never invokes a model or claims field savings',()=>{
  const path=fileURLToPath(new URL('./auto-model-demo.mjs',import.meta.url));
  const output=JSON.parse(execFileSync(process.execPath,[path],{
    encoding:'utf8',timeout:10000,windowsHide:true
  }));
  assert.equal(output.demo,'SYNTHETIC_SELF_SIGNED_NOT_REAL_PROOF');
  assert.equal(output.action,'AUTO_SELECT_CANDIDATE_PLAN');
  assert.equal(output.autoExecute,false);
  assert.equal(output.modelEntitlementVerified,false);
});
