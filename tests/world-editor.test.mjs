import test from 'node:test';
import assert from 'node:assert/strict';
import {worldEditorCommands,legacyRegionCommands,parseWorldRuleLines,worldRuleTexts} from '../src/worldEditorModel.js';
const fixture=()=>({project_id:'p',name:'Project',content:{world:{name:'World',district:'Camp',premise:'Old',rules:['Rule'],tone:'Quiet',clock_unit:'minute'}}});

test('rule paste creates rows while individual multiline rules remain intact',()=>{
 assert.deepEqual(parseWorldRuleLines(' One\r\n\r\n Two \n'),['One','Two']);
 assert.deepEqual(worldRuleTexts([{text:' A\nB '},{text:'  '},{text:' C '}]),['A\nB','C']);
 const base=fixture(),draft={name:base.name,world:{...base.content.world,premise:'长文本\n\n'.repeat(4000),tone:'多行风格\n第二行',rules:['A\nB','C']}};
 const command=worldEditorCommands(base,draft,base)[0];
 assert.equal(command.world.premise,draft.world.premise);assert.equal(command.world.tone,draft.world.tone);assert.deepEqual(command.world.rules,['A\nB','C']);
});

test('world editing excludes legacy district and preserves it for explicit transfer',()=>{
 const base=fixture(),latest=fixture();latest.content.world.tone='Later style';
 const draft={name:base.name,world:{...base.content.world,district:'Outpost'}};
 assert.deepEqual(worldEditorCommands(base,draft,latest),[]);
 draft.world.premise='Global background';
 assert.equal(worldEditorCommands(base,draft,latest)[0].world.district,'Camp');
 latest.content.world.district='Another camp';
 assert.equal(worldEditorCommands(base,draft,latest)[0].world.district,'Another camp');
});

test('explicit legacy region transfer preserves unrelated world edits and refuses conflicts',()=>{
 const latest=fixture();latest.content.world.tone='Later style';
 assert.deepEqual(legacyRegionCommands(null,latest),[]);
 assert.deepEqual(legacyRegionCommands('Camp',latest),[{type:'replace_world',world:{...latest.content.world,district:''}}]);
 assert.equal(latest.content.world.district,'Camp');
 assert.throws(()=>legacyRegionCommands('Old camp',latest),/其他页面/);
});
test('world editing preserves later unrelated fields and clock settings',()=>{
 const base=fixture(),latest=fixture();latest.content.world.tone='New tone';latest.content.world.clock_unit='days';
 const draft={name:base.name,world:{...base.content.world,premise:'New'}};
 assert.deepEqual(worldEditorCommands(base,draft,latest),[{type:'replace_world',world:{...latest.content.world,premise:'New'}}]);
 assert.equal(base.content.world.premise,'Old');
});
test('world conflicts retain draft and cannot overwrite another tab',()=>{
 const base=fixture(),latest=fixture();latest.content.world.premise='Other tab';
 const draft={name:base.name,world:{...base.content.world,premise:'Mine'}};
 assert.throws(()=>worldEditorCommands(base,draft,latest),/其他页面/);
 assert.equal(draft.world.premise,'Mine');assert.equal(latest.content.world.premise,'Other tab');
 latest.project_id='other';assert.throws(()=>worldEditorCommands(base,draft,latest),/所属项目/);
});
test('project rename detects conflict; unchanged drafts issue no commands',()=>{
 const base=fixture();assert.deepEqual(worldEditorCommands(base,{name:base.name,world:base.content.world},base),[]);
 assert.deepEqual(worldEditorCommands(base,{name:'Renamed',world:base.content.world},base),[{type:'rename_project',name:'Renamed'}]);
 const latest=fixture();latest.name='Another name';assert.throws(()=>worldEditorCommands(base,{name:'Mine',world:base.content.world},latest),/其他页面/);
});
