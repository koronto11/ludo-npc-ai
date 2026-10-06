import assert from 'node:assert/strict';
import test from 'node:test';
import {dialogueCheck,followNodes,independentNodes,linkageCommands} from '../src/appearanceDialogue.js';
function fixture(){
 const condition={op:'all',conditions:[{op:'scene',location_id:'fire'},{op:'time',comparison:'gte',value:10},{op:'time',comparison:'lte',value:20},{op:'variable',variable_id:'injured',comparison:'eq',value:true}]};
 const graph={id:'graph',kind:'dialogue',name:'救助',character_id:'npc',nodes:[{id:'opening',text:'你好',condition,effects:[],options:[{id:'answer',text:'受伤了',condition:{op:'always'},effects:[],target_node_id:null}]}]};
 const appearance={id:'a',character_id:'npc',track_id:'clinic',start_tick:30,end_tick:40,dialogue_ids:['graph'],condition:{op:'always'}};
 const level={id:'level',name:'关卡',axis_mode:'time',anchors:[],tracks:[{id:'clinic',name:'医帐',location_id:'clinic'}],appearances:[appearance]};
 const content={levels:[level],dialogues:[graph],drafts:[{status:'accepted',target:{id:'graph'},scene_context:{level_id:'level',appearance_id:'a',location_id:'fire',start_tick:10,end_tick:20}}]};
 return {content,level,appearance,graph};
}
test('fixed scope conflicts are found and follow conversion retains gameplay conditions and all text',()=>{
 const {content,level,appearance,graph}=fixture(),before=structuredClone(graph);
 assert.equal(dialogueCheck(content,level,appearance,graph).problems.length,3);
 const nodes=followNodes(content,level,appearance,graph);
 assert.deepEqual(nodes[0].condition,{op:'all',conditions:[{op:'appearance',level_id:'level',appearance_id:'a'},graph.nodes[0].condition.conditions[3]]});
 assert.deepEqual(nodes[0].options,before.nodes[0].options);assert.deepEqual(graph,before);
 assert.deepEqual(dialogueCheck(content,level,appearance,{...graph,nodes}).problems,[]);
 assert.equal(dialogueCheck(content,level,appearance,{...graph,nodes}).following,true);
});
test('partial overlap after rescheduling still identifies stale generated scope',()=>{
 const {content,level,appearance,graph}=fixture();appearance.track_id='clinic';level.tracks[0].location_id='fire';appearance.start_tick=15;appearance.end_tick=25;
 assert.deepEqual(dialogueCheck(content,level,appearance,graph).problems,['对白卡片仍使用生成时的固定出场范围']);
});
test('custom and alternative scene/time conditions are never erased as inferred guards',()=>{
 const {content,level,appearance,graph}=fixture();content.drafts=[];
 const custom={op:'any',conditions:[{op:'scene',location_id:'fire'},{op:'time',comparison:'gte',value:70}]};graph.nodes[0].condition=custom;
 assert.deepEqual(dialogueCheck(content,level,appearance,graph).problems,[]);
 assert.deepEqual(followNodes(content,level,appearance,graph)[0].condition.conditions[1],custom);
});
test('unlink freezes current occurrence range, preserves variables and is idempotent',()=>{
 const {content,level,appearance,graph}=fixture();const follow={...graph,nodes:followNodes(content,level,appearance,graph)};
 const nodes=independentNodes(level,appearance,follow);
 assert.equal(nodes[0].condition.conditions[0].conditions[0].location_id,'clinic');
 assert.equal(nodes[0].condition.conditions[0].conditions[1].value,30);
 assert.equal(nodes[0].condition.conditions[1].variable_id,'injured');
 assert.deepEqual(independentNodes(level,appearance,{...graph,nodes}),nodes);
});
test('shared dialogue conversion copies content and changes only the chosen occurrence link',()=>{
 const {content,level,appearance,graph}=fixture();level.appearances.push({...appearance,id:'b',dialogue_ids:[]});
 const commands=linkageCommands(content,level,appearance,graph,'follow',()=> 'copy');
 assert.equal(commands[0].type,'create_entity');assert.equal(commands[0].entity.id,'copy');
 assert.deepEqual(commands[0].entity.nodes[0].options,graph.nodes[0].options);
 assert.deepEqual(commands[1].level.appearances[0].dialogue_ids,['copy']);assert.deepEqual(commands[1].level.appearances[1].dialogue_ids,[]);
 assert.deepEqual(content.dialogues,[graph]);
});
test('new scope binding works without drafts; unrelated custom time still signals conflict',()=>{
 const {content,level,appearance,graph}=fixture();content.drafts=[];graph.nodes[0].condition={op:'time',comparison:'lt',value:12};
 const converted={...graph,nodes:followNodes(content,level,appearance,graph)};
 assert.equal(dialogueCheck(content,level,appearance,converted).problems.length,1);
 assert.equal(linkageCommands(content,level,appearance,converted,'follow',()=> 'copy').length,0);
});
