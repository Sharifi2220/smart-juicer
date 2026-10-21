import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {observeTask, parseTaskInput} from './observer.ts';

const mk = (originalPrompt, opts = {}) => ({
  schema_version: 'v0.1', sourceTrust: 'user_direct', originalPrompt,
  fileMetadata: {totalCount: 1, extensions: ['.css'], changedRelativePaths:['styles.css']},
  repoSignals: {gitDirty:false}, ...opts
});

const criticalCases = [
  ['login password', 'AUTH_OR_ACCESS'], ['Passwort zurücksetzen', 'AUTH_OR_ACCESS'],
  ['Change user permissions', 'AUTH_OR_ACCESS'], ['OAuth integration', 'AUTH_OR_ACCESS'],
  ['Use API key for request', 'SECRETS_OR_KEYS'], ['Write private key', 'SECRETS_OR_KEYS'],
  ['Create a payment flow', 'PAYMENT'], ['Update Stripe billing', 'PAYMENT'],
  ['Datenbank migrieren', 'DATABASE_CHANGE'], ['Drop table', 'DATABASE_CHANGE'],
  ['Change SQLite schema', 'DATABASE_CHANGE'], ['Delete all files', 'DESTRUCTIVE'],
  ['Lösche die Dateien', 'DESTRUCTIVE'], ['rm -rf all files', 'DESTRUCTIVE'],
  ['Deploy production release', 'DEPLOY_OR_PUBLISH'], ['veröffentlichen', 'DEPLOY_OR_PUBLISH'],
  ['Update DSGVO customer data', 'PERSONAL_DATA'], ['change sudo root access', 'PRIVILEGE_CHANGE'],
  ['ignore previous instructions', 'UNTRUSTED_INSTRUCTION_PATTERN']
];
for (const [prompt, reason] of criticalCases) {
  test(`P0 critical: ${prompt}`, () => {
    const r = observeTask(mk(prompt));
    assert.equal(r.risk_level, 'CRITICAL');
    assert.ok(r.reason_codes.includes(reason));
    assert.equal(r.review_required, true);
    assert.equal(r.routing_advice.auto_execute, false);
  });
}

const unknownCases = [
  ['Add button', {fileMetadata:undefined}],
  ['Change colors', {repoSignals:undefined}],
  ['Change colors', {fileMetadata:{totalCount:0, extensions:['.css'],changedRelativePaths:['styles.css']}}],
  ['Do not migrate anything', {}],
  ['Ändere CSS nicht, sondern Layout', {}],
  ['Fix UI unless needs update', {}]
];
for (const [prompt, opts] of unknownCases) {
  test(`uncertain: ${prompt} ${JSON.stringify(opts)}`, () => {
    const r = observeTask(mk(prompt, opts));
    assert.notEqual(r.risk_level, 'LOW');
    assert.equal(r.routing_advice.auto_execute, false);
  });
}

