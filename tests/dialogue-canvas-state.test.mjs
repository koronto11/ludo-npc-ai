import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptUserNodes } from '@xyflow/system';
import { updateDialogueNodeState, dialogueCardSelectionChanges } from '../src/dialogueCanvasState.js';

test('measured cards remain initialized through controlled drag frames and text edits', () => {
  const changes = ['__entry', 'greeting', '__end'].map(id => ({ id, type: 'dimensions', dimensions: { width: 280, height: 240 } }));
  let state = updateDialogueNodeState({}, changes);
  const lookup = new Map();
  const parents = new Map();
  for (let frame = 0; frame < 30; frame++) {
    state = updateDialogueNodeState(state, [{ id: 'greeting', type: 'position', position: { x: frame * 10, y: 40 }, dragging: frame < 29 }]);
    const nodes = changes.map(({ id }) => ({ id, position: { x: frame * 10, y: 40 }, data: { text: `edited ${frame}` }, ...state[id] }));
    assert.equal(adoptUserNodes(nodes, lookup, parents).nodesInitialized, true);
    assert.deepEqual(lookup.get('greeting').measured, { width: 280, height: 240 });
  }
  assert.equal(state.greeting.dragging, false);
});

test('text height changes update measurement without losing drag state or other nodes', () => {
  const before = { greeting: { measured: { width: 280, height: 240 }, dragging: true }, __end: { measured: { width: 160, height: 75 } } };
  const after = updateDialogueNodeState(before, [{ id: 'greeting', type: 'dimensions', dimensions: { width: 280, height: 300 } }]);
  assert.deepEqual(after.greeting, { measured: { width: 280, height: 300 }, dragging: true });
  assert.equal(after.__end, before.__end);
  assert.equal(before.greeting.measured.height, 240);
});

test('unchanged dimensions and selection do not cause an update loop or mark author data', () => {
  const before = { greeting: { measured: { width: 280, height: 240 }, dragging: true, selected:true } };
  assert.equal(updateDialogueNodeState(before, [
    { id: 'greeting', type: 'dimensions', dimensions: { width: 280, height: 240 } },
    { id: 'greeting', type: 'select', selected: true },
    { id: 'greeting', type: 'position', position: { x: 500, y: 40 }, dragging: true },
  ]), before);
});

test('controlled multi-selection preserves measured dimensions and can be cleared independently',()=>{
  const initial={a:{measured:{width:280,height:220}}};
  const selected=updateDialogueNodeState(initial,[{id:'a',type:'select',selected:true},{id:'b',type:'select',selected:true}]);
  assert.equal(selected.a.selected,true);
  assert.equal(selected.b.selected,true);
  assert.equal(selected.a.measured,initial.a.measured);
  const cleared=updateDialogueNodeState(selected,[{id:'a',type:'select',selected:false}]);
  assert.equal(cleared.a.selected,false);
  assert.equal(cleared.b.selected,true);
  assert.equal(initial.a.selected,undefined);
});

test('modifier clicks retain disjoint cards even when the inspector owns keyboard focus',()=>{
  const measured={width:280,height:220};
  const before={a:{selected:true,measured},b:{selected:false}};
  const ids=['a','b'];
  const reactFlowCleared=updateDialogueNodeState(before,[{id:'a',type:'select',selected:false},{id:'b',type:'select',selected:true}]);
  const after=updateDialogueNodeState(reactFlowCleared,dialogueCardSelectionChanges(before,ids,'b',true));
  assert.equal(after.a.selected,true);assert.equal(after.b.selected,true);
  assert.equal(after.a.measured,measured);
  const toggled=updateDialogueNodeState(after,dialogueCardSelectionChanges(after,ids,'a',true));
  assert.equal(toggled.a.selected,false);assert.equal(toggled.b.selected,true);
  const single=updateDialogueNodeState(after,dialogueCardSelectionChanges(after,ids,'a',false));
  assert.equal(single.a.selected,true);assert.equal(single.b.selected,false);
  assert.equal(before.b.selected,false);
});
