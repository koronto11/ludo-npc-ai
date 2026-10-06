import test from 'node:test';
import assert from 'node:assert/strict';
import {resizedControlWidth} from '../src/controlWidths.js';

test('drag deltas resize width within readable bounds',()=>{
  assert.equal(resizedControlWidth('group',620,-200),420);
  assert.equal(resizedControlWidth('group',620,-1000),280);
  assert.equal(resizedControlWidth('event',210,-100),180);
  assert.equal(resizedControlWidth('event',210,1500),1200);
  assert.equal(resizedControlWidth('group',420,20),440);
});
