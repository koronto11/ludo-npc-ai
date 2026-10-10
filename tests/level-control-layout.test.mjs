import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutControls,insertionPoint,reorderedControls,dragDelta,dragTimeDelta,edgeScroll} from '../src/levelControlLayout.js';
import {placeAppearance} from '../src/planning.js';
import {moveNpcGroup} from '../src/npcGroups.js';
import {movePlotEvent} from '../src/plotPlanning.js';

const controls=[{key:'event:evt',height:74},{key:'appearance:actor',height:67},{key:'group:npcs',height:64}];
test('empty scene accommodates its measured sidebar without shifting card positions',()=>{
  assert.equal(layoutControls([],[],{},285).height,285);
  const base=layoutControls(controls),longLabel=layoutControls(controls,[],{},510);
  assert.deepEqual(longLabel.positions,base.positions);assert.equal(longLabel.height,510);
});
test('NPC group can move above both event and appearance; heights retain clear gaps',()=>{
  const legacy=layoutControls(controls);
  assert.deepEqual(legacy.rows.map(r=>r.key),controls.map(r=>r.key));
  const landing=insertionPoint(legacy.rows,'group:npcs',21);
  const order=reorderedControls([],controls.map(r=>r.key),'group:npcs',controls.map(r=>r.key),landing.before);
  const changed=layoutControls(controls,order,{'group:npcs':620});
  assert.deepEqual(changed.rows.map(r=>r.key),['group:npcs','event:evt','appearance:actor']);
  assert.equal(changed.positions['event:evt'],652);
  assert.equal(changed.positions['appearance:actor'],738);
  assert.equal(insertionPoint(changed.rows,'group:npcs',999).before,null);
});
test('reordering preserves other scenes, appends newly created controls and ignores deleted ones',()=>{
  const all=['event:other','event:evt','appearance:actor','group:npcs'];
  const result=reorderedControls(['event:other','event:deleted','group:npcs'],all,'group:npcs',['event:evt','appearance:actor'],null);
  assert.deepEqual(result,['event:other','event:evt','appearance:actor','group:npcs']);
  assert.equal(new Set(result).size,result.length);
  assert.deepEqual(reorderedControls(result,all,'group:npcs',[],null),result);
});
test('scrolling contributes to drag position while vertical wobble leaves time intact',()=>{
  const delta=dragDelta({x:300,y:400,scrollLeft:0,scrollTop:100},{x:302,y:100},{left:0,top:80});
  assert.deepEqual(delta,{dx:2,dy:-320});
  assert.equal(dragTimeDelta({...delta,kind:'npc-group'},1,true),0);
  assert.equal(dragTimeDelta({dx:90,dy:10,kind:'appearance'},30,true),3);
  assert.equal(dragTimeDelta({dx:90,dy:10,kind:'appearance',layoutMove:true},30,true),0);
  assert.equal(dragTimeDelta({dx:90,dy:10,kind:'appearance'},30,false),0);
  assert.equal(dragTimeDelta({dx:90,dy:400,kind:'appearance',edge:'end'},30,true),3);
});
test('edge auto-scroll remains inside the board and clears at its center',()=>{
  const rect={left:0,top:0,right:1000,bottom:600};
  assert.deepEqual(edgeScroll({x:500,y:300},rect),{x:0,y:0});
  assert.ok(edgeScroll({x:990,y:590},rect).y>0);
  assert.ok(edgeScroll({x:500,y:90},rect).y<0);
  assert.deepEqual(edgeScroll({x:500,y:610},rect),{x:0,y:0});
});

test('scene-only moves retain intentionally unbound times even when an anchor coincides',()=>{
  const row={id:'actor',track_id:'from',npc_group_id:null,start_tick:2,end_tick:8,start_anchor_id:null,end_anchor_id:'end'};
  const level={id:'level',anchors:[{id:'start',tick:2},{id:'end',tick:8}],tracks:[{id:'from'},{id:'to'}],npc_groups:[{id:'npcs',track_id:'from'}],appearances:[row,{...row,id:'member',npc_group_id:'npcs'}]};
  const individual=placeAppearance(level,row,2,8,'to').appearances[0];
  assert.equal(individual.start_anchor_id,null);
  assert.equal(individual.end_anchor_id,'end');
  const moved=moveNpcGroup(level,'npcs',0,'to').appearances[1];
  assert.equal(moved.start_anchor_id,null);
  assert.equal(moved.end_anchor_id,'end');
});

test('scene-only event moves retain its binding; rescheduling still binds an exact anchor',()=>{
  const level={id:'level',anchors:[{id:'start',tick:2},{id:'end',tick:8}]};
  const event={scheduled_at:2,anchor_id:null};
  assert.equal(movePlotEvent(event,level,2,'to').anchor_id,null);
  assert.equal(movePlotEvent(event,level,8,'to').anchor_id,'end');
});
