import test from 'node:test';
import assert from 'node:assert/strict';
import {agentClientConfigurations,capturedDialogueText,dialogueTextTarget,markedTextRange,collaborationCardIds,collaborationMarkBody} from '../src/agentCollaborationModel.js';

test('marked ranges convert DOM UTF-16 to code points without splitting emoji',()=>{
  assert.deepEqual(markedTextRange('甲😀乙丙',3,4),{start:2,end:3});
  assert.deepEqual(markedTextRange('甲😀乙丙',3,3),{start:0,end:4});
});
test('stable card and option identities determine the exact text field',()=>{
  const graph={id:'dialogue-a',nodes:[{id:'node-a',label:'开场',text:'正文',options:[{id:'option-a',text:'玩家选项'}]}]};
  assert.equal(dialogueTextTarget(graph,'node-a','option-a').text,'玩家选项');
  assert.equal(dialogueTextTarget(graph,'missing'),null);
  assert.equal(dialogueTextTarget(graph,'node-a','missing'),null);
  assert.equal(capturedDialogueText({dataset:{agentNode:'node-a'},value:'陈旧正文',selectionStart:0,selectionEnd:2},graph),null);
});
test('client configuration preserves Windows paths and isolated project arguments',()=>{
  const connection={command:'C:\\中文目录\\NPCsAIStudio.exe',args:['--mcp','--base-url','http://127.0.0.1:4211','--project-id','project-a']};
  const configs=agentClientConfigurations(connection);
  const entry=JSON.parse(configs.claude).mcpServers.npcs_ai_studio;
  assert.deepEqual(entry,{type:'stdio',command:connection.command,args:connection.args});
  assert.ok(configs.codex.includes(JSON.stringify(connection.command)));
  assert.ok(!configs.codex.includes('api_key'));
});

test('multi-card scope includes only selected authored cards, while flow includes disconnected and ending cards',()=>{
  const graph={id:'flow',nodes:[{id:'a',text:'开场',options:[]},{id:'b',text:'未连接卡片',options:[]},{id:'ending',node_type:'ending',text:'再见',options:[]}]};
  assert.deepEqual(collaborationCardIds(graph,'cards',['ending','a','__entry','a','deleted']),['a','ending']);
  assert.deepEqual(collaborationCardIds(graph,'flow',[]),['a','b','ending']);
  const mark={dialogueId:'flow',nodeId:'a',optionId:null,text:'开场',previousText:'旧开场',start:0,end:1,graph};
  const body=collaborationMarkBody(mark,'统一口吻','cards',['ending','a'],5);
  assert.deepEqual(body.node_ids,['a','ending']);
  assert.deepEqual(body.expected_nodes,graph.nodes);
  assert.equal(body.start,undefined);
  assert.equal(body.option_id,undefined);
  assert.equal(collaborationMarkBody(mark,'润色','text',[],5).end,1);
  assert.equal(graph.nodes[0].text,'开场');
});
