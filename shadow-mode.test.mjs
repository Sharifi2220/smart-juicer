import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {
  formatShadowReport,
  loadExplicitShadowFile,
  parseCodexJsonl,
  parseImportedUsageData,
  summarizeShadow,
  SYNTHETIC_SHADOW_RECORDS
} from './shadow-mode.ts';

const nativeSynthetic = {found:true, version:'codex-cli synthetic', configChanged:false, inferenceCalled:false};

test('synthetic usage envelope preserves nulls and produces a conservative recommendation',()=>{
  const document=JSON.parse(readFileSync('shadow-synthetic.json','utf8'));
  const records=parseImportedUsageData(document);
  assert.equal(records.length,3);
  assert.equal(records[2].model,null);
  assert.equal(records[2].inputTokens,null);
  const summary=summarizeShadow(records,nativeSynthetic);
  assert.equal(summary.mode,'PASSIVE_SHADOW');
  assert.equal(summary.usage.inputTokens,null);
  assert.equal(summary.usage.cachedInputTokens,null);
  assert.equal(summary.usage.outputTokens,null);
  assert.equal(summary.usage.failedAttempts,null);
  assert.equal(summary.recommendation.action,'KEEP_NATIVE_DEFAULT');
  assert.equal(summary.recommendation.autoApply,false);
  assert.equal(summary.nativeCodex.inferenceCalled,false);
});

test('codex JSONL parser reads only whitelisted metadata and never returns event text',()=>{
  const jsonl=[
    JSON.stringify({type:'thread.started',thread_id:'thread-1'}),
    JSON.stringify({type:'turn/started',turn_id:'turn-1',model:'gpt-synthetic',reasoning_effort:'high',started_at:'2026-10-21T10:00:00.000Z'}),
    JSON.stringify({type:'item.completed',turn_id:'turn-1',item:{type:'agent_message',text:'PRIVATE PROMPT MUST NOT ESCAPE'}}),
    JSON.stringify({type:'turn/completed',turn_id:'turn-1',status:'completed',completed_at:'2026-10-21T10:00:01.250Z',usage:{input_tokens:12,cached_input_tokens:7,output_tokens:4},quality_status:'PASS'})
  ].join('\n');
  const records=parseCodexJsonl(jsonl,'codex_app_server');
  assert.equal(records.length,1);
  assert.equal(records[0].model,'gpt-synthetic');
  assert.equal(records[0].thinkingEffort,'high');
  assert.equal(records[0].inputTokens,12);
  assert.equal(records[0].cachedInputTokens,7);
  assert.equal(records[0].outputTokens,4);
  assert.equal(records[0].durationMs,1250);
  assert.equal(records[0].qualityStatus,'PASS');
  assert.equal(JSON.stringify(records).includes('PRIVATE PROMPT'),false);
});

test('id-less lifecycle events follow turn boundaries and item.completed does not prove turn quality',()=>{
  const jsonl=[
    JSON.stringify({type:'thread.started',thread_id:'thread-without-turn-id'}),
    JSON.stringify({type:'turn.started',model:'gpt-implicit',reasoning_effort:'medium',started_at:'2026-10-21T10:00:00.000Z'}),
    JSON.stringify({type:'item.completed',item:{type:'agent_message',accepted:true,text:'PRIVATE PROMPT MUST NOT ESCAPE'}}),
    JSON.stringify({type:'turn.completed',status:'completed',completed_at:'2026-10-21T10:00:01.000Z'})
  ].join('\n');
  const records=parseCodexJsonl(jsonl);
  assert.equal(records.length,1);
  assert.equal(records[0].id,'implicit-turn-1');
  assert.equal(records[0].status,'completed');
  assert.equal(records[0].qualityStatus,'UNKNOWN');
  assert.equal(records[0].inputTokens,null);
  assert.equal(records[0].cachedInputTokens,null);
  assert.equal(records[0].outputTokens,null);
  assert.equal(records[0].durationMs,1000);
  assert.equal(JSON.stringify(records).includes('PRIVATE PROMPT'),false);
});

test('multiple id-less turns remain separate and standalone items do not create turns',()=>{
  const jsonl=[
    JSON.stringify({type:'item.completed',accepted:true}),
    JSON.stringify({type:'turn.started'}),
    JSON.stringify({type:'item.completed',accepted:true}),
    JSON.stringify({type:'turn.completed',status:'completed'}),
    JSON.stringify({type:'turn.started'}),
    JSON.stringify({type:'item.completed',accepted:true}),
    JSON.stringify({type:'turn.completed',status:'completed'})
  ].join('\n');
  const records=parseCodexJsonl(jsonl);
  assert.equal(records.length,2);
  assert.deepEqual(records.map(record=>record.id),['implicit-turn-1','implicit-turn-2']);
  assert.deepEqual(records.map(record=>record.status),['completed','completed']);
  assert.deepEqual(records.map(record=>record.qualityStatus),['UNKNOWN','UNKNOWN']);
});