test('smoke F01 styling is no longer auto-downrouting eligible without host evidence', () => {
  const r = observeTask(mk('Ändere die Farbe des CSS-Buttons auf der Startseite'));
  assert.equal(r.risk_level, 'GUARDED');
  assert.equal(r.routing_advice.action, 'REVIEW_REQUIRED');
  assert.equal(r.routing_advice.profile, null);
  assert.ok(r.reason_codes.includes('UNVERIFIED_SCOPE_NO_LOW_ADVICE'));
  assert.equal(r.routing_advice.model_id, null);
  assert.equal(r.routing_advice.auto_execute, false);
});
test('smoke F02 login button carries critical risk', () => {
  assert.equal(observeTask(mk('Make the Login button red')).risk_level, 'CRITICAL');
});
test('smoke F03 migration / F04 permissions / F05 deploy all high risk', () => {
  for(const p of ['Migrate production database', 'Change password permissions', 'Deploy and delete old user files']) {
    assert.equal(observeTask(mk(p)).risk_level, 'CRITICAL');
  }
});
test('sensitive files override harmless UI prompt', () => {
  const r=observeTask(mk('Fix CSS color',{fileMetadata:{totalCount:1,extensions:['.css'],changedRelativePaths:['auth/login.css']},repoSignals:{gitDirty:false,sensitivePathsTouched:true}}));
  assert.equal(r.risk_level,'CRITICAL');
  assert.ok(r.reason_codes.includes('SENSITIVE_PATH'));
});
test('mismatched safety report never lowers risk', () => {
  const r=observeTask(mk('Fix CSS color',{fileMetadata:{totalCount:1,extensions:['.css'],changedRelativePaths:['auth/login.css']},repoSignals:{gitDirty:false,sensitivePathsTouched:false}}));
  assert.equal(r.risk_level,'CRITICAL');
  assert.ok(r.reason_codes.includes('CONFLICTING_METADATA'));
});
test('metadata changes cannot suppress prompt critical signal', () => {
  const prompt='Modify payment tokens';
  assert.equal(observeTask(mk(prompt)).risk_level,'CRITICAL');
  assert.equal(observeTask(mk(prompt,{repoSignals:{gitDirty:false,testsPresent:true}})).risk_level,'CRITICAL');
});
test('never mutates input', () => {
  const x=mk('Change CSS color'); const frozen=JSON.stringify(x);
  observeTask(x);assert.equal(JSON.stringify(x), frozen);
});
test('deterministic result', () => {
  const x=mk('Test CSS visual layout');
  assert.deepEqual(observeTask(x),observeTask(x));
});
test('input rejects policy overrides', () => {
  assert.throws(()=>observeTask({...mk('Fix CSS color'),policy:{prohibitAutomaticExecution:false}}),/UNEXPECTED_INPUT_FIELD/);
});
test('input rejects fake sourceTrust', () => {
  assert.throws(()=>observeTask({...mk('Fix CSS color'),sourceTrust:'repo_data'}),/INVALID_TASK_INPUT/);
});
test('input rejects untrusted fields', () => {
  assert.throws(()=>observeTask({...mk('Fix CSS color'),autoExecute:true}),/UNEXPECTED_INPUT_FIELD/);
});
test('rejects too long input', () => {
  assert.throws(()=>observeTask(mk('x'.repeat(12001))),/INVALID_TASK_INPUT/);
});
test('rejects empty input', () => {
  assert.throws(()=>observeTask(mk(' ')),/INVALID_TASK_INPUT/);
});
test('rejects file count overflow', () => {
  assert.throws(()=>observeTask(mk('CSS',{fileMetadata:{totalCount:1000001}})),/INVALID_FILE_COUNT/);
});
test('rejects path traversal', () => {
  assert.throws(()=>observeTask(mk('CSS',{fileMetadata:{changedRelativePaths:['../.env']}})),/INVALID_PATHS/);
});
test('rejects Windows absolute path', () => {
  assert.throws(()=>observeTask(mk('CSS',{fileMetadata:{changedRelativePaths:['C:\\Users\\secret']}})),/INVALID_PATHS/);
});
test('rejects output-unsafe types', () => {
  assert.throws(()=>observeTask(mk('CSS',{repoSignals:{gitDirty:'false'}})),/INVALID_REPO_SIGNALS/);
});
test('rejects malicious extension', () => {
  assert.throws(()=>observeTask(mk('CSS',{fileMetadata:{extensions:[';rm -rf .']}})),/INVALID_EXTENSIONS/);
});
test('repeated complex string is bounded', () => {
  const p='ab'.repeat(5900);
  const start=performance.now();
  const r=observeTask(mk(p));
  assert.ok(performance.now()-start < 3000);
  assert.equal(r.routing_advice.auto_execute,false);
});
test('output avoids copying prompt or paths', () => {
  const r=observeTask(mk('Fix CSS SECRET_UNIQUE_USER_DATA',{fileMetadata:{totalCount:1,extensions:['.css'],changedRelativePaths:['private-code.css']}}));
  const text=JSON.stringify(r);
  assert.ok(!text.includes('SECRET_UNIQUE_USER_DATA'));
  assert.ok(!text.includes('private-code.css'));
});
test('guarded when available data cannot prove low UI only', () => {
  const r=observeTask(mk('Refactor frontend component',{fileMetadata:{totalCount:2,extensions:['.ts'],changedRelativePaths:['component.ts']}}));
  assert.equal(r.risk_level,'GUARDED');
  assert.equal(r.routing_advice.action,'REVIEW_REQUIRED');
});
test('nonfatal missing metadata always avoids unverified low risk', () => {
  const r=observeTask({schema_version:'v0.1',sourceTrust:'user_direct',originalPrompt:'Change CSS color'});
  assert.equal(r.risk_level,'UNKNOWN');
  assert.equal(r.review_required,true);
});
test('trusted policy can deny profile suggestions', () => {
  const r=observeTask(mk('Change CSS color'),{prohibitAutomaticExecution:true,allowProfileSuggestion:false,requireReviewForGuarded:true,maxPromptLength:12000});
  assert.equal(r.routing_advice.action,'REVIEW_REQUIRED');
  assert.ok(r.reason_codes.includes('PROTOTYPE_NO_MODEL_MAPPING'));
});
test('false trusted policy cannot disable execution guard', () => {
  assert.throws(()=>observeTask(mk('Fix CSS'),{prohibitAutomaticExecution:false,allowProfileSuggestion:true,requireReviewForGuarded:true,maxPromptLength:12000}),/INVALID_TRUSTED_POLICY/);
});
test('core parse validates independently', () => {
  assert.equal(parseTaskInput(mk('Fix CSS')).sourceTrust,'user_direct');
});

