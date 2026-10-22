import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTag} from './subject.ts';
test('null and missing string fall back',()=>{
  for(const x of [null,undefined,0,{},'  ', '\t'])assert.equal(normalizeTag(x),'unknown');
});
test('trims, normalizes Unicode and case',()=>{
  assert.equal(normalizeTag('  FOO  '),'foo');
  assert.equal(normalizeTag('  E\u0301  '),'é');
});
