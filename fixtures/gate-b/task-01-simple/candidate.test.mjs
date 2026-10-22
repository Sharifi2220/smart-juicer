import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingBand} from './subject.ts';
test('shipping boundary below/at/above',()=>{
  assert.equal(shippingBand(4999),'paid');assert.equal(shippingBand(5000),'free');
  assert.equal(shippingBand(5001),'free');
});
test('invalid amounts fail closed',()=>{
  for(const x of [-1,1.5,Number.NaN,Infinity])assert.throws(()=>shippingBand(x),/INVALID_AMOUNT/);
});
