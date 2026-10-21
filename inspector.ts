/** Smart Juicer – read-only repository scope inspector (development, not an authorization boundary).
 * Requires an explicitly selected, already existing git repository. No file contents are read.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { normalizeRelativePath, isPathSensitive } from './path-policy.ts';

// Git may otherwise refresh .git/index or invoke a repository-configured fsmonitor
// helper while collecting what looks like read-only metadata.
const GIT_READONLY_OPTIONS = ['--no-optional-locks', '-c', 'core.fsmonitor=false'] as const;
export { normalizeRelativePath, isPathSensitive } from './path-policy.ts';

/** Check real filesystem path and every existing ancestor, rejecting any symlink.
 * Root must be realpath-resolved and itself explicitly authorized by its owner.
 */
export function verifyPathWithinRoot(root: string, relativePath: string): string {
  const clean = normalizeRelativePath(relativePath);
  const base = realpathSync(root);
  const absolute = resolve(base, ...clean.split('/'));
  const inside = relative(base, absolute);
  if (!inside || inside === '..' || inside.startsWith('..'+sep) || isAbsolute(inside)) throw new TypeError('OUTSIDE_REPOSITORY');
  let cursor = base;
  for (const item of clean.split('/')) {
    cursor = resolve(cursor, item);
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new TypeError('SYMLINK_NOT_ALLOWED');
      const canonical = realpathSync(cursor);
      const diff = relative(base, canonical);
      if (diff === '..' || diff.startsWith('..'+sep) || isAbsolute(diff)) throw new TypeError('OUTSIDE_REPOSITORY');
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') break;
      throw e;
    }
  }
  return clean;
}

/**
 * Git intentionally omits empty untracked directories and most ignored entries.
 * Inspect real directory entries independently so a hidden empty junction/symlink
 * cannot make a read-only advisory snapshot look clean. Never follows links.
 * Fail closed on unreadable/unstable/oversized trees; NOT an OS sandbox or a
 * defense against concurrent replacement (TOCTOU).
 */
export function assertNoHiddenFilesystemLinks(root: string, limits: {maxEntries?: number; maxDepth?: number} = {}): void {
  const base = realpathSync(root);
  const maxEntries = limits.maxEntries ?? 30000;
  const maxDepth = limits.maxDepth ?? 64;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    throw new TypeError('INVALID_SCAN_LIMIT');
  }
  // Record the identity of each queued directory. A directory can be replaced
  // while it waits in the queue; never trust an earlier stat at open time.
  // This detects some races but cannot make pathname-based Node I/O atomic.
  const rootStat = lstatSync(base);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new TypeError('FILESYSTEM_ROOT_CHANGED');
  type PendingDir = {absolute:string; relative:string; depth:number; dev:number; ino:number; mtimeMs:number};
  const pending: PendingDir[] = [{absolute:base,relative:'',depth:0,dev:rootStat.dev,ino:rootStat.ino,mtimeMs:rootStat.mtimeMs}];
  let entries = 0;
  while (pending.length) {
    const current = pending.pop()!;
    // Revalidate immediately before and after opening a queued directory.
    // An attacker may still exchange path components between these syscalls;
    // handle-bound/no-follow access is needed at a future execution boundary.
    const checkQueuedDirectory = (): void => {
      const st = lstatSync(current.absolute);
      if (st.isSymbolicLink() || !st.isDirectory() || st.dev !== current.dev ||
          st.ino !== current.ino || st.mtimeMs !== current.mtimeMs) {
        throw new TypeError('FILESYSTEM_DIRECTORY_CHANGED');
      }
      const canonical = realpathSync(current.absolute);
      const inside = relative(base, canonical);
      if (inside === '..' || inside.startsWith('..'+sep) || isAbsolute(inside)) {
        throw new TypeError('UNENUMERATED_DIRECTORY_ESCAPE');
      }
    };
    checkQueuedDirectory();
    const children = readdirSync(current.absolute, {withFileTypes:true});
    checkQueuedDirectory();
    for (const child of children) {
      if (++entries > maxEntries) throw new TypeError('FILESYSTEM_SCAN_LIMIT');
      const name = normalizeRelativePath(child.name);
      const relativePath = current.relative ? current.relative + '/' + name : name;
      const absolute = resolve(current.absolute, name);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) throw new TypeError('UNENUMERATED_SYMLINK_OR_JUNCTION');
      if (metadata.isDirectory()) {
        // Reject other directory redirections (e.g. reparse/mount targets)
        // whenever resolution leaves the explicitly selected Git root.
        const canonical = realpathSync(absolute);
        const inside = relative(base, canonical);
        if (inside === '..' || inside.startsWith('..'+sep) || isAbsolute(inside)) {
          throw new TypeError('UNENUMERATED_DIRECTORY_ESCAPE');
        }
        // .git internals are Git implementation data, not worktree entries.
        // The .git entry itself has already been checked for link status.
        if (current.relative === '' && name === '.git') continue;
        if (current.depth + 1 > maxDepth) throw new TypeError('FILESYSTEM_SCAN_DEPTH_LIMIT');
        pending.push({absolute,relative:relativePath,depth:current.depth+1,dev:metadata.dev,ino:metadata.ino,mtimeMs:metadata.mtimeMs});
      } else if (metadata.isFile()) {
        // A hard-linked worktree file may also be writable through a path
        // outside the selected repository, even though it is no symlink.
        // This strict advisory mode declines such aliases (including legit ones).
        if (metadata.nlink > 1) throw new TypeError('HARDLINK_ALIAS_UNVERIFIED');
      } else {
        throw new TypeError('UNSUPPORTED_FILESYSTEM_ENTRY');
      }
    }
  }
}

