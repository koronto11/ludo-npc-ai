import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNavigation } from '../src/navigationGuard.js';

test('cancel leaves edits and destination untouched', async () => {
  let touched = false;
  assert.equal(await resolveNavigation([{save:()=>{touched=true;}}], 'cancel', ()=>{touched=true;}), false);
  assert.equal(touched, false);
});
test('navigation waits for successful persistence', async () => {
  const order = [];
  let release;
  const saving = resolveNavigation([{save:()=>new Promise(resolve=>{release=resolve;order.push('saving');})}], 'save', ()=>order.push('navigate'));
  assert.deepEqual(order, ['saving']);
  release(true);
  await saving;
  assert.deepEqual(order, ['saving','navigate']);
});
test('a failed save cannot navigate away from the draft', async () => {
  let navigated = false;
  await assert.rejects(resolveNavigation([{save:async()=>false}], 'save', ()=>{navigated=true;}));
  assert.equal(navigated, false);
});
test('storage errors keep navigation blocked', async () => {
  let navigated = false;
  await assert.rejects(resolveNavigation([{save:async()=>{throw new Error('文件保存失败');}}], 'save', ()=>{navigated=true;}), /文件保存失败/);
  assert.equal(navigated, false);
});
test('discard finishes before entering the destination', async () => {
  const order = [];
  await resolveNavigation([{discard:()=>{order.push('discard');return true;}}], 'discard', ()=>order.push('navigate'));
  assert.deepEqual(order, ['discard','navigate']);
});
test('an editor already saving cannot be discarded or saved twice', async () => {
  let touched = false;
  await assert.rejects(resolveNavigation([{busy:true,discard:()=>{touched=true;return true;}}], 'discard', ()=>{touched=true;}), /正在保存/);
  assert.equal(touched, false);
});