test('turn.started status cannot complete a turn without a terminal event',()=>{
  const jsonl=JSON.stringify({type:'turn.started',turn_id:'turn-contradictory',status:'completed'});
  const records=parseCodexJsonl(jsonl);
  assert.equal(records.length,1);
  assert.equal(records[0].status,'unknown');
  assert.equal(records[0].qualityStatus,'UNKNOWN');
});

test('completed turn without failed-attempt evidence keeps failedAttempts unknown',()=>{
  const jsonl=[
    JSON.stringify({type:'turn.started',turn_id:'turn-no-failure-evidence'}),
    JSON.stringify({type:'turn.completed',turn_id:'turn-no-failure-evidence',status:'completed'})
  ].join('\n');
  const records=parseCodexJsonl(jsonl);
  assert.equal(records.length,1);
  assert.equal(records[0].status,'completed');
  assert.equal(records[0].failedAttempts,null);
  assert.equal(summarizeShadow(records,nativeSynthetic).usage.failedAttempts,null);
});

test('explicit app-server turn IDs remain separate even when events are adjacent',()=>{
  const jsonl=[
    JSON.stringify({method:'turn/started',params:{turn:{id:'rpc-a',model:'gpt-a'}}}),
    JSON.stringify({method:'turn/completed',params:{turn:{id:'rpc-a',status:'completed'}}}),
    JSON.stringify({method:'turn/started',params:{turn:{id:'rpc-b',model:'gpt-b'}}}),
    JSON.stringify({method:'turn/completed',params:{turn:{id:'rpc-b',status:'completed'}}})
  ].join('\n');
  const records=parseCodexJsonl(jsonl,'codex_app_server');
  assert.equal(records.length,2);
  assert.deepEqual(records.map(record=>record.id),['rpc-a','rpc-b']);
  assert.deepEqual(records.map(record=>record.model),['gpt-a','gpt-b']);
});

test('failed and incomplete events remain visible as failed/unknown metadata',()=>{
  const jsonl=[
    JSON.stringify({type:'turn.started',turn_id:'turn-fail'}),
    JSON.stringify({type:'turn.failed',turn_id:'turn-fail',status:'failed'}),
    JSON.stringify({type:'turn/completed',turn_id:'turn-unknown',status:'completed',usage:{input_tokens:3,output_tokens:2}})
  ].join('\n');
  const records=parseCodexJsonl(jsonl);
  assert.equal(records.length,2);
  const failed=records.find(record=>record.id==='turn-fail');
  const unknown=records.find(record=>record.id==='turn-unknown');
  assert.equal(failed.status,'failed');
  assert.equal(failed.failedAttempts,1);
  assert.equal(unknown.qualityStatus,'UNKNOWN');
  assert.equal(unknown.cachedInputTokens,null);
  assert.ok(unknown.noteCodes.includes('CACHED_TOKENS_UNKNOWN'));
});

test('app-server JSON-RPC method/params envelopes are normalized without reading prompt fields',()=>{
  const jsonl=[
    JSON.stringify({method:'thread/started',params:{thread:{id:'thread-rpc'}}}),
    JSON.stringify({method:'turn/started',params:{turn:{id:'turn-rpc',model:'gpt-rpc',reasoning_effort:'low',started_at:'2026-10-21T10:00:00.000Z'}}}),
    JSON.stringify({method:'turn/completed',params:{turn:{id:'turn-rpc',status:'completed',completed_at:'2026-10-21T10:00:00.500Z',usage:{input_tokens:5,cached_input_tokens:2,output_tokens:1},input:'PRIVATE PROMPT'}}})
  ].join('\n');
  const records=parseCodexJsonl(jsonl,'codex_app_server');
  assert.equal(records.length,1);
  assert.equal(records[0].id,'turn-rpc');
  assert.equal(records[0].thinkingEffort,'low');
  assert.equal(records[0].durationMs,500);
  assert.equal(JSON.stringify(records).includes('PRIVATE PROMPT'),false);
});

test('invalid imports fail closed and no raw prompt is printed in the report',()=>{
  assert.throws(()=>parseImportedUsageData({schema_version:'v0.2-shadow',sourceTrust:'user_direct',privacyMode:'metadata_only',records:[]}),/INVALID_SHADOW_IMPORT_CONTRACT/);
  assert.throws(()=>parseCodexJsonl('{"type":"turn/completed","usage":{"input_tokens":-1}}'),/INVALID_SHADOW_INPUT_TOKENS/);
  const report=formatShadowReport(summarizeShadow(SYNTHETIC_SHADOW_RECORDS,nativeSynthetic));
  assert.equal(report.includes('synthetic-css'),false);
  assert.equal(report.includes('PRIVATE PROMPT'),false);
  assert.match(report,/Automatische Anwendung: NEIN/);
});

test('explicit file loader accepts the metadata-only synthetic file and does not scan a live session',()=>{
  const records=loadExplicitShadowFile('shadow-synthetic.json');
  assert.equal(records.length,3);
  assert.ok(records.every(record=>record.source==='usage_json'));
});
