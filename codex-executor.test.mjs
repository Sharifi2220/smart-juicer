import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexCommand, validateExecutionRequest } from './codex-executor.ts';

const root = 'C:\\tmp\\smart-juicer-disposable-worktree';
function approval(overrides = {}) {
  return {
    enabled: true,
    explicit: true,
    isolatedWorktree: true,
    variant: 'B1',
    modelId: 'example-model',
    effort: 'medium',
    allowWrites: true,
    approvedRoot: root,
    budgetEur: 2,
    maxDurationMs: 60_000,
    approvedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    operator: 'test-operator',
    ...overrides
  };
}
function request(overrides = {}) {
  return {
    root,
    prompt: 'Make the approved fixture change and run its tests.',
    variant: 'B1',
    modelId: 'example-model',
    effort: 'medium',
    allowWrites: true,
    approval: approval(),
    ...overrides
  };
}

test('B1 command requires and forwards the explicit model and effort', () => {
  const plan = buildCodexCommand(request(), root);
  assert.equal(plan.executable, 'codex');
  assert.equal(plan.cwd, root);
  assert.equal(plan.sandbox, 'workspace-write');
  assert.deepEqual(plan.args.slice(0, 5), ['exec', '--json', '--ephemeral', '--ignore-user-config', '--sandbox']);
  assert.ok(plan.args.includes('--model'));
  assert.ok(plan.args.includes('example-model'));
  assert.ok(plan.args.includes('model_reasoning_effort=medium'));
  assert.ok(plan.args.includes('-'));
  assert.ok(!plan.args.some((arg) => arg.includes('dangerously')));
});

test('B0 rejects model and effort overrides', () => {
  const b0 = request({
    variant: 'B0', modelId: null, effort: null,
    approval: approval({ variant: 'B0', modelId: null, effort: null })
  });
  assert.doesNotThrow(() => validateExecutionRequest(b0));
  assert.throws(() => validateExecutionRequest({ ...b0, modelId: 'silent-override' }), /APPROVAL_MODEL_MISMATCH/);
});

test('execution fails closed without fresh explicit approval', () => {
  assert.throws(() => validateExecutionRequest(request({ approval: { ...approval(), explicit: false } })), /EXPLICIT_ISOLATED_APPROVAL_REQUIRED/);
  assert.throws(() => validateExecutionRequest(request({ approval: { ...approval(), expiresAt: new Date(Date.now() - 1_000).toISOString() } })), /APPROVAL_EXPIRED_OR_FUTURE/);
  assert.throws(() => validateExecutionRequest(request({ modelId: null, approval: approval({ modelId: null }) })), /EXPLICIT_MODEL_REQUIRED/);
});

