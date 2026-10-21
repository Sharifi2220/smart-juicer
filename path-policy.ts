/** Pure, conservative path syntax and sensitive-name classification.
 * Not a filesystem permission check. No file/network/process I/O.
 */
const SENSITIVE_DIRS = new Set([
  'auth', 'authentication', 'authorization', 'authorize', 'oauth', 'login',
  'security', 'payment', 'payments', 'billing', 'migration', 'migrations',
  'secret', 'secrets', 'credential', 'credentials', 'deploy', 'production',
  'prod', 'permission', 'permissions', 'rbac', 'iam', '.ssh'
]);
const SENSITIVE_FILES = new Set(['credentials.json','id_rsa','id_ed25519','authorized_keys']);
const SENSITIVE_PREFIXES = /^(?:auth|authentication|authorization|authorize|oauth|login|password|security|payment|billing|migration|secret|credential|deploy|production|prod|permission|access[-_]control|rbac|iam)(?:[._-]|$)/i;

/** Normalize *syntax*; never treat the result as a verified filesystem authorization. */
export function normalizeRelativePath(raw: string): string {
  if (typeof raw !== 'string' || !raw || raw.length > 4096 || raw.includes('\0')) throw new TypeError('INVALID_PATH');
  if (/^(?:[a-z]:|\\\\|\/\/|\/|\\|~)/i.test(raw)) throw new TypeError('ABSOLUTE_OR_DEVICE_PATH');
  const canonical = raw.replace(/\\/g, '/');
  const parts = canonical.split('/');
  // Windows canonicalization can alias visually different names (trailing dot/space,
  // device names) or interpret special characters. Refuse these on ALL hosts so a
  // Linux-generated scope snapshot cannot authorize a different Windows pathname.
  const windowsDevice = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\..*)?$/i;
  if (parts.some(part => !part || part === '.' || part === '..' ||
      /[:<>"|?*\u0001-\u001f\u007f]/u.test(part) || /[. ]$/u.test(part) ||
      /[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(part) || windowsDevice.test(part))) {
    throw new TypeError('TRAVERSAL_OR_UNSAFE_PATH');
  }
  return parts.join('/');
}

/** Conservative sensitive-name heuristic, not a permission decision. */
export function isPathSensitive(raw: string): boolean {
  const parts = normalizeRelativePath(raw).split('/').map(p => p.toLowerCase());
  if (parts.some(p => SENSITIVE_DIRS.has(p))) return true;
  if (parts.some((p, i) => p === '.github' && parts[i+1] === 'workflows')) return true;
  if (parts.some(p => p === '.env' || p.startsWith('.env.'))) return true;
  const file = parts.at(-1)!;
  return SENSITIVE_FILES.has(file) || SENSITIVE_PREFIXES.test(file);
}

