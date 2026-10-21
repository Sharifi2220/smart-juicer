import test from 'node:test';
import assert from 'node:assert/strict';
import { assessIndependentB0B1 } from './benchmark.ts';

function records({candidateAccepted = true, missingCost = false} = {}) {
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
      costEvidenceSource: 'provider_billing_export',
      costEvidenceRef: `billing-${pairId}`,
      capturedAt: '2026-10-21T10:00:00Z',
      pricingVersion: 'provider-pricing-2026-10',
      pairId
    };
    return [
      { ...common, id: `${pairId}-b0`, arm: 'B0', modelId: null, costEur: 1 },
      { ...common, id: `${pairId}-b1`, arm: 'B1', modelId: 'candidate-model', costEur: missingCost && index === 0 ? null : 0.7, accepted: candidateAccepted }
    ];
  }).flat();
}

test('30 complete independent pairs pass the manual candidate gate only', () => {
  const report = assessIndependentB0B1(records(), 'candidate-model');
  assert.equal(report.pairCount, 30);
  assert.equal(report.readyForManualCandidateReview, true);
  assert.equal(report.claimedSavingsPercent, 30);
  assert.equal(report.safeForAutomaticRouting, false);
});

test('missing provider cost evidence is UNKNOWN and blocks the gate', () => {
  const report = assessIndependentB0B1(records({ missingCost: true }), 'candidate-model');
  assert.equal(report.realCostEvidence, false);
  assert.equal(report.readyForManualCandidateReview, false);
  assert.ok(report.reasons.includes('REAL_COST_EVIDENCE_MISSING'));
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