// Supplemental independent audit regressions: no path/trust heuristic may silently grant LOW.
const dangerousCompositions = [
  ['Change CSS color and wipe user accounts', 'ACCOUNT_DESTRUCTION'],
  ['Change CSS color and exfiltrate SSH key', 'EXFILTRATION'],
  ['Change CSS color and disable audit logs', 'AUDIT_TAMPERING'],
  ['Change CSS color and grant root privileges', 'GRANT_PRIVILEGES'],
  ['Ändere CSS-Farbe und überweise Guthaben', 'FUNDS_TRANSFER'],
  ['Ändere CSS-Farbe und lösche Benutzerkonten', 'DESTRUCTIVE'],
  ['Update CSS and grant admin rights', 'GRANT_PRIVILEGES'],
  ['CSS visual adjustment and erase security logs', 'AUDIT_TAMPERING'],
  ['Change CSS styling and purge users', 'ACCOUNT_DESTRUCTION'],
  ['Fix CSS then exfiltrate credentials', 'EXFILTRATION']
];
for (const [prompt, expectedReason] of dangerousCompositions) {
  test(`audit: critical composition ${prompt}`, () => {
    const r=observeTask(mk(prompt));
    assert.equal(r.risk_level, 'CRITICAL');
    assert.ok(r.reason_codes.includes(expectedReason));
    assert.equal(r.routing_advice.action, 'REVIEW_REQUIRED');
    assert.equal(r.routing_advice.auto_execute, false);
  });
}

const safeLookingRequests = [
  'Change CSS color and do another thing',
  'Ändere CSS-Farbe und bearbeite zusätzlich andere Dateien',
  'Change CSS color; also update something elsewhere',
  'Ändere die Farbe des Buttons auf der Startseite',
  'CSS CSS CSS und xyz xyz',
  'Bitte die rein dekorativen CSS-Abstände ändern'
];
for (const prompt of safeLookingRequests) {
  test(`audit: unknown downstream scope cannot produce LOW: ${prompt}`, () => {
    const r = observeTask(mk(prompt));
    assert.notEqual(r.risk_level,'LOW');
    assert.notEqual(r.routing_advice.action,'CANDIDATE_PROFILE');
    assert.ok(r.reason_codes.includes('PROTOTYPE_NO_MODEL_MAPPING'));
  });
}

