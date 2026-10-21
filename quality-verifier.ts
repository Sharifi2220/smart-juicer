/** Local verification for explicitly selected disposable worktrees.
 * Runs only allowlisted tools; no arbitrary shell strings, no auto-rollback.
 * Project tests can execute arbitrary project scripts: caller must approve that separately.
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { inspectGitRepository, normalizeRelativePath } from './inspector.ts';

export interface CheckResult { name:string; passed:boolean|null; exitCode:number|null; reason:string; }
export interface QualityReport { accepted:boolean; scopeVerified:boolean; checks:CheckResult[]; note:string; }

/** Pure scope check used in tests and by a future runner. */
export function checkAllowedScope(changed:readonly string[], allowed:readonly string[]): boolean {
  const allow = new Set(allowed.map(normalizeRelativePath));
  return changed.every(p=>allow.has(normalizeRelativePath(p)));
}

/** By default no project/test subprocess is executed. Git diff check is explicitly opt-in,
 * and its PASS does not cover untracked files or prove program correctness.
 */
export function verifyQuality(input:{root:string;allowedPaths:readonly string[]; runDiffCheck?:boolean}): QualityReport {
  const root=realpathSync(input.root);
  const scope=inspectGitRepository(root);
  const scopeOk=checkAllowedScope(scope.changedPaths,input.allowedPaths);
  const checks:CheckResult[]=[{name:'allowlisted_scope',passed:scopeOk,exitCode:null,reason:scopeOk?'SCOPE_MATCH':'OUT_OF_SCOPE'}];
  // Refuse to proceed if any current path is sensitive, even if allowlisted.
  const clean=scope.sensitivePaths.length===0;
  checks.push({name:'sensitive_paths',passed:clean,exitCode:null,reason:clean?'NONE':'REVIEW_REQUIRED'});
  if (input.runDiffCheck===true && scopeOk && clean) {
    // Inspect both unstaged and staged changes. A single `git diff --check`
    // would silently ignore whitespace errors in the Git index.
    for (const [name, args] of [
      ['git_diff_check', ['--no-optional-locks','-c','core.fsmonitor=false','-C',root,'diff','--no-ext-diff','--no-textconv','--check']],
      ['git_staged_diff_check', ['--no-optional-locks','-c','core.fsmonitor=false','-C',root,'diff','--cached','--no-ext-diff','--no-textconv','--check']]
    ] as const) {
      const r=spawnSync('git',args,{encoding:'utf8',timeout:10000,maxBuffer:1048576,windowsHide:true});
      checks.push({name,passed:r.status===0,exitCode:r.status,reason:r.status===0?'PASS':'FAILED_OR_UNKNOWN'});
    }
  } else {
    checks.push({name:'git_diff_check',passed:null,exitCode:null,reason:'NOT_RUN'});
    checks.push({name:'git_staged_diff_check',passed:null,exitCode:null,reason:'NOT_RUN'});
  }
  checks.push({name:'project_acceptance_tests',passed:null,exitCode:null,reason:'NOT_RUN_REQUIRES_EXPLICIT_APPROVAL'});
  return {accepted:false,scopeVerified:scopeOk&&clean,checks,note:'NO_ACCEPTANCE: tests and human task review still required; no automatic rollback.'};
}
