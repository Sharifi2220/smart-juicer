import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPilotJournal,appendPilotEventDurable,readPilotJournal,releasePilotJournalLock} from './pilot-journal.ts';
import {sealPilotManifest,evaluatePilot,normalizePilotUsage} from './pilot-contract.ts';
const m={schemaVersion:'smart-juicer-pilot-v0.6',cohortId:'journal-fixture',modelId:'gpt-6.1-sol',baselineEffort:'medium',candidateEffort:'low',tasks:[{id:'t-1',fixtureCommit:'0'.repeat(40),promptSha256:'1'.repeat(64),acceptanceId:'mutation-suite',allowedTestPaths:['test/f.test.ts'],requiredMutationKills:1}]};
function fixture(fn){const d=mkdtempSync(join(tmpdir(),'sj-journal-'));const workspace=join(d,'workspace');const host=join(d,'host');mkdirSync(workspace);mkdirSync(host);const file=join(host,'events.jsonl');try{fn({d,workspace,host,file});}finally{rmSync(d,{recursive:true,force:true});}}
test('manifest locks pre-registered slots; journal fsync readback roundtrip',()=>fixture(({workspace,file})=>{
  const {sha256}=sealPilotManifest(m);
  createPilotJournal(m,sha256,file,workspace,{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256});
  appendPilotEventDurable(m,sha256,file,workspace,{taskId:'t-1',arm:'B0',status:'running'},{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256});
  const u=normalizePilotUsage({input_tokens:10,output_tokens:3},'codex_jsonl');
  appendPilotEventDurable(m,sha256,file,workspace,{taskId:'t-1',arm:'B0',status:'completed',usage:u,verifier:{source:'external_verifier',accepted:true,evidenceId:'mutation-pass',mutationKills:1}},{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256});
  const loaded=readPilotJournal(m,sha256,file,workspace,{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256});
  const r=evaluatePilot(m,sha256,loaded);
  assert.equal(r.arms.B0.accepted,1);assert.equal(r.arms.B1.assigned,1);assert.equal(r.arms.B1.totalTokens,null);
  assert.equal(loaded.length,2);
  assert.equal(readFileSync(file,'utf8').trimEnd().split('\n').length,3);
}));
test('no journal inside agent workspace, and no unexpected overwrites',()=>fixture(({workspace,file})=>{
  const {sha256}=sealPilotManifest(m);
  assert.throws(()=>createPilotJournal(m,sha256,join(workspace,'s.jsonl'),workspace,{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256}),/JOURNAL_INSIDE_AGENT_WORKSPACE/);
  createPilotJournal(m,sha256,file,workspace,{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256});
  assert.throws(()=>createPilotJournal(m,sha256,file,workspace,{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256}),/EEXIST/);
}));
test('torn final line is explicitly rejected, not silently dropped',()=>fixture(({workspace,file})=>{
  const {sha256}=sealPilotManifest(m);createPilotJournal(m,sha256,file,workspace,{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256});
  writeFileSync(file,readFileSync(file,'utf8')+'{"seq":1');
  assert.throws(()=>readPilotJournal(m,sha256,file,workspace,{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256}),/INVALID_JOURNAL_BOUNDARY/);
  assert.throws(()=>appendPilotEventDurable(m,sha256,file,workspace,{taskId:'t-1',arm:'B0',status:'running'},{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256}),/INVALID_JOURNAL_BOUNDARY/);
}));
test('manifest mismatch rejects an append',()=>fixture(({workspace,file})=>{
  const {sha256}=sealPilotManifest(m);createPilotJournal(m,sha256,file,workspace,{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256});
  assert.throws(()=>appendPilotEventDurable(m,'a'.repeat(64),file,workspace,{taskId:'t-1',arm:'B0',status:'running'},{SMART_JUICER_PILOT_MANIFEST_SHA256:sha256}),/HOST_MANIFEST_NOT_PINNED/);
}));

test('missing host pin blocks journal creation',()=>fixture(({workspace,file})=>{
  const {sha256}=sealPilotManifest(m);assert.throws(()=>createPilotJournal(m,sha256,file,workspace,{}),/HOST_MANIFEST_NOT_PINNED/);
}));

test('lock release retries bounded transient Windows errors; never treats a lost lock as success',()=>{
  let calls=0;
  releasePilotJournalLock('fixture.lock',()=>{if(++calls<3)throw Object.assign(new Error('busy'),{code:'EBUSY'});});
  assert.equal(calls,3);
  assert.throws(()=>releasePilotJournalLock('fixture.lock',()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});}),/missing/);
  calls=0;
  assert.throws(()=>releasePilotJournalLock('fixture.lock',()=>{calls++;throw Object.assign(new Error('permission'),{code:'EPERM'});}),/permission/);
  assert.equal(calls,4);
});
test('failed journal append leaves fail-closed lock pending operator inspection',()=>fixture(({workspace,file})=>{
  const {sha256}=sealPilotManifest(m);const env={SMART_JUICER_PILOT_MANIFEST_SHA256:sha256};
  createPilotJournal(m,sha256,file,workspace,env);
  writeFileSync(file,readFileSync(file,'utf8')+'broken-json');
  assert.throws(()=>appendPilotEventDurable(m,sha256,file,workspace,{taskId:'t-1',arm:'B0',status:'running'},env));
  assert.equal(readFileSync(file+'.lock','utf8'),'');
}));
