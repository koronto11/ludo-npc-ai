import assert from 'node:assert/strict';
import test from 'node:test';
import { appearanceLabel, appearancesFor, moveAnchor, removeAnchor, removeTrack, placeAppearance } from '../src/planning.js';

const level = () => ({id:'camp',name:'营地关卡',axis_mode:'phase',anchors:[{id:'arrival',name:'进入营地',tick:0},{id:'leave',name:'离开营地',tick:10}],tracks:[{id:'fire',name:'篝火',location_id:'camp-location'}],appearances:[{id:'eve-fire',character_id:'eve',track_id:'fire',start_tick:0,end_tick:10,start_anchor_id:'arrival',end_anchor_id:'leave',dialogue_ids:[],condition:{op:'always'}}]});

test('moving an anchor moves bound endpoints and rejects an inverted appearance',()=>{
  const original=level(); const next=moveAnchor(original,'leave',12);
  assert.equal(next.appearances[0].end_tick,12); assert.equal(original.appearances[0].end_tick,10);
  assert.throws(()=>moveAnchor(original,'arrival',11),/结束早于开始/);
});
test('removing anchors and scene tracks keeps appearances and their time range',()=>{
  const next=removeTrack(removeAnchor(level(),'leave'),'fire');
  assert.equal(next.appearances.length,1); assert.equal(next.appearances[0].end_tick,10);
  assert.equal(next.appearances[0].end_anchor_id,null); assert.equal(next.appearances[0].track_id,null);
});
test('rescheduling an appearance releases obsolete anchor bindings and binds exact new ticks',()=>{
  const original=level(); const moved=placeAppearance(original,original.appearances[0],2,10,'fire');
  assert.equal(moved.appearances[0].start_anchor_id,null); assert.equal(moved.appearances[0].end_anchor_id,'leave');
  assert.equal(moved.appearances.length,1);
});
test('overview indexes repeated appearances by character without flattening scene references',()=>{
  const first=level(); const second={...level(),id:'next',name:'第二关'};
  const rows=appearancesFor({levels:[first,second]},'eve');
  assert.equal(rows.length,2); assert.equal(rows[1].track.name,'篝火');
  assert.equal(appearanceLabel(rows[1].level,rows[1].appearance),'第二关 · 篝火 · 进入营地 → 离开营地');
});
