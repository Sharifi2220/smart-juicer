/** Advisory canonical file-scope guard for a disposable benchmark fixture.
 * Do not treat this snapshot as an OS sandbox, capability token, or TOCTOU guarantee.
 */
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Works for existing targets and a new final file whose parent already exists. */
export function assertPilotPathWithinRoot(root: string, target: string, newFile = false): string {
  if (!isAbsolute(root) || !isAbsolute(target)) throw new TypeError('ABSOLUTE_PATH_REQUIRED');
  const canonicalRoot = realpathSync.native(resolve(root));
  // A new-file claim must not mask a preexisting symlink or overwrite target.
  if (newFile) {
    try { lstatSync(resolve(target)); throw new TypeError('TARGET_ALREADY_EXISTS'); }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  // For new files, verify their real parent rather than resolving a nonexistent leaf.
  const canonicalTarget = newFile
    ? join(realpathSync.native(dirname(resolve(target))), basename(target))
    : realpathSync.native(resolve(target));
  const rel = relative(canonicalRoot, canonicalTarget);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new TypeError('OUTSIDE_PILOT_ROOT');
  // A preexisting link, including a link replaced between checks, is not authorized.
  if (!newFile) {
    const info = lstatSync(resolve(target));
    if (info.isSymbolicLink()) throw new TypeError('LINK_TARGET_NOT_ALLOWED');
    if (info.isFile() && info.nlink !== 1) throw new TypeError('MULTILINK_TARGET_NOT_ALLOWED');
  }
  // The caller must still enforce OS sandboxing and repeat checks at effect boundaries.
  return rel;
}
