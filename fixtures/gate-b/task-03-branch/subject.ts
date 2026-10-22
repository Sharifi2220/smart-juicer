/** Tiny synthetic state machine for controlled mutation verification. */
export type Phase = 'idle'|'running'|'done';
export type Action = 'start'|'finish'|'reset';
export function transition(state:Phase, action:Action):Phase {
  if (action==='reset') return 'idle';
  if (action==='start' && state==='idle') return 'running';
  if (action==='finish' && state==='running') return 'done';
  return state;
}
