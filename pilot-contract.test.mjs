import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePilotUsage,sealPilotManifest,nextPilotEvent,evaluatePilot} from './pilot-contract.ts';
const sha='0'.repeat(40);
const promptSha='1'.repeat(64);
const manifest=(n=2)=>({schemaVersion:'smart-juicer-pilot-v0.6',cohortId:'pilot-01',modelId:'gpt-6.1-sol',baselineEffort:'medium',candidateEffort:'low',tasks:Array.from({length:n},(_,i)=>({id:`test-${i+1}`,fixtureCommit:sha,promptSha256:promptSha,acceptanceId:'mutants-v1',allowedTestPaths:['test/example.test.ts'],requiredMutationKills:1}))});
const usage=(input,output)=>normalizePilotUsage({input_tokens:input,output_tokens:output,cached_input_tokens:Math.floor(input/2)},'codex_jsonl');
function add(m,s,e,taskId,arm,status,o={}) { e.push(nextPilotEvent(m,s,e,{taskId,arm,status,...o})); }
const ok=(id)=>({source:'external_verifier',accepted:true,evidenceId:'verifier-'+id,mutationKills:1});
test('OpenAI Responses total does not add cached or reasoning twice',()=>{
  const u=normalizePilotUsage({usage:{input_tokens:100,input_tokens_details:{cached_tokens:90},output_tokens:40,output_tokens_details:{reasoning_tokens:30},total_tokens:140}},'responses');
  assert.deepEqual(u,{source:'responses',inputTokens:100,outputTokens:40,cachedInputTokens:90,reasoningTokens:30,totalTokens:140});
});
test('chat completion keys and optional subdetails',()=>{
  assert.deepEqual(normalizePilotUsage({prompt_tokens:10,completion_tokens:20,total_tokens:30},'chat_completions'),{
    source:'chat_completions',inputTokens:10,outputTokens:20,cachedInputTokens:null,reasoningTokens:null,totalTokens:30});
});
test('reject inconsistent or impossible token subtotals',()=>{
  assert.throws(()=>normalizePilotUsage({input_tokens:1,output_tokens:2,total_tokens:5},'responses'),/INCONSISTENT/);
  assert.throws(()=>normalizePilotUsage({input_tokens:1,output_tokens:2,input_tokens_details:{cached_tokens:3}},'responses'),/CACHED_EXCEEDS/);
  assert.throws(()=>normalizePilotUsage({input_tokens:1,output_tokens:2,output_tokens_details:{reasoning_tokens:3}},'responses'),/REASONING_EXCEEDS/);
  assert.throws(()=>normalizePilotUsage({input_tokens:1},'responses'),/INVALID_OUTPUT_TOKENS/);
});
test('manifest tracks all 30 paired slots even when B1 vanishes after starting',()=>{
  const m=manifest(30), {sha256}=sealPilotManifest(m), events=[];
  for(const task of m.tasks){
    add(m,sha256,events,task.id,'B0','running');
    add(m,sha256,events,task.id,'B0','completed',{usage:usage(100,100),verifier:ok(task.id)});
    add(m,sha256,events,task.id,'B1','running');
    if(task.id!=='test-30')add(m,sha256,events,task.id,'B1','completed',{usage:usage(100,60),verifier:ok(task.id)});
  }
  const report=evaluatePilot(m,sha256,events);
  assert.equal(report.assignedPairs,30);
  assert.equal(report.arms.B0.assigned,30);
  assert.equal(report.arms.B1.assigned,30);
  assert.equal(report.arms.B1.accepted,29);
  assert.deepEqual(report.contingency,{bothAccepted_n11:29,b0OnlyAccepted_n10:1,b1OnlyAccepted_n01:0,neitherAccepted_n00:0});
  assert.equal(report.arms.B1.statuses.running,1);
  assert.equal(report.arms.B1.totalTokens,null);
  assert.equal(report.claimedSavingsPercent,null);
  assert.equal(report.safeForAutomaticRouting,false);
});
test('failed arm B1 consumes tokens and cannot be selected away',()=>{
  const m=manifest(2),{sha256}=sealPilotManifest(m),events=[];
  for(const task of m.tasks){
    add(m,sha256,events,task.id,'B0','running');
    add(m,sha256,events,task.id,'B0','completed',{usage:usage(100,100),verifier:ok(task.id)});
    add(m,sha256,events,task.id,'B1','running');
    add(m,sha256,events,task.id,'B1',task.id==='test-1'?'failed':'completed',{
      usage:usage(100,10),...(task.id==='test-2'?{verifier:ok(task.id)}:{})});
  }
  const r=evaluatePilot(m,sha256,events);
  assert.equal(r.arms.B1.accepted,1);
  assert.deepEqual(r.contingency,{bothAccepted_n11:1,b0OnlyAccepted_n10:1,b1OnlyAccepted_n01:0,neitherAccepted_n00:0});
  assert.equal(r.bothAcceptedPairs,1);
  assert.equal(r.arms.B0.totalTokens,400);
  assert.equal(r.arms.B1.totalTokens,220);
  assert.equal(r.arms.B1.tokensPerAccepted,220);
  assert.equal(r.nonInferiorityEstablished,false);
});
test('green exit alone without evidence and mutations is not accepted',()=>{
  const m=manifest(1),{sha256}=sealPilotManifest(m),events=[];
  for(const arm of ['B0','B1']) {add(m,sha256,events,'test-1',arm,'running');add(m,sha256,events,'test-1',arm,'completed',{usage:usage(1,1),verifier:{...ok(arm),mutationKills:0}});}
  assert.equal(evaluatePilot(m,sha256,events).arms.B0.accepted,0);
});
test('missing paired run remains pending',()=>{
  const m=manifest(1),{sha256}=sealPilotManifest(m),r=evaluatePilot(m,sha256,[]);
  assert.equal(r.arms.B0.statuses.pending,1);
  assert.equal(r.arms.B1.statuses.pending,1);
  assert.equal(r.arms.B1.accepted,0);
  assert.deepEqual(r.contingency,{bothAccepted_n11:0,b0OnlyAccepted_n10:0,b1OnlyAccepted_n01:0,neitherAccepted_n00:1});
});
test('tampered manifest, journal and unknown task are rejected',()=>{
  const m=manifest(1),{sha256}=sealPilotManifest(m),events=[];
  add(m,sha256,events,'test-1','B0','running');
  assert.throws(()=>evaluatePilot({...m,modelId:'different'},sha256,events),/MANIFEST_HASH_MISMATCH/);
  assert.throws(()=>evaluatePilot(m,sha256,[{...events[0],taskId:'test-hack'}]),/INVALID_EVENT_CHAIN/);
  assert.throws(()=>nextPilotEvent(m,sha256,events,{taskId:'unknown',arm:'B0',status:'running'}),/UNREGISTERED_RUN/);
  assert.throws(()=>nextPilotEvent(m,sha256,events,{taskId:'test-1',arm:'B0',status:'running'}),/ILLEGAL_RUN_TRANSITION/);
});
test('bad manifests reject duplicate tasks and unsafe test paths',()=>{
  const m=manifest(1);
  assert.throws(()=>sealPilotManifest({...m,tasks:[m.tasks[0],m.tasks[0]]}),/INVALID_PILOT_TASK/);
  assert.throws(()=>sealPilotManifest({...m,tasks:[{...m.tasks[0],allowedTestPaths:['../.env']}]}),/INVALID_PILOT_TASK/);
});

test('Claude Messages cache read/write token fields are disjoint input components',()=>{
  const u=normalizePilotUsage({usage:{input_tokens:10,cache_creation_input_tokens:30,cache_read_input_tokens:50,output_tokens:20}},'anthropic_messages');
  assert.deepEqual(u,{source:'anthropic_messages',inputTokens:90,outputTokens:20,cachedInputTokens:50,reasoningTokens:null,totalTokens:110});
  assert.throws(()=>normalizePilotUsage({usage:{input_tokens:10,cache_read_input_tokens:-1,output_tokens:2}},'anthropic_messages'),/INVALID_CACHE_READ_INPUT_TOKENS/);
});
