/** Offline-only parser for StrykerJS mutation-testing-elements JSON reports.
 * The result is IMPORTED_UNVERIFIED: a trusted, isolated host must authenticate
 * the process, the fixture, the tests, and the actual bytes before accepting it.
 * No process, agent, network request or third-party tool is started here.
 */
import { createHash } from 'node:crypto';

const HEX = /^[a-f0-9]{64}$/;
const ALLOWED = new Set(['Killed','Survived','NoCoverage','CompileError','RuntimeError','Timeout','Ignored','Pending']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MAX_REPORT_BYTES = 8 * 1024 * 1024;
const object = (v:unknown):v is Record<string,unknown> => v!==null && typeof v==='object' && !Array.isArray(v);
const sha = (data:Buffer|string):string => createHash('sha256').update(data).digest('hex');

export interface StrykerReportExpectation {
  /** Exact relative key of the single original source file mutated in this task. */
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly requiredMutationKills: number;
  /** Independently registered number of eligible mutants. No opportunistic omissions. */
  readonly expectedMutationCount: number;
}
export interface StrykerReportAssessment {
  readonly sourcePath:string;
  readonly sourceSha256:string;
  readonly reportSha256:string;
  readonly totalMutants:number;
  readonly killed:number;
  readonly survived:number;
  readonly invalid:number;
  readonly acceptedByReportRules:boolean;
  readonly evidenceTrust:'IMPORTED_UNVERIFIED';
  readonly reasons:readonly string[];
}
/** Never use this parser's acceptedByReportRules as authenticated PilotVerifier.accepted. */
export function assessStrykerReport(raw: Buffer|string, expectation:StrykerReportExpectation):StrykerReportAssessment {
  if(!expectation || typeof expectation.sourcePath!=='string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.\-/]{0,199}$/.test(expectation.sourcePath) ||
    expectation.sourcePath.startsWith('/') || expectation.sourcePath.split('/').includes('..') ||
    !HEX.test(expectation.sourceSha256) ||
    !Number.isSafeInteger(expectation.requiredMutationKills) || expectation.requiredMutationKills<1 ||
    !Number.isSafeInteger(expectation.expectedMutationCount) ||
    expectation.expectedMutationCount<expectation.requiredMutationKills || expectation.expectedMutationCount>1000)
    throw new TypeError('INVALID_STRYKER_EXPECTATION');
  if(!(typeof raw==='string' || Buffer.isBuffer(raw))) throw new TypeError('INVALID_STRYKER_REPORT');
  const buffer=Buffer.isBuffer(raw)?raw:Buffer.from(raw,'utf8');
  if(buffer.length===0 || buffer.length>MAX_REPORT_BYTES) throw new TypeError('STRYKER_REPORT_SIZE');
  let value:unknown;
  try {value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}
  catch {throw new TypeError('INVALID_STRYKER_REPORT_JSON');}
  if(!object(value) || !/^([12])(?:\.(?:0|[1-9]\d*)){0,2}$/.test(String(value.schemaVersion??'')) ||
    !object(value.thresholds) || !object(value.files))
    throw new TypeError('INVALID_STRYKER_SCHEMA');
  const paths=Object.keys(value.files);
  if(paths.length!==1 || paths[0]!==expectation.sourcePath)throw new TypeError('STRYKER_SOURCE_SCOPE_MISMATCH');
  const file=value.files[paths[0]];
  if(!object(file) || typeof file.language!=='string' || typeof file.source!=='string' ||
    !Array.isArray(file.mutants)) throw new TypeError('INVALID_STRYKER_FILE');
  if(sha(file.source)!==expectation.sourceSha256)throw new TypeError('STRYKER_SOURCE_BYTES_MISMATCH');
  const reasons:string[]=[];
  if(file.mutants.length!==expectation.expectedMutationCount)reasons.push('MUTATION_COUNT_MISMATCH');
  let killed=0,survived=0,invalid=0;
  const ids=new Set<string>();
  for(const mutant of file.mutants){
    if(!object(mutant) || typeof mutant.id!=='string' || !ID.test(mutant.id) || ids.has(mutant.id) ||
      typeof mutant.mutatorName!=='string' || !mutant.mutatorName ||
      !object(mutant.location) || !ALLOWED.has(String(mutant.status)))
      throw new TypeError('INVALID_STRYKER_MUTANT');
    ids.add(mutant.id);
    if(mutant.status==='Killed')killed++;
    else if(mutant.status==='Survived')survived++;
    else invalid++;
  }
  if(killed<expectation.requiredMutationKills)reasons.push('INSUFFICIENT_MUTATION_KILLS');
  if(survived)reasons.push('SURVIVING_MUTANTS');
  if(invalid)reasons.push('UNRESOLVED_OR_ERROR_MUTANTS');
  if(file.mutants.length===0)reasons.push('EMPTY_MUTATION_REPORT');
  return Object.freeze({sourcePath:expectation.sourcePath,sourceSha256:expectation.sourceSha256,
    reportSha256:sha(buffer),totalMutants:file.mutants.length,killed,survived,invalid,
    acceptedByReportRules:reasons.length===0,evidenceTrust:'IMPORTED_UNVERIFIED' as const,
    reasons:Object.freeze(reasons)});
}
