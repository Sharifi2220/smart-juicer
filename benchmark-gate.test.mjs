import test from 'node:test';
import assert from 'node:assert/strict';
import { assessIndependentB0B1 } from './benchmark.ts';

function records({candidateAccepted = true, missingUsage = false} = {}) {
  return Array.from({ length: 30 }, (_, index) => {
    const pairId = `case-${String(index + 1).padStart(3, '0')}`;
    const common = {
      fixture: pairId,
      taskClass: index % 3 === 0 ? 'ui' : index % 3 === 1 ? 'documentation' : 'development',
      accepted: true,
      inputTokens: 100,
      cachedInputTokens: null,
      outputTokens: 50,
      durationMs: 1_000,
      attempts: 1,
      review: 'independent',
      acceptanceEvidenceId: `review-${pairId}`,
      usageEvidenceSource: 'codex_jsonl',
      usageEvidenceRef: `usage-${pairId}`,
      capturedAt: '2026-10-21T10:00:00Z',
      pairId
    };
    return [
      { ...common, id: `${pairId}-b0`, arm: 'B0', modelId: null, costEur: null },
      { ...common, id: `${pairId}-b1`, arm: 'B1', modelId: 'candidate-model', inputTokens: missingUsage && index === 0 ? null : 50, costEur: null, accepted: candidateAccepted }
    ];
  }).flat();
}

test('30 complete independent pairs pass the manual candidate gate only', () => {
  const report = assessIndependentB0B1(records(), 'candidate-model');
  assert.equal(report.pairCount, 30);
  assert.equal(report.readyForManualCandidateReview, true);
  assert.equal(report.claimedTokenSavingsPercent, 33.33);
  assert.equal(report.baselineTotalTokens,4500);
  assert.equal(report.candidateTotalTokens,3000);
  assert.equal(report.safeForAutomaticRouting, false);
});

test('missing token usage is UNKNOWN and blocks the gate, even if price is present', () => {
  const data=records({missingUsage:true});
  for(const row of data) row.costEur=0.1;
  const report=assessIndependentB0B1(data,'candidate-model');
  assert.equal(report.usageComplete,false);
  assert.equal(report.readyForManualCandidateReview,false);
  assert.equal(report.claimedTokenSavingsPercent,null);
  assert.ok(report.reasons.includes('USAGE_MISSING'));
});

test('one quality regression blocks the candidate', () => {
  const report = assessIndependentB0B1(records({ candidateAccepted: false }), 'candidate-model');
  assert.equal(report.qualityRegression, true);
  assert.equal(report.readyForManualCandidateReview, false);
  assert.ok(report.reasons.includes('QUALITY_REGRESSION'));
});


test('rejects candidate-model substitution even with 30 otherwise accepted pairs', () => {
  const data=records();
  data[1].modelId='other-model';
  const report=assessIndependentB0B1(data,'candidate-model');
  assert.equal(report.readyForManualCandidateReview,false);
  assert.ok(report.reasons.includes('INCONSISTENT_PAIR_OR_MODEL'));
});
test('rejects B0 model override', () => {
  const data=records();
  data[0].modelId='overridden-baseline';
  assert.equal(assessIndependentB0B1(data,'candidate-model').readyForManualCandidateReview,false);
});
test('rejects mismatched fixture identity inside an otherwise complete pair', () => {
  const data=records();
  data[1].fixture='another-fixture';
  assert.equal(assessIndependentB0B1(data,'candidate-model').readyForManualCandidateReview,false);
});
test('rejects 30 good pairs plus an unpaired extra trial', () => {
  const data=records();
  data.push({...data[0],id:'unpaired-record',pairId:'extra',fixture:'extra'});
  const report=assessIndependentB0B1(data,'candidate-model');
  assert.equal(report.readyForManualCandidateReview,false);
  assert.ok(report.reasons.includes('REJECTED_OR_UNPAIRED_TRIALS'));
});
test('rejects 30 good pairs plus a malformed record', () => {
  const data=records();
  data.push({id:'bad-case'});
  assert.equal(assessIndependentB0B1(data,'candidate-model').readyForManualCandidateReview,false);
});
test('rejects an invalid candidate model ID without ignoring the error', () => {
  const report=assessIndependentB0B1(records(),'-bad-model');
  assert.equal(report.readyForManualCandidateReview,false);
  assert.ok(report.reasons.includes('INVALID_CANDIDATE_MODEL'));
});
test('minimum sample-size cannot be lowered by caller', () => {
  assert.throws(()=>assessIndependentB0B1(records(),'candidate-model',1),/MINIMUM_30_PAIRS_REQUIRED/);
});
test('rejects duplicate arm/fixture even if 30 other pairs are complete', () => {
  const data=records();
  data.push({...data[1],id:'duplicate-arm'});
  assert.equal(assessIndependentB0B1(data,'candidate-model').readyForManualCandidateReview,false);
});

test('no EUR costs or invoices are required to report token savings',()=>{
  const data=records();
  for(const row of data) delete row.costEur;
  const report=assessIndependentB0B1(data,'candidate-model');
  assert.equal(report.readyForManualCandidateReview,true);
  assert.equal(report.claimedTokenSavingsPercent,33.33);
});
test('cached input tokens do not get counted twice',()=>{
  const data=records();
  for(const row of data) row.cachedInputTokens=row.inputTokens;
  const report=assessIndependentB0B1(data,'candidate-model');
  assert.equal(report.claimedTokenSavingsPercent,33.33);
});
test('source label missing blocks a token measurement',()=>{
  const data=records();
  delete data[1].usageEvidenceRef;
  const report=assessIndependentB0B1(data,'candidate-model');
  assert.equal(report.readyForManualCandidateReview,false);
  assert.ok(report.reasons.includes('REJECTED_OR_UNPAIRED_TRIALS'));
});
test('below 15% token reduction cannot become a candidate',()=>{
  const data=records();
  for(const row of data) if(row.arm==='B1')row.inputTokens=88;
  const report=assessIndependentB0B1(data,'candidate-model');
  assert.equal(report.claimedTokenSavingsPercent,8);
  assert.equal(report.readyForManualCandidateReview,false);
  assert.ok(report.reasons.includes('NO_MEANINGFUL_TOKEN_SAVINGS'));
});
