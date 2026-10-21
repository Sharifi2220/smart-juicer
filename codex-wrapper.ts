/** Smart Juicer – Codex-native integration contract, planning/doctor only.
 * This module NEVER initiates an inference run, writes user files, or changes Codex config.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { inspectGitRepository, type ScopeReport } from './inspector.ts';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh';
export type Variant = 'B0' | 'B1' | 'R_EFFORT';
export interface CodexPlan {
  readonly kind: 'CODEX_EXEC_REVIEW_PLAN';
  readonly variant: Variant;
  readonly executable: 'codex';
  readonly args: readonly string[];
  readonly stdinPromptRequired: true;
  readonly repoRoot: string;
  readonly scope: ScopeReport;
  readonly requiresExplicitHumanApproval: true;
  readonly executed: false;
  readonly verifiedModelEntitlement: false;
  readonly usage: null;
  readonly warnings: readonly string[];
}
export function planCodexRun(input: {root:string; model?:string; effort?:Effort; variant:Variant}): CodexPlan {
  if (!input || !['B0','B1','R_EFFORT'].includes(input.variant)) throw new TypeError('INVALID_VARIANT');
  const scope = inspectGitRepository(input.root);
  if (scope.gitDirty) throw new TypeError('DIRTY_WORKTREE_REQUIRES_ISOLATED_FIXTURE');
  // Do not silently discard caller-supplied overrides in the native control arm.
  if (input.variant === 'B0' && (input.model !== undefined || input.effort !== undefined)) {
    throw new TypeError('B0_FORBIDS_MODEL_EFFORT_OVERRIDES');
  }
  if (input.variant !== 'B0' && !input.model) throw new TypeError('MODEL_REQUIRED_FOR_PAIRED_TEST');
  if (input.variant === 'B1' && input.effort !== 'medium') throw new TypeError('B1_MUST_USE_MEDIUM');
  if (input.variant === 'R_EFFORT' && !input.effort) throw new TypeError('EFFORT_REQUIRED');
  if (input.effort && !['low','medium','high','xhigh'].includes(input.effort)) throw new TypeError('INVALID_EFFORT');
  if (input.model && !/^[a-zA-Z0-9][\w.:-]{0,100}$/.test(input.model)) throw new TypeError('INVALID_MODEL_ID');
  // B0 must not silently force a sandbox or model/effort override: those
  // change the native baseline. JSON telemetry is kept identical for arms.
  // Native defaults and actual capabilities still need verification on host.
  const args = ['exec','--json'];
  if (input.variant !== 'B0') {args.push('--model',input.model!,'-c',`model_reasoning_effort=${input.effort}`);}
  args.push('-'); // Prompt via stdin, never embed task text into process arguments.
  return Object.freeze({kind:'CODEX_EXEC_REVIEW_PLAN',variant:input.variant,executable:'codex',args,
    stdinPromptRequired:true,repoRoot:resolve(scope.root),scope,requiresExplicitHumanApproval:true,executed:false,
    verifiedModelEntitlement:false,usage:null,
    warnings:['NO_INFERENCE_PERFORMED','CATALOG_NOT_ENTITLEMENT','EXECUTE_ONLY_IN_EXPLICITLY_APPROVED_ISOLATED_WORKTREE','NEVER_AUTO_APPROVE_PRIVILEGES','B0_USES_NATIVE_CLI_DEFAULTS_VERIFY_ACTUAL_HOST_CONFIGURATION']});
}

/** Read-only diagnostic. A version string proves neither login nor model entitlement. */
export function codexDoctor(): {found:boolean;version:string|null;configChanged:false;inferenceCalled:false} {
  try {
    const version=execFileSync('codex',['--version'],{encoding:'utf8',timeout:5000,windowsHide:true}).trim();
    return {found:true,version,configChanged:false,inferenceCalled:false};
  } catch {return {found:false,version:null,configChanged:false,inferenceCalled:false};}
}