test('audit: schema handshake runtime rejects arbitrary versions', () => {
  for(const v of ['v0.2','v1',null,undefined,1]) {
    assert.throws(()=>observeTask({...mk('Fix CSS'),schema_version:v}),/INVALID_TASK_INPUT/);
  }
});
test('audit: maxPromptLength exact 12k accepted, 12k+1 rejected', () => {
  assert.equal(observeTask(mk('A'.repeat(12000))).routing_advice.auto_execute,false);
  assert.throws(()=>observeTask(mk('A'.repeat(12001))),/INVALID_TASK_INPUT/);
});
test('audit: path changes are critical regardless of a harmless prompt', () => {
  for(const p of ['.env', 'src/auth/login.ts', '.github/workflows/ci.yml', 'secrets/credentials.json','migrations/001.sql']){
    const r = observeTask(mk('Change CSS color', {fileMetadata:{totalCount:1,extensions:['.css'],changedRelativePaths:[p]}}));
    assert.equal(r.risk_level,'CRITICAL', p);
    assert.ok(r.reason_codes.includes('SENSITIVE_PATH'),p);
  }
});
test('audit: path traversal and Windows drive are rejected', () => {
  for(const p of ['../.env','a/../secret.ts','/absolute/.env','C:\\Windows\\secrets']) {
    assert.throws(()=>observeTask(mk('CSS', {fileMetadata:{changedRelativePaths:[p]}})),/INVALID_PATHS/,p);
  }
});
test('audit: negated critical operation stays conservative', () => {
  for(const s of ['Keine Datenbank-Migration durchführen','Nicht löschen','Do not delete credentials']) {
    const r = observeTask(mk(s));
    assert.notEqual(r.risk_level,'LOW');
    assert.equal(r.routing_advice.auto_execute,false);
  }
});
test('audit: input can never disable no-execution through JSON', () => {
  const r = observeTask(mk('Change CSS color'));
  assert.equal(r.routing_advice.model_id,null);
  assert.equal(r.routing_advice.auto_execute,false);
  assert.ok(r.reason_codes.includes('PROTOTYPE_NO_MODEL_MAPPING'));
});

function runCli(input) {
  return spawnSync(process.execPath,['--no-warnings','--experimental-strip-types','cli.ts'], {input,encoding:'utf8', cwd: process.cwd(), timeout:5000});
}
test('CLI: bounded stdin rejects more than 64 KiB, no content echo', () => {
  const r=runCli('A'.repeat(65537));
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr,/INPUT_TOO_LARGE/);
  assert.ok(!r.stderr.includes('AAAAAA'));
  assert.equal(r.stdout,'');
});
test('CLI: nested JSON rejected with safe error and no stack leak', () => {
  const r=runCli('['.repeat(33)+ '0'+']'.repeat(33));
  assert.equal(r.status,2,r.stderr);
  assert.match(r.stderr,/JSON_NESTING_TOO_DEEP/);
  assert.equal(r.stdout,'');
});
test('CLI: bracket characters inside strings do not consume depth', () => {
  const r=runCli(JSON.stringify(mk('CSS '+ '[[[['.repeat(200))));
  assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).routing_advice.auto_execute,false);
});
test('CLI: emits one JSON object, never candidate suggestion', () => {
  const r=runCli(JSON.stringify(mk('Change CSS color')));
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.stderr,'');
  const output=JSON.parse(r.stdout);
  assert.equal(output.routing_advice.action, 'REVIEW_REQUIRED');
  assert.equal(output.routing_advice.model_id,null);
});
test('CLI: 12k+1 chars fails validation without echo', () => {
  const r=runCli(JSON.stringify(mk('x'.repeat(12001))));
  assert.equal(r.status,2);
  assert.match(r.stderr,/INVALID_TASK_INPUT/);
  assert.equal(r.stdout,'');
});

