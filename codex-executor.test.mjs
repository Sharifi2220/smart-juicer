import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexCommand, validateExecutionRequest, validateHostExecutionGate, assertLinkedGitWorktree } from './codex-executor.ts';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const root = process.platform === 'win32'
  ? 'C:\\tmp\\smart-juicer-disposable-worktree'
  : '/tmp/smart-juicer-disposable-worktree';
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


test('host gate requires independently supplied exact root, not only JSON fields',()=>{
  const actual=tmpdir();
  assert.throws(()=>validateHostExecutionGate(actual,{}),/EXECUTION_OPT_IN_REQUIRED/);
  assert.throws(()=>validateHostExecutionGate(actual,{SMART_JUICER_EXECUTE:'1'}),/HOST_APPROVED_ROOT_REQUIRED/);
  assert.doesNotThrow(()=>validateHostExecutionGate(actual,{
    SMART_JUICER_EXECUTE:'1', SMART_JUICER_APPROVED_ROOT:actual
  }));
  const elsewhere=process.cwd();
  if(elsewhere!==actual) assert.throws(()=>validateHostExecutionGate(actual,{
    SMART_JUICER_EXECUTE:'1',SMART_JUICER_APPROVED_ROOT:elsewhere
  }),/HOST_APPROVED_ROOT_MISMATCH/);
});
test('only a verified linked git worktree can reach the execution boundary',()=>{
  const temp=mkdtempSync(join(tmpdir(),'sj-linked-worktree-'));
  const repository=join(temp,'source');
  const linked=join(temp,'linked');
  mkdirSync(repository);
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8',timeout:10000,windowsHide:true});
  try{
    git('-C',repository,'init','-q');
    git('-C',repository,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-m','fixture');
    assert.throws(()=>assertLinkedGitWorktree(repository),/LINKED_GIT_WORKTREE_REQUIRED/);
    git('-C',repository,'worktree','add','--detach',linked,'HEAD');
    assert.doesNotThrow(()=>assertLinkedGitWorktree(linked));
  }finally{
    try{git('-C',repository,'worktree','remove','--force',linked);}catch{}
    rmSync(temp,{recursive:true,force:true,maxRetries:3});
  }
});
