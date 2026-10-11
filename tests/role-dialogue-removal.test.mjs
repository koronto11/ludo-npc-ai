import test from 'node:test';
import assert from 'node:assert/strict';
import {roleDialogueRemovalCommands,dialogueAppearances} from '../src/roleDialogueRemoval.js';
import {roleDialogueTree,addAppearanceDialogues} from '../src/roleDialogueTree.js';

const fixture=()=>({project_id:'project',content:{characters:[{id:'actor',name:'守卫'}],dialogues:[{kind:'dialogue',id:'chat',name:'问候',character_id:'actor'},{kind:'dialogue',id:'other',name:'闲聊',character_id:'actor'}],levels:[{id:'level',name:'营地',tracks:[],appearances:[{id:'visit',character_id:'actor',dialogue_ids:['chat'],behavior:'站岗'},{id:'later',character_id:'actor',dialogue_ids:[]}]}]}});

test('unlinking the final explicit dialogue leaves no inherited dialogue and preserves all other appearances',()=>{
  const base=fixture(),request={graphId:'chat',sceneKey:'level:visit',mode:'unlink'},latest=structuredClone(base);
  latest.content.levels[0].appearances[0].behavior='后来修改的计划';
  const commands=roleDialogueRemovalCommands(base,request,latest);
  const next={...latest,content:{...latest.content,levels:[commands[0].level]}};
  assert.equal(commands.length,1);
  assert.deepEqual(next.content.levels[0].appearances[0].dialogue_ids,[]);
  assert.equal(next.content.levels[0].appearances[0].inherit_dialogues,false);
  assert.equal(next.content.levels[0].appearances[0].behavior,'后来修改的计划');
  assert.deepEqual(roleDialogueTree(next.content,'actor').scenes.map(scene=>scene.dialogues.map(g=>g.id)),[[],['chat','other']]);
  assert.equal(next.content.dialogues,latest.content.dialogues);
  assert.equal(base.content.levels[0].appearances[0].inherit_dialogues,undefined);
});

test('unlinking inherited dialogue materializes only remaining effective links; linking later does not resurrect removed content',()=>{
  const base=fixture(),commands=roleDialogueRemovalCommands(base,{graphId:'chat',sceneKey:'level:later',mode:'unlink'},base);
  const next=commands[0].level;
  assert.deepEqual(next.appearances[1].dialogue_ids,['other']);
  const empty={...next.appearances[0],dialogue_ids:[],inherit_dialogues:false};
  assert.deepEqual(addAppearanceDialogues(base.content,{...next,appearances:[empty]},empty,['other']).appearances[0].dialogue_ids,['other']);
});

test('deleting a dialogue atomically removes its explicit and inherited appearances without deleting other dialogue or author fields',()=>{
  const base=fixture(),commands=roleDialogueRemovalCommands(base,{graphId:'chat',mode:'delete'},base);
  assert.equal(dialogueAppearances(base,'chat').length,2);
  assert.equal(commands.length,2);
  assert.deepEqual(commands[0].level.appearances.map(a=>a.dialogue_ids),[[],['other']]);
  assert.deepEqual(commands[1],{type:'delete_entity',target:{kind:'dialogue',id:'chat'}});
  assert.equal(commands[0].level.appearances[0].behavior,'站岗');
});

test('dialogue and link conflicts reject deletion while unrelated new links do not block one-appearance unlink',()=>{
  const base=fixture(),latest=structuredClone(base),request={graphId:'chat',mode:'delete'};
  latest.content.dialogues[0].name='新版本';assert.throws(()=>roleDialogueRemovalCommands(base,request,latest),/对白已被修改/);
  latest.content.dialogues[0].name='问候';latest.content.levels[0].appearances.push({id:'new',character_id:'actor',dialogue_ids:['chat']});
  assert.throws(()=>roleDialogueRemovalCommands(base,request,latest),/关联已变化/);
  assert.doesNotThrow(()=>roleDialogueRemovalCommands(base,{...request,mode:'unlink',sceneKey:'level:visit'},latest));
});

test('pending records block shared deletion but allow unlinking an appearance',()=>{
  const base=fixture();base.content.drafts=[{id:'draft',name:'候选',target:{kind:'dialogue',id:'chat'}}];
  assert.throws(()=>roleDialogueRemovalCommands(base,{graphId:'chat',mode:'delete'},base),/仍被/);
  assert.doesNotThrow(()=>roleDialogueRemovalCommands(base,{graphId:'chat',mode:'unlink',sceneKey:'level:visit'},base));
});