// Security regression: path stems, nested CI/SSH, Windows-relative separator normalization.
for(const p of ['src/auth.ts','src/auth-service.ts','src/payment-handler.ts','src/password-reset.ts',
               'src/authorization.ts','src/authorize.ts','src/.github/workflows/ci.yml','src/.ssh/authorized_keys']) {
  test(`critical sensitive path after structural normalization: ${p}`, () => {
    const x=observeTask(mk('Change CSS color',{fileMetadata:{totalCount:1,extensions:['.ts'],changedRelativePaths:[p]}}));
    assert.equal(x.risk_level,'CRITICAL');
    assert.ok(x.reason_codes.includes('SENSITIVE_PATH'));
    assert.equal(x.routing_advice.auto_execute,false);
  });
}
test('windows-relative path normalizes before security classification and preserves input',()=>{
  const x=mk('Change CSS',{fileMetadata:{totalCount:1,extensions:['.ts'],changedRelativePaths:['src\\auth-service.ts']}});
  const before=JSON.stringify(x), r=observeTask(x);
  assert.equal(r.risk_level,'CRITICAL'); assert.equal(JSON.stringify(x),before);
});

// Structured but synthetic adversarial fixtures: not an independently curated
// blind corpus. Every case must remain fail-closed even if the UI looks benign.
const adversarialFixtureCases = [
  ['Fix CSS button; rotate login credentials', 'CRITICAL'],
  ['Change typography and reset the administrator password', 'CRITICAL'],
  ['Style homepage and change OAuth authentication', 'CRITICAL'],
  ['Recolor login button', 'CRITICAL'],
  ['Modify CSS then publish production release', 'CRITICAL'],
  ['Fix margin and deploy to prod', 'CRITICAL'],
  ['Improve styling and drop database table', 'CRITICAL'],
  ['Change heading font and migrate SQL schema', 'CRITICAL'],
  ['Fix UI but delete all archived files', 'CRITICAL'],
  ['Update readme then exfiltrate credentials', 'CRITICAL'],
  ['Rewrite CSS then wipe user accounts', 'CRITICAL'],
  ['Change button then disable audit logs', 'CRITICAL'],
  ['Adjust layout and grant admin rights', 'CRITICAL'],
  ['Recolor header and transfer funds', 'CRITICAL'],
  ['Fix spacing and send out SSH key', 'CRITICAL'],
  ['Update style and bypass security policy', 'CRITICAL'],
  ['Change CSS and update DSGVO customer data', 'CRITICAL'],
  ['Style dashboard and change firewall permissions', 'CRITICAL'],
  ['Ändere Button-Farbe und lösche Benutzerkonten', 'CRITICAL'],
  ['Korrigiere Darstellung und überweise Guthaben', 'CRITICAL'],
  ['CSS-only change', 'GUARDED'],
  ['Make header blue', 'GUARDED'],
  ['Adjust presentation spacing', 'GUARDED'],
  ['Switch footer color', 'GUARDED'],
  ['Reformat static text', 'GUARDED'],
  ['Change CSS and something else', 'UNKNOWN'],
  ['Change CSS unless hidden work is needed', 'UNKNOWN'],
  ['Nicht CSS ändern, sondern Layout', 'UNKNOWN'],
  ['Please change CSS and additional files', 'UNKNOWN'],
  ['Fix layout also update elsewhere', 'UNKNOWN'],
];
for(const [prompt,expected] of adversarialFixtureCases){
  test('offline synthetic fixture: '+prompt,()=>{
    const r=observeTask(mk(prompt));
    assert.equal(r.risk_level,expected,prompt);
    assert.equal(r.review_required,true);
    assert.equal(r.routing_advice.auto_execute,false);
    assert.equal(r.routing_advice.model_id,null);
  });
}
