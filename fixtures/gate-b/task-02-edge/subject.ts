/** Synthetic parser fixture; no user strings are ingested by the pilot. */
export function normalizeTag(value: unknown):string {
  if (typeof value !== 'string') return 'unknown';
  const trimmed=value.trim().normalize('NFC');
  return trimmed.length===0 ? 'unknown' : trimmed.toLocaleLowerCase('en-US');
}
