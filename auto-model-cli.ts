/** Explicit-file, offline-only automatic model selection plan.
 * Host trust policy is supplied OUTSIDE user evidence via environment variables.
 * Never calls codex exec, writes config, searches sessions or emits prompt text.
 */
import {readFileSync,lstatSync} from 'node:fs';
import {planAutomaticModel} from './auto-model-plan.ts';
const path=process.argv[2];
function readBounded(path:string,max:number):string{
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.size<=0||st.size>max)throw new TypeError('INVALID_AUTO_PLAN_FILE');
  return readFileSync(path,'utf8');
}
try{
  if(process.argv.length!==3||!path)throw new TypeError('USAGE_AUTO_PLAN_EVIDENCE_JSON');
  const x:unknown=JSON.parse(readBounded(path,1024*1024+8192));
  if(!x||typeof x!=='object'||Array.isArray(x))throw new TypeError('INVALID_AUTO_PLAN_INPUT');
  const input=x as Record<string,unknown>;
  // Trusted public key is NOT sourced from the imported JSON document.
  const keyPath=process.env.SMART_JUICER_ROUTER_TRUSTED_KEY_PATH;
  const key=keyPath?readBounded(keyPath,4096):null;
  const models=(process.env.SMART_JUICER_ROUTER_MODELS??'').split(',').filter(Boolean);
  const commit=process.env.SMART_JUICER_ROUTER_COMMIT??'';
  const result=planAutomaticModel({
    task:input.task,
    evidence:input.evidence as never,
    host:{trustedEvidencePublicKeyPem:key,allowlistedModels:models,repositoryCommit:commit}
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){
  process.stderr.write('SMART_JUICER_AUTO_PLAN: '+(error instanceof TypeError?error.message:'INVALID_INPUT_OR_FILE')+'\n');
  process.exitCode=2;
}
