import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessStrykerReport} from './stryker-report.ts';
const subject='export const isAdult=(age)=>age>=18;\n';
const hash=(v)=>createHash('sha256').update(v).digest('hex');
const exp={sourcePath:'subject.ts',sourceSha256:hash(subject),requiredMutationKills:2,expectedMutationCount:2};
function report(statuses=['Killed','Killed'],source=subject){
  return JSON.stringify({schemaVersion:'2',framework:{name:'Stryker',version:'8.0.0'},thresholds:{high:80,low:60},
    files:{'subject.ts':{language:'typescript',source,mutants:statuses.map((status,i)=>({id:String(i),mutatorName:'EqualityOperator',location:{start:{line:1,column:1},end:{line:1,column:2}},status}))}}});
}
test('counts only actual Killed mutants and marks imported proof unverified',()=>{
  const v=assessStrykerReport(report(),exp);
  assert.equal(v.acceptedByReportRules,true);assert.equal(v.killed,2);assert.equal(v.evidenceTrust,'IMPORTED_UNVERIFIED');
  assert.match(v.reportSha256,/^[0-9a-f]{64}$/);
});
test('trivial/surviving test cannot meet the quality gate',()=>{
  const v=assessStrykerReport(report(['Survived','Survived']),exp);
  assert.equal(v.killed,0);assert.equal(v.acceptedByReportRules,false);
  assert.ok(v.reasons.includes('INSUFFICIENT_MUTATION_KILLS'));
});
test('timeout, compile error, no coverage and ignored do not become Killed',()=>{
  for(const status of ['Timeout','CompileError','RuntimeError','NoCoverage','Ignored','Pending']){
    const v=assessStrykerReport(report(['Killed',status]),exp);
    assert.equal(v.acceptedByReportRules,false);assert.equal(v.invalid,1);
  }
});
test('empty, omitted and duplicated mutants fail closed',()=>{
  assert.equal(assessStrykerReport(report([]),exp).acceptedByReportRules,false);
  assert.equal(assessStrykerReport(report(['Killed']),exp).acceptedByReportRules,false);
  const duplicate=JSON.parse(report());duplicate.files['subject.ts'].mutants[1].id='0';
  assert.throws(()=>assessStrykerReport(JSON.stringify(duplicate),exp),/INVALID_STRYKER_MUTANT/);
});
test('optional framework metadata, wrong source file or tampered source bytes',()=>{
  const noFramework=JSON.parse(report());delete noFramework.framework;
  assert.equal(assessStrykerReport(JSON.stringify(noFramework),exp).killed,2);
  const second=JSON.parse(report());second.files['other.ts']=second.files['subject.ts'];
  assert.throws(()=>assessStrykerReport(JSON.stringify(second),exp),/STRYKER_SOURCE_SCOPE_MISMATCH/);
  assert.throws(()=>assessStrykerReport(report(undefined,'export const isAdult=()=>true;\n'),exp),/STRYKER_SOURCE_BYTES_MISMATCH/);
});
test('JSON-invalid, unknown status, noncanonical path and oversized report rejected',()=>{
  assert.throws(()=>assessStrykerReport('{',exp),/INVALID_STRYKER_REPORT_JSON/);
  assert.throws(()=>assessStrykerReport(report(['Killed','Unknown']),exp),/INVALID_STRYKER_MUTANT/);
  assert.throws(()=>assessStrykerReport(report(),{...exp,sourcePath:'../escape.ts'}),/INVALID_STRYKER_EXPECTATION/);
  assert.throws(()=>assessStrykerReport('x'.repeat(8*1024*1024+1),exp),/STRYKER_REPORT_SIZE/);
});
