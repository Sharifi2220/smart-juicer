import test from 'node:test';
import assert from 'node:assert/strict';
import {transition} from './subject.ts';
test('start only works from idle',()=>{
  assert.equal(transition('idle','start'),'running');
  assert.equal(transition('done','start'),'done');
});
test('finish requires running',()=>{
  assert.equal(transition('idle','finish'),'idle');
  assert.equal(transition('running','finish'),'done');
});
test('reset is idempotent regardless of state',()=>{
  for(const phase of ['idle','running','done'])assert.equal(transition(phase,'reset'),'idle');
});
