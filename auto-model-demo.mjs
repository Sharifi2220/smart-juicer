/** Fully synthetic local demonstration. No model, network, file write, or real usage. */
import {generateKeyPairSync,sign} from 'node:crypto';
import {planAutomaticModel,AUTO_EVIDENCE_SCHEMA} from './auto-model-plan.ts';

const keys=generateKeyPairSync('ed25519');
const now=new Date();
const gitSha='0123456789abcdef0123456789abcdef01234567';
const trials=Array.from({length:30},(_,i)=>{
  const fixture='demo-'+String(i+1).padStart(3,'0');
  const common={fixture,pairId:fixture,taskClass:'ui',accepted:true,review:'independent',
    acceptanceEvidenceId:'synthetic-review-'+fixture,usageEvidenceSource:'codex_jsonl',
    usageEvidenceRef:'synthetic-usage-'+fixture,capturedAt:now.toISOString(),
    cachedInputTokens:10,durationMs:1000,attempts:1,costEur:null};
  return [
    {...common,id:fixture+'-b0',arm:'B0',modelId:null,inputTokens:100,outputTokens:50},
    {...common,id:fixture+'-b1',arm:'B1',modelId:'demo-candidate',inputTokens:70,outputTokens:35}
  ];
}).flat();
const payload=Buffer.from(JSON.stringify({
  schema_version:AUTO_EVIDENCE_SCHEMA,
  candidateModel:'demo-candidate',candidateEffort:'low',taskClass:'ui',
  repositoryCommit:gitSha,generatedAt:new Date(now.valueOf()-1000).toISOString(),
  expiresAt:new Date(now.valueOf()+60_000).toISOString(),trials
}));
const plan=planAutomaticModel({
  task:{schema_version:'v0.1',sourceTrust:'user_direct',originalPrompt:'Change CSS button color',
    fileMetadata:{totalCount:1,changedRelativePaths:['src/button.css'],extensions:['.css']},
    repoSignals:{gitDirty:false,sensitivePathsTouched:false,testsPresent:true}},
  evidence:{payloadBase64:payload.toString('base64'),
    signatureBase64:sign(null,payload,keys.privateKey).toString('base64')},
  host:{trustedEvidencePublicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}).toString(),
    allowlistedModels:['demo-candidate'],repositoryCommit:gitSha}
});
process.stdout.write(JSON.stringify({
  demo:'SYNTHETIC_SELF_SIGNED_NOT_REAL_PROOF',...plan
},null,2)+'\n');
