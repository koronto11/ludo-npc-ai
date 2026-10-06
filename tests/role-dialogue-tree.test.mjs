import test from 'node:test';
import assert from 'node:assert/strict';
import {roleDialogueTree,resolveRoleContext,addAppearanceDialogues} from '../src/roleDialogueTree.js';

const fixture = () => ({dialogues:[{id:'fire-dialogue',character_id:'actor'},{id:'tent-dialogue',character_id:'actor'},{id:'unused',character_id:'actor'},{id:'foreign',character_id:'other'},{id:'shared',character_id:null}],levels:[{id:'level',name:'营地',tracks:[{id:'fire',name:'篝火'},{id:'tent',name:'医帐'}],appearances:[{id:'fire-visit',character_id:'actor',track_id:'fire',dialogue_ids:['fire-dialogue']},{id:'tent-visit',character_id:'actor',track_id:'tent',dialogue_ids:['tent-dialogue']}]}]});
test('scene-first tree nests graphs under their own occurrence and isolates unlinked graphs',()=>{
  const tree=roleDialogueTree(fixture(),'actor');
  assert.deepEqual(tree.scenes.map(row=>row.dialogues.map(graph=>graph.id)),[['fire-dialogue'],['tent-dialogue']]);
  assert.deepEqual(tree.unlinked.map(graph=>graph.id),['unused']);
  assert.equal(tree.dialogueCount,3);
});
test('legacy empty associations retain default actor dialogue semantics',()=>{
  const c=fixture();c.levels[0].appearances[0].dialogue_ids=[];
  const tree=roleDialogueTree(c,'actor');
  assert.equal(tree.scenes[0].inherited,true);
  assert.deepEqual(tree.scenes[0].dialogues.map(graph=>graph.id),['fire-dialogue','tent-dialogue','unused']);
  assert.equal(tree.unlinked.length,0);
  assert.deepEqual(tree.common.map(graph=>graph.id),['fire-dialogue','unused']);
});
test('shared graphs keep one master identity and appear under each referring occurrence',()=>{
  const c=fixture();for(const a of c.levels[0].appearances)a.dialogue_ids.push('shared');
  const tree=roleDialogueTree(c,'actor');assert.equal(tree.uses.get('shared'),2);
  assert.equal(tree.scenes[0].dialogues.at(-1),tree.scenes[1].dialogues.at(-1));
});
test('repeated visits to the same scene remain separate occurrences',()=>{
  const c=fixture();c.levels[0].appearances.push({...c.levels[0].appearances[0],id:'later-visit'});
  const tree=roleDialogueTree(c,'actor');assert.equal(tree.scenes.length,3);
  assert.notEqual(tree.scenes[0].key,tree.scenes[2].key);
});
test('selecting a scene cannot silently load another scene dialogue',()=>{
  const target=resolveRoleContext(fixture(),'actor',{levelId:'level',appearanceId:'fire-visit',dialogueId:'tent-dialogue'});
  assert.equal(target.scene.appearance.id,'fire-visit');assert.equal(target.graph.id,'fire-dialogue');
});
test('direct graph entry resolves its linked scene while unscoped entry stays general',()=>{
  const c=fixture();assert.equal(resolveRoleContext(c,'actor',{dialogueId:'tent-dialogue'}).scene.appearance.id,'tent-visit');
  assert.equal(resolveRoleContext(c,'actor',{dialogueId:'tent-dialogue',unscoped:true}).scene,null);
  assert.equal(resolveRoleContext(c,'actor',{dialogueId:'unused'}).scene,null);
});
test('adding a reference preserves existing and other occurrence associations without duplication',()=>{
  const c=fixture(),level=c.levels[0],a=level.appearances[0];
  const next=addAppearanceDialogues(c,level,a,['tent-dialogue','tent-dialogue']);
  assert.deepEqual(next.appearances[0].dialogue_ids,['fire-dialogue','tent-dialogue']);
  assert.equal(next.appearances[1],level.appearances[1]);assert.deepEqual(a.dialogue_ids,['fire-dialogue']);
  assert.throws(()=>addAppearanceDialogues(c,level,a,['foreign']),/可使用/);
});
test('adding explicit refs to a default occurrence preserves previously inherited graphs',()=>{
  const c=fixture(),level=c.levels[0],a=level.appearances[0];a.dialogue_ids=[];
  assert.deepEqual(addAppearanceDialogues(c,level,a,['shared']).appearances[0].dialogue_ids,['fire-dialogue','tent-dialogue','unused','shared']);
});
