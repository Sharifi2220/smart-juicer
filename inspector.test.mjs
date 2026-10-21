import {createRequire, syncBuiltinESMExports} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {normalizeRelativePath,isPathSensitive,verifyPathWithinRoot,inspectGitRepository,assertNoHiddenFilesystemLinks} from './inspector.ts';
import {checkAllowedScope,verifyQuality} from './quality-verifier.ts';
import {summarizeTrials} from './benchmark.ts';
import {planCodexRun} from './codex-wrapper.ts';
const shouldHit=['src/auth.ts','src/auth-service.ts','src/payment-handler.ts','src/password-reset.ts','src/authorization.ts','src/authorize.ts','src/.github/workflows/ci.yml','src/.ssh/authorized_keys','src/.env.production','CLOSED/.env','prod/deploy.yml','src/migration_v2.sql'];
const createDirectoryLink=(target,link)=>{
  try { symlinkSync(target,link,'dir'); return 'symlink'; }
  catch(e) {
    const unavailable=err=>['EPERM','EACCES','ENOTSUP','EOPNOTSUPP'].includes(err?.code);
    if(process.platform!=='win32'||!unavailable(e)) throw e;
    symlinkSync(target,link,'junction'); return 'junction';
  }
};
for(const path of shouldHit) test('sensitive '+path,()=>assert.equal(isPathSensitive(path),true));
for(const path of ['src/authors.ts','src/styles.css','src/paymentHistory.ts','docs/authors/readme.md'])test('neutral '+path,()=>assert.equal(isPathSensitive(path),false));
for(const path of ['../auth.ts','foo/../../etc/passwd','C:\\Windows\\auth.ts','/root/.env','\\\\server\\data','src//login.ts','src/./login.ts','src/null\0.txt','\\root\\auth.ts'])
  test('reject '+JSON.stringify(path),()=>assert.throws(()=>normalizeRelativePath(path)));
test('win separators canonical result',()=>assert.equal(normalizeRelativePath('src\\auth.ts'),'src/auth.ts'));
test('scope does not grant undeclared paths',()=>{assert.equal(checkAllowedScope(['src/styles.css'],['src/styles.css']),true);assert.equal(checkAllowedScope(['src/auth.ts'],['src/styles.css']),false);});
test('UNKNOWN usage is not zero',()=>{const sums=summarizeTrials([{id:'a',fixture:'x',arm:'B0',accepted:true,inputTokens:null,cachedInputTokens:null,outputTokens:9,costEur:null,durationMs:null,attempts:null}]);assert.equal(sums[0].tokensPerAccepted,null);assert.equal(sums[0].missingUsage,1);assert.equal(sums[0].eurosPerAccepted,null);});
test('tokens per accepted task include failed retries',()=>{const x={fixture:'a',arm:'B1',inputTokens:100,cachedInputTokens:10,outputTokens:20,costEur:1,durationMs:10,attempts:1};let r=summarizeTrials([{...x,id:'a',accepted:false},{...x,id:'b',accepted:true}]);assert.equal(r[1].tokensPerAccepted,240);assert.equal(r[1].eurosPerAccepted,2);});
test('invalid measurements rejected',()=>{assert.throws(()=>summarizeTrials([{id:'x',fixture:'f',arm:'B0',accepted:true,inputTokens:1,cachedInputTokens:2,outputTokens:0,costEur:0,durationMs:0,attempts:0}]));});
test('real temp git dirty paths and plan are fail-closed',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-inspect-'));
  try {
    execFileSync('git',['-C',root,'init','-q']);
    mkdirSync(join(root,'src'));writeFileSync(join(root,'src','auth-service.ts'),'export const ok=true;\n');
    const report=inspectGitRepository(root);
    assert.deepEqual(report.changedPaths,['src/auth-service.ts']);assert.deepEqual(report.sensitivePaths,['src/auth-service.ts']);
    assert.equal(verifyQuality({root,allowedPaths:[]}).accepted,false);
    assert.throws(()=>planCodexRun({root,variant:'B0'}),/DIRTY_WORKTREE/);
    assert.equal(verifyPathWithinRoot(root,'src/auth-service.ts'),'src/auth-service.ts');
  } finally {rmSync(root,{recursive:true,force:true});}
});

