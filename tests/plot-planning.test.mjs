import test from 'node:test';
import assert from 'node:assert/strict';
import { movePlotEvent, plotsForActor, plotScopeLabel } from '../src/plotPlanning.js';

test('event movement uses target scene and binds only an exact anchor', () => {
  const level={id:'level',anchors:[{id:'arrival',tick:5}]};
  assert.deepEqual(movePlotEvent({},level,5,'fire'),{scheduled_at:5,scope:{level_id:'level',track_id:'fire'},anchor_id:'arrival'});
  assert.deepEqual(movePlotEvent({},level,7,null),{scheduled_at:7,scope:{level_id:'level',track_id:null},anchor_id:null});
});
test('actor lookup includes effect targets and declared associations without duplicates', () => {
  const row={id:'event',affected_character_ids:['keeper'],effects:[{character_id:'keeper'},{character_id:'helper'}]};
  const content={events:[row],rules:[{id:'rule',effects:[{character_id:'helper'}]}]};
  assert.deepEqual(plotsForActor(content,'helper').map(row=>row.id),['event','rule']);
  assert.equal(plotsForActor(content,'keeper').length,1);
});
test('scope labels distinguish global, whole level and scene', () => {
  const content={levels:[{id:'camp',name:'营地',tracks:[{id:'fire',name:'篝火'}]}]};
  assert.equal(plotScopeLabel({},content),'全局');
  assert.equal(plotScopeLabel({scope:{level_id:'camp',track_id:null}},content),'营地 · 整个关卡');
  assert.equal(plotScopeLabel({scope:{level_id:'camp',track_id:'fire'}},content),'营地 · 篝火');
});
