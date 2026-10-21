/** Smart Juicer – safe developmental CLI. No hidden agent runs or paid API calls. */
import { codexDoctor, planCodexRun, type Variant, type Effort } from './codex-wrapper.ts';
import { inspectGitRepository } from './inspector.ts';
import { verifyQuality } from './quality-verifier.ts';
import { summarizeTrials, type Trial } from './benchmark.ts';
import { readFileSync, statSync } from 'node:fs';
const [command, root, arm, model, effort] = process.argv.slice(2);
function output(x:unknown){process.stdout.write(JSON.stringify(x,null,2)+'\n');}
try {
  switch(command){
    case 'doctor': output(codexDoctor()); break;
    case 'inspect': if(!root)throw new TypeError('USAGE_INSPECT_ROOT');output(inspectGitRepository(root));break;
    case 'plan':
      if(!root||!arm)throw new TypeError('USAGE_PLAN_ROOT_VARIANT_MODEL_EFFORT');
      output(planCodexRun({root,variant:arm as Variant,model,effort:effort as Effort|undefined}));break;
    case 'stats':
      if(!root) throw new TypeError('USAGE_STATS_JSON_PATH');
      if(statSync(root).size>1024*1024) throw new TypeError('BENCHMARK_DATA_TOO_LARGE');
      { const trials: unknown=JSON.parse(readFileSync(root,'utf8'));
        if(!Array.isArray(trials) || trials.length>10000) throw new TypeError('INVALID_BENCHMARK_DATA');
        output(summarizeTrials(trials as Trial[])); }
      break;
    case 'verify':
      if(!root)throw new TypeError('USAGE_VERIFY_ROOT');
      // No allowlist -> any dirty worktree fails closed.
      output(verifyQuality({root,allowedPaths:[]}));break;
    default: throw new TypeError('USAGE_DOCTOR_INSPECT_PLAN_VERIFY_STATS');
  }
} catch(e){process.stderr.write('SMART_JUICER: '+(e instanceof TypeError?e.message:'INTERNAL_ERROR')+'\n');process.exitCode=2;}