export interface ScopeReport {
  readonly root: string;
  readonly changedPaths: readonly string[];
  readonly sensitivePaths: readonly string[];
  readonly gitDirty: boolean;
  readonly validForAdviceOnly: true;
  readonly warnings: readonly string[];
}

/** Parse Git porcelain-v1 -z, including BOTH sides of rename/copy records.
 * Git encodes rename entries as "XY destination\0source\0" (-z reverses the
 * human-readable order). All input is strictly decoded; malformed data fails closed.
 * Parsing syntax is not filesystem authorization.
 */
export function parseGitPorcelainV1Z(raw: Uint8Array): string[] {
  const status = new TextDecoder('utf-8', {fatal:true}).decode(raw);
  if (!status) return [];
  if (!status.endsWith('\0')) throw new TypeError('UNTERMINATED_GIT_STATUS');
  const records = status.slice(0,-1).split('\0');
  const found: string[] = [];
  for (let i=0; i<records.length; i++) {
    const item = records[i];
    if (item.length < 4 || item[2] !== ' ') throw new TypeError('INVALID_GIT_STATUS');
    const xy = item.slice(0,2);
    // The documented porcelain v1 alphabet is finite. Unknown status bytes or
    // ignored `!!` entries must not be silently treated as ordinary changes.
    if (xy !== '??' && !/^[ MTADRCU][ MTADRCU]$/.test(xy)) throw new TypeError('UNSUPPORTED_GIT_STATUS');
    const path = item.slice(3);
    // Git -z names are POSIX-repository paths; a literal backslash has different
    // meaning on Linux vs Windows and must never be reinterpreted as a separator.
    if (path.includes('\\')) throw new TypeError('AMBIGUOUS_GIT_PATH');
    found.push(normalizeRelativePath(path));
    if (/[RC]/.test(xy)) {
      if (++i >= records.length) throw new TypeError('INVALID_RENAME_STATUS');
      if (records[i].includes('\\')) throw new TypeError('AMBIGUOUS_GIT_PATH');
      found.push(normalizeRelativePath(records[i]));
    }
  }
  return [...new Set(found)].sort();
}

/** A read-only snapshot. Recheck immediately before every authorized write/tool call:
 * a prior snapshot does NOT prevent TOCTOU or represent Git's complete permission model.
 */
export function inspectGitRepository(root: string): ScopeReport {
  const canonicalRoot = realpathSync(root);
  const gitRoot = execFileSync('git', [...GIT_READONLY_OPTIONS, '-C', canonicalRoot, 'rev-parse', '--show-toplevel'],
    {encoding:'utf8', timeout:5000, windowsHide:true}).trim();
  const canonicalGitRoot = realpathSync(gitRoot);
  // Git may render the same Windows path with different separators or casing
  // (notably on hosted runners). Compare canonical paths semantically while
  // still requiring both paths to resolve to the exact same filesystem root.
  if (relative(canonicalRoot, canonicalGitRoot) !== '' || relative(canonicalGitRoot, canonicalRoot) !== '') {
    throw new TypeError('ROOT_MUST_BE_GIT_TOPLEVEL');
  }
  const raw = execFileSync('git', [...GIT_READONLY_OPTIONS, '-C', canonicalRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none', '--renames'],
    {encoding:'buffer', timeout:10000, maxBuffer:2*1024*1024, windowsHide:true});
  const changedPaths = parseGitPorcelainV1Z(raw);
  // Git status alone does not enumerate empty untracked junctions or ignored
  // symlinks. Fail closed if the independent bounded filesystem scan cannot
  // exclude them. This remains advisory, not authorization for future writes.
  assertNoHiddenFilesystemLinks(canonicalRoot);
  // Do not infer write access from tracked/untracked names or a Git snapshot.
  for (const path of changedPaths) verifyPathWithinRoot(canonicalRoot, path);
  return Object.freeze({root:canonicalRoot, changedPaths, sensitivePaths:changedPaths.filter(isPathSensitive), gitDirty:changedPaths.length>0, validForAdviceOnly:true as const,
    warnings:['SELF_REPORTED_PROMPT_NOT_TRUSTED','SCOPE_SNAPSHOT_NOT_EXECUTION_AUTHORIZATION','RECHECK_BEFORE_ANY_WRITE','IGNORED_AND_SUBMODULE_CONTENT_NOT_FULLY_ENUMERATED']});
}
