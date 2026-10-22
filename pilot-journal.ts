/** Durable, host-owned pilot event journal. Never creates or runs a coding agent.
 * The exclusive .lock must be cleared MANUALLY after a hard crash and integrity check.
 * fsync is a durability request to the host OS, not a guarantee against faulty disks or cloud sync.
 */
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { evaluatePilot, nextPilotEvent, sealPilotManifest } from './pilot-contract.ts';
import type { PilotEvent, PilotEventInput, PilotManifest } from './pilot-contract.ts';

const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
/** A sync journal cannot enforce NTFS ACLs: the trusted host must secure the parent directory. */
const LOCK_UNLINK_ATTEMPTS = 4;
function fsyncParentDirectory(file: string): void {
  // A flushed new file alone is not proof the directory entry survived power loss.
  // On Windows, Node does not expose an equivalent portable directory fsync contract.
  if (process.platform === 'win32') return;
  const dirfd = openSync(dirname(file), 'r');
  try { fsyncSync(dirfd); } finally { closeSync(dirfd); }
}
/** Bounded Windows-friendly cleanup. Any unexpected lock loss stays an error. */
export function releasePilotJournalLock(lockPath: string, remove: (path:string)=>void = unlinkSync): void {
  for (let attempt=0;attempt<LOCK_UNLINK_ATTEMPTS;attempt++) {
    try { remove(lockPath); return; }
    catch (err) {
      const code=(err as NodeJS.ErrnoException)?.code;
      if ((code!=='EBUSY' && code!=='EPERM') || attempt===LOCK_UNLINK_ATTEMPTS-1) throw err;
      // Short bounded blocking pause only after a committed, fsynced journal append.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25*(attempt+1));
    }
  }
  throw new TypeError('JOURNAL_LOCK_RELEASE_FAILED');
}
const RECORD_SCHEMA = 'smart-juicer-pilot-journal-v0.6';
function requireHostPin(sha256: string, env: NodeJS.ProcessEnv): void {
  if (!/^[0-9a-f]{64}$/.test(sha256) || env.SMART_JUICER_PILOT_MANIFEST_SHA256 !== sha256)
    throw new TypeError('HOST_MANIFEST_NOT_PINNED');
}
interface JournalHeader { readonly schemaVersion: typeof RECORD_SCHEMA; readonly manifestSha256: string; }
const within = (root: string, target: string) => {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
function checkLocation(file: string, agentWorkspaceRoot: string): string {
  if (!isAbsolute(file) || !isAbsolute(agentWorkspaceRoot)) throw new TypeError('ABSOLUTE_PATH_REQUIRED');
  const parent = realpathSync.native(dirname(resolve(file)));
  const agent = realpathSync.native(resolve(agentWorkspaceRoot));
  const actual = join(parent, basename(file));
  if (within(agent, actual)) throw new TypeError('JOURNAL_INSIDE_AGENT_WORKSPACE');
  if (existsSync(actual)) {
    const info = lstatSync(actual);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new TypeError('UNSAFE_JOURNAL_FILE');
  }
  return actual;
}
function writeAll(fd: number, text: string): void {
  const bytes = Buffer.from(text, 'utf8');
  let at = 0;
  while (at < bytes.length) {
    const n = writeSync(fd, bytes, at, bytes.length - at);
    if (n <= 0) throw new TypeError('JOURNAL_WRITE_FAILED');
    at += n;
  }
  fsyncSync(fd);
}
function readRaw(file: string): {header: JournalHeader; events: PilotEvent[]} {
  const raw = readFileSync(file);
  if (raw.length === 0 || raw.length > MAX_JOURNAL_BYTES || raw.at(-1) !== 10) throw new TypeError('INVALID_JOURNAL_BOUNDARY');
  // A partial final record is intentionally NOT auto-repaired; recovery is manual.
  let records: unknown[];
  try { records = raw.toString('utf8').trimEnd().split('\n').map(s => JSON.parse(s)); }
  catch { throw new TypeError('INVALID_JOURNAL_JSON'); }
  const header = records.shift() as JournalHeader | undefined;
  if (!header || header.schemaVersion !== RECORD_SCHEMA || !/^[0-9a-f]{64}$/.test(header.manifestSha256))
    throw new TypeError('INVALID_JOURNAL_HEADER');
  return {header, events: records as PilotEvent[]};
}
/** Read only a pre-created journal and verify every event against its pinned manifest. */
export function readPilotJournal(manifest: PilotManifest, manifestSha256: string, file: string, agentWorkspaceRoot: string, hostEnv: NodeJS.ProcessEnv = process.env): readonly PilotEvent[] {
  requireHostPin(manifestSha256, hostEnv);
  if (sealPilotManifest(manifest).sha256 !== manifestSha256) throw new TypeError('MANIFEST_HASH_MISMATCH');
  const path = checkLocation(file, agentWorkspaceRoot);
  const {header,events} = readRaw(path);
  if (header.manifestSha256 !== manifestSha256) throw new TypeError('JOURNAL_MANIFEST_MISMATCH');
  evaluatePilot(manifest, manifestSha256, events); // validates transitions and complete hash chain
  return events;
}
/** Create the journal exactly once before the first agent run. Not an executable harness. */
export function createPilotJournal(manifest: PilotManifest, hostPinnedSha256: string, file: string, agentWorkspaceRoot: string, hostEnv: NodeJS.ProcessEnv = process.env): void {
  requireHostPin(hostPinnedSha256, hostEnv);
  if (sealPilotManifest(manifest).sha256 !== hostPinnedSha256) throw new TypeError('HOST_MANIFEST_MISMATCH');
  const path = checkLocation(file, agentWorkspaceRoot);
  const fd = openSync(path, 'wx', 0o600);
  try { writeAll(fd, JSON.stringify({schemaVersion:RECORD_SCHEMA,manifestSha256:hostPinnedSha256})+'\n'); }
  finally { closeSync(fd); }
  fsyncParentDirectory(path);
}
/** Each append uses an exclusive creation-only lock and fsync before returning.
 * If a process crashes while holding the lock, leave it for operator inspection.
 */
export function appendPilotEventDurable(manifest: PilotManifest, hostPinnedSha256: string, file: string,
  agentWorkspaceRoot: string, input: PilotEventInput, hostEnv: NodeJS.ProcessEnv = process.env): PilotEvent {
  requireHostPin(hostPinnedSha256, hostEnv);
  if (sealPilotManifest(manifest).sha256 !== hostPinnedSha256) throw new TypeError('HOST_MANIFEST_MISMATCH');
  const path = checkLocation(file, agentWorkspaceRoot);
  const lock = path + '.lock';
  const lockFd = openSync(lock, 'wx', 0o600);
  let completed = false;
  try {
    const {header,events} = readRaw(path);
    if (header.manifestSha256 !== hostPinnedSha256) throw new TypeError('JOURNAL_MANIFEST_MISMATCH');
    const event = nextPilotEvent(manifest, hostPinnedSha256, events, input);
    const fd = openSync(path, 'a', 0o600);
    try { writeAll(fd, JSON.stringify(event)+'\n'); }
    finally { closeSync(fd); }
    const replayed = readPilotJournal(manifest, hostPinnedSha256, path, agentWorkspaceRoot, hostEnv);
    if (replayed.length !== events.length+1 || replayed.at(-1)?.eventHash !== event.eventHash)
      throw new TypeError('JOURNAL_READBACK_MISMATCH');
    completed = true;
    return event;
  } finally {
    closeSync(lockFd);
    // Do not remove the lock after any write/readback error. Manual integrity review required.
    if (completed) releasePilotJournalLock(lock);
  }
}