// On Windows and some cloud-backed filesystems, creating a directory symlink requires
// additional privileges. A junction is an equivalent escape fixture where supported.
// Skip ONLY this filesystem-dependent check if both options are blocked; never mask
// a regression in verifyPathWithinRoot or the ordinary Git/scope assertions above.
test('symlink or junction escape is denied when filesystem supports creating it',(t)=>{
  const root=mkdtempSync(join(tmpdir(),'sj-link-'));
  const outside=mkdtempSync(join(tmpdir(),'sj-outside-'));
  try {
    mkdirSync(join(root,'src'));
    const link=join(root,'src','link');
    try {
      symlinkSync(outside,link,'dir');
    } catch(e) {
      const unavailable=err=>['EPERM','EACCES','ENOTSUP','EOPNOTSUPP'].includes(err?.code);
      if(process.platform!=='win32'||!unavailable(e)) throw e;
      try { symlinkSync(outside,link,'junction'); }
      catch(junctionError) {
        if(!unavailable(junctionError)) throw junctionError;
        t.skip('SYMLINK_AND_JUNCTION_CREATION_BLOCKED_ON_WINDOWS: security check still pending on this host');
        return;
      }
    }
    assert.throws(()=>verifyPathWithinRoot(root,'src/link/outside.ts'),/(SYMLINK|OUTSIDE_REPOSITORY)/);
  } finally {
    rmSync(root,{recursive:true,force:true});
    rmSync(outside,{recursive:true,force:true});
  }
});

test('independent filesystem scan rejects an empty directory link',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-empty-link-'));
  const outside=mkdtempSync(join(tmpdir(),'sj-empty-link-target-'));
  try {
    mkdirSync(join(root,'links'));
    createDirectoryLink(outside,join(root,'links','escape'));
    assert.equal(readdirSync(outside).length,0);
    assert.throws(()=>assertNoHiddenFilesystemLinks(root),/UNENUMERATED_SYMLINK_OR_JUNCTION/);
  } finally {rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});

test('Git-ignored empty directory link is still rejected by the filesystem scan',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-ignored-link-'));
  const outside=mkdtempSync(join(tmpdir(),'sj-ignored-link-target-'));
  try {
    execFileSync('git',['-C',root,'init','-q']);
    writeFileSync(join(root,'.gitignore'),'ignored/\n');
    execFileSync('git',['-C',root,'add','.gitignore']);
    execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','baseline']);
    mkdirSync(join(root,'ignored'));
    createDirectoryLink(outside,join(root,'ignored','escape'));
    assert.equal(execFileSync('git',['-C',root,'status','--porcelain=v1','--untracked-files=all'],{encoding:'buffer'}).length,0);
    assert.throws(()=>assertNoHiddenFilesystemLinks(root),/UNENUMERATED_SYMLINK_OR_JUNCTION/);
  } finally {rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});

