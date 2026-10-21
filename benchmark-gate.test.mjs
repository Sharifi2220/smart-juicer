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