test('filesystem entry and depth limits fail closed',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-scan-limits-'));
  try {
    mkdirSync(join(root,'nested','deeper'),{recursive:true});
    writeFileSync(join(root,'one.txt'),'1');
    writeFileSync(join(root,'nested','two.txt'),'2');
    assert.throws(()=>assertNoHiddenFilesystemLinks(root,{maxEntries:1}),/FILESYSTEM_SCAN_LIMIT/);
    assert.throws(()=>assertNoHiddenFilesystemLinks(root,{maxEntries:100,maxDepth:1}),/FILESYSTEM_SCAN_DEPTH_LIMIT/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('nested .git directories are not a filesystem-scan bypass',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-nested-git-link-'));
  const outside=mkdtempSync(join(tmpdir(),'sj-nested-git-link-target-'));
  try {
    mkdirSync(join(root,'nested','.git'),{recursive:true});
    createDirectoryLink(outside,join(root,'nested','.git','escape'));
    assert.throws(()=>assertNoHiddenFilesystemLinks(root),/UNENUMERATED_SYMLINK_OR_JUNCTION/);
  } finally {rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});

test('unused benchmark arm has UNKNOWN duration, not artificial zero',()=>{
  const empty=summarizeTrials([]);
  assert.equal(empty[0].totalDurationMs,null);
  assert.equal(empty[0].tokensPerAccepted,null);
});
test('Codex dry-run on clean temp git stays non-executing',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-clean-'));
  try {
    execFileSync('git',['-C',root,'init','-q']);
    const plan=planCodexRun({root,variant:'B1',model:'model-test-only',effort:'medium'});
    assert.equal(plan.executed,false);assert.equal(plan.usage,null);assert.equal(plan.requiresExplicitHumanApproval,true);
    assert.equal(plan.args.includes('model_reasoning_effort=medium'),true);
  } finally {rmSync(root,{recursive:true,force:true});}
});

// Additional offline regressions. They use disposable repositories only and
// never launch a model or obtain credentials. Not independent blind benchmarks.
import {readFileSync, renameSync, linkSync} from 'node:fs';
import {parseGitPorcelainV1Z} from './inspector.ts';

const encode=s=>Buffer.from(s,'utf8');
test('porcelain parser handles empty worktree snapshot',()=>{
  assert.deepEqual(parseGitPorcelainV1Z(Buffer.alloc(0)),[]);
});
test('porcelain parser includes both sides of reversed -z rename',()=>{
  assert.deepEqual(parseGitPorcelainV1Z(encode('R  src/safe.ts\0src/auth.ts\0')),['src/auth.ts','src/safe.ts']);
});
test('porcelain parser includes both sides of copy',()=>{
  assert.deepEqual(parseGitPorcelainV1Z(encode('C  new/readme.md\0original/readme.md\0')),['new/readme.md','original/readme.md']);
});
test('porcelain parser rejects truncated rename',()=>{
  assert.throws(()=>parseGitPorcelainV1Z(encode('R  new.ts\0')),/INVALID_RENAME_STATUS/);
});
test('porcelain parser rejects incomplete NUL terminator',()=>{
  assert.throws(()=>parseGitPorcelainV1Z(encode('?? untracked.ts')),/UNTERMINATED_GIT_STATUS/);
});
test('porcelain parser rejects invalid UTF-8 bytes',()=>{
  assert.throws(()=>parseGitPorcelainV1Z(Buffer.from([0x3f,0x3f,0x20,0xff,0])),/encoded data|valid|UTF-8/i);
});
test('porcelain parser rejects traversal and Windows absolute paths',()=>{
  for(const p of ['../secret.env','C:\\Windows\\auth.ts','src/../../x','/etc/passwd'])
    assert.throws(()=>parseGitPorcelainV1Z(encode('?? '+p+'\0')));
});
test('porcelain parser preserves Unicode paths without lossy decoding',()=>{
  assert.deepEqual(parseGitPorcelainV1Z(encode('?? src/Änderung_東京.ts\0')),['src/Änderung_東京.ts']);
});
test('porcelain parser deduplicates changed filenames',()=>{
  assert.deepEqual(parseGitPorcelainV1Z(encode(' M src/x.ts\0?? src/x.ts\0')),['src/x.ts']);
});

test('git fixture rename reports both paths, including deleted sensitive origin',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-rename-'));
  try{
    execFileSync('git',['-C',root,'init','-q']);
    mkdirSync(join(root,'src'));
    writeFileSync(join(root,'src','auth-service.ts'),'export const x=1;\n');
    execFileSync('git',['-C',root,'add','src/auth-service.ts']);
    execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','baseline']);
    renameSync(join(root,'src','auth-service.ts'),join(root,'src','styles.ts'));
    execFileSync('git',['-C',root,'add','-A']);
    const report=inspectGitRepository(root);
    assert.deepEqual(report.changedPaths,['src/auth-service.ts','src/styles.ts']);
    assert.deepEqual(report.sensitivePaths,['src/auth-service.ts']);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('git fixture detects Unicode untracked name and unstaged deletion',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-unicode-'));
  try {
    execFileSync('git',['-C',root,'init','-q']);
    mkdirSync(join(root,'src'));
    writeFileSync(join(root,'src','gone.ts'),'gone\n');
    execFileSync('git',['-C',root,'add','src/gone.ts']);
    execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','baseline']);
    rmSync(join(root,'src','gone.ts'));
    writeFileSync(join(root,'src','Änderung_東京.ts'),'new\n');
    const report=inspectGitRepository(root);
    assert.deepEqual(report.changedPaths,['src/gone.ts','src/Änderung_東京.ts']);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('Git read-only snapshot does not rewrite existing index',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-index-'));
  try {
    execFileSync('git',['-C',root,'init','-q']);
    writeFileSync(join(root,'tracked.ts'),'hello\n');
    execFileSync('git',['-C',root,'add','tracked.ts']);
    const before=readFileSync(join(root,'.git','index'));
    inspectGitRepository(root);
    assert.deepEqual(readFileSync(join(root,'.git','index')),before);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('git diff opt-in checks both staged and unstaged whitespace',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-whitespace-'));
  try{
    execFileSync('git',['-C',root,'init','-q']);
    writeFileSync(join(root,'safe.ts'),'export const x=1;\n');
    execFileSync('git',['-C',root,'add','safe.ts']);
    execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','baseline']);
    writeFileSync(join(root,'safe.ts'),'export const x=2;  \n');
    execFileSync('git',['-C',root,'add','safe.ts']);
    // This test checks staged/unstaged *Git diff* semantics, not hardlink safety.
    // Cloud sync sometimes reports fictitious nlink>1 for this harmless file.
    // Replace only the fixture's nlink read with the stable ordinary-file value.
    // Production inspector behavior remains unchanged; real hardlinks are tested
    // separately in 'filesystem scan rejects a hard-linked file alias'.
    const fs = createRequire(import.meta.url)('node:fs');
    const originalLstat=fs.lstatSync;
    let report;
    try {
      fs.lstatSync=function(path,...args){
        const st=originalLstat.call(this,path,...args);
        if(String(path)===join(root,'safe.ts') && st.isFile()) st.nlink=1;
        return st;
      };
      syncBuiltinESMExports();
      report=verifyQuality({root,allowedPaths:['safe.ts'],runDiffCheck:true});
    } finally {
      fs.lstatSync=originalLstat;
      syncBuiltinESMExports();
    }
    assert.equal(report.accepted,false);
    assert.equal(report.scopeVerified,true);
    assert.equal(report.checks.find(c=>c.name==='git_diff_check').passed,true);
    assert.equal(report.checks.find(c=>c.name==='git_staged_diff_check').passed,false);
    assert.equal(report.checks.find(c=>c.name==='project_acceptance_tests').passed,null);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('out-of-scope changes never invoke opt-in diff checks',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-scope-'));
  try{
    execFileSync('git',['-C',root,'init','-q']);
    writeFileSync(join(root,'other.ts'),'untested\n');
    const report=verifyQuality({root,allowedPaths:['expected.ts'],runDiffCheck:true});
    assert.equal(report.scopeVerified,false);
    assert.equal(report.checks.find(c=>c.name==='git_staged_diff_check').passed,null);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('B0 plan never silently changes native Codex model, effort, sandbox',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-native-'));
  try{
    execFileSync('git',['-C',root,'init','-q']);
    const b0=planCodexRun({root,variant:'B0'});
    assert.deepEqual(b0.args,['exec','--json','-']);
    assert.equal(b0.executed,false);
    assert.equal(b0.verifiedModelEntitlement,false);
    assert.equal(b0.usage,null);
    const b1=planCodexRun({root,variant:'B1',model:'fixture-model',effort:'medium'});
    assert.ok(b1.args.includes('model_reasoning_effort=medium'));
    assert.ok(!b1.args.includes('--sandbox'));
  } finally {rmSync(root,{recursive:true,force:true});}
});
for (const [label,rows] of [
  ['duplicate ID across arms',[
    {id:'same',fixture:'one',arm:'B0',accepted:true,inputTokens:1,cachedInputTokens:0,outputTokens:1,costEur:1,durationMs:1,attempts:1},
    {id:'same',fixture:'two',arm:'B1',accepted:true,inputTokens:1,cachedInputTokens:0,outputTokens:1,costEur:1,durationMs:1,attempts:1}]],
] )test('rejects benchmark '+label,()=>assert.throws(()=>summarizeTrials(rows),/DUPLICATE_TRIAL_ID/));

// Additional independent regression checks based on documented Git status and
// Windows filename rules. No network, model call, privileges or global config.
for (const path of ['CON','NUL.txt','AUX','COM1.log','LPT9','src/space ','src/trailing.',
                    'src/a?b.ts','src/evil\u202Ets.txt','src/control\nname']) {
  test('reject ambiguous Windows/Unicode path '+JSON.stringify(path),()=>assert.throws(()=>normalizeRelativePath(path),/UNSAFE_PATH/));
}
for (const status of ['!! ignored.txt\0','X  src/x.ts\0','?M src/x.ts\0','## branch\0']) {
  test('reject unknown porcelain status '+JSON.stringify(status),()=>assert.throws(()=>parseGitPorcelainV1Z(encode(status)),/UNSUPPORTED_GIT_STATUS/));
}
test('reject ambiguous literal backslash from git status',()=>{
  assert.throws(()=>parseGitPorcelainV1Z(encode('?? src\\ambiguous.ts\0')),/AMBIGUOUS_GIT_PATH/);
});
test('B0 refuses model or effort override instead of silently ignoring them',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-b0-guard-'));
  try {
    execFileSync('git',['-C',root,'init','-q']);
    assert.throws(()=>planCodexRun({root,variant:'B0',model:'some-model'}),/B0_FORBIDS_MODEL_EFFORT_OVERRIDES/);
    assert.throws(()=>planCodexRun({root,variant:'B0',effort:'low'}),/B0_FORBIDS_MODEL_EFFORT_OVERRIDES/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('benchmark counts require integers and attempt >= 1',()=>{
  const row={id:'fraction',fixture:'x',arm:'B0',accepted:false,inputTokens:1.5,cachedInputTokens:0,outputTokens:1,costEur:null,durationMs:null,attempts:1};
  assert.throws(()=>summarizeTrials([row]),/INVALID_COUNT/);
  assert.throws(()=>summarizeTrials([{...row,inputTokens:1,attempts:0}]),/INVALID_ATTEMPTS/);
});

test('configured ignored submodule changes still make the scope dirty',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-submodule-host-'));
  const source=mkdtempSync(join(tmpdir(),'sj-submodule-local-source-'));
  const commit=(where,message)=>execFileSync('git',['-C',where,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm',message]);
  try {
    execFileSync('git',['-C',source,'init','-q']);
    writeFileSync(join(source,'sub.ts'),'export const n=1;\n');
    execFileSync('git',['-C',source,'add','sub.ts']);
    commit(source,'submodule baseline');
    execFileSync('git',['-C',root,'init','-q']);
    execFileSync('git',['-C',root,'-c','protocol.file.allow=always','submodule','add','-q',source,'vendor']);
    execFileSync('git',['-C',root,'add','-A']);
    commit(root,'host baseline');
    execFileSync('git',['-C',root,'config','submodule.vendor.ignore','all']);
    writeFileSync(join(root,'vendor','sub.ts'),'export const n=2;\n');
    const report=inspectGitRepository(root);
    assert.equal(report.gitDirty,true);
    assert.ok(report.changedPaths.includes('vendor'));
    assert.throws(()=>planCodexRun({root,variant:'B0'}),/DIRTY_WORKTREE/);
  } finally {
    rmSync(root,{recursive:true,force:true});
    rmSync(source,{recursive:true,force:true});
  }
});

// Deterministic simulation of a rename/replace during readdir (no background race).
// The original scan could accept the replacement; the hardened scan rejects it.
test('filesystem scan fails closed when a queued directory is replaced during readdir',()=>{
  const root=mkdtempSync(join(tmpdir(),'sj-concurrent-rename-'));
  const child=join(root,'victim');
  mkdirSync(child);
  const fs = createRequire(import.meta.url)('node:fs');
  const original=fs.readdirSync;
  let replaced=false;
  try {
    fs.readdirSync=function(path,options){
      if (path === child && !replaced) {
        replaced=true;
        renameSync(child,join(root,'old-victim'));
        mkdirSync(child);
      }
      return original.call(this,path,options);
    };
    syncBuiltinESMExports();
    assert.throws(()=>assertNoHiddenFilesystemLinks(root),/FILESYSTEM_DIRECTORY_CHANGED/);
    assert.equal(replaced,true);
  } finally {
    fs.readdirSync=original;
    syncBuiltinESMExports();
    rmSync(root,{recursive:true,force:true});
  }
});

// Even an entirely in-repo alias may share its inode with a path outside root.
// Decline it as advisory scope rather than granting a clean result.
test('filesystem scan rejects a hard-linked file alias',()=>{
  const holder=mkdtempSync(join(tmpdir(),'sj-hardlink-holder-'));
  const root=join(holder,'repo');
  try {
    mkdirSync(root);
    writeFileSync(join(holder,'shared.txt'),'synthetic only\n');
    linkSync(join(holder,'shared.txt'),join(root,'shared.txt'));
    assert.throws(()=>assertNoHiddenFilesystemLinks(root),/HARDLINK_ALIAS_UNVERIFIED/);
  } finally { rmSync(holder,{recursive:true,force:true}); }
});


// Local preview smoke checks: no real model, no network, no persisted user data.
test('portable local preview demo runs without executing a Codex model',()=>{
  const r=spawnSync(process.execPath,['--no-warnings','--experimental-strip-types','sj-local.ts','--demo'],
    {encoding:'utf8',cwd:process.cwd(),timeout:5000});
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/Codex gestartet: NEIN/);
  assert.match(r.stdout,/Risiko:/);
  assert.equal(r.stderr,'');
});
test('portable local preview documents safe mode',()=>{
  const r=spawnSync(process.execPath,['--no-warnings','--experimental-strip-types','sj-local.ts','--help'],
    {encoding:'utf8',cwd:process.cwd(),timeout:5000});
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/keine Speicherung/i);
});
test('portable local preview rejects unexpected CLI arguments',()=>{
  const r=spawnSync(process.execPath,['--no-warnings','--experimental-strip-types','sj-local.ts','--auto-execute'],
    {encoding:'utf8',cwd:process.cwd(),timeout:5000});
  assert.equal(r.status,2);
  assert.match(r.stderr,/START_FEHLGESCHLAGEN/);
  assert.ok(!r.stdout.includes('Codex gestartet: JA'));
});
