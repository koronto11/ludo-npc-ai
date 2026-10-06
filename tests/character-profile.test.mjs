import assert from 'node:assert/strict';
import test from 'node:test';
import {profileChanges} from '../src/characterProfile.js';
const actor=()=>({id:'npc',name:'旅人',role:'旅人',importance:'supporting',description:'简介',story:'原故事',personality:[],voice:'简短',goals:[],boundary:'',uncertainties:[],confirmed_fields:['role'],tags:['营地']});
test('profile saves sparse fields and protects unchanged grouping, identity and concurrent edits',()=>{
 const base=actor(),draft={...base,story:'手写故事',personality:['谨慎',''],confirmed_fields:['role','story']},latest={...base,role:'商贩',tags:['别组']};
 assert.deepEqual(profileChanges(base,draft,latest),{story:'手写故事',personality:['谨慎'],confirmed_fields:['role','story']});
 assert.equal(latest.role,'商贩');assert.deepEqual(latest.tags,['别组']);
});
test('profile rejects deleted actors and edited-field conflicts rather than overwriting',()=>{
 const base=actor(),draft={...base,story:'新版'};
 assert.throws(()=>profileChanges(base,draft,null),/已移除/);
 assert.throws(()=>profileChanges(base,draft,{...base,story:'其他窗口'}),/其他编辑/);
 assert.throws(()=>profileChanges(base,{...base,name:'  '},base),/不能为空/);
 assert.throws(()=>profileChanges(base,{...base,confirmed_fields:[]},{...base,confirmed_fields:['story']}),/其他编辑/);
});
test('no-op profile has no mutation and name is trimmed',()=>{
 const base=actor();assert.deepEqual(profileChanges(base,structuredClone(base),base),{});
 assert.deepEqual(profileChanges(base,{...base,name:'  阿洛  '},base),{name:'阿洛'});
});
test('narrative role changes preserve unrelated concurrent edits and can protect the field',()=>{
 const base=actor(),draft={...base,importance:'key',confirmed_fields:['role','importance']};
 const latest={...base,story:'另一处的新故事',tags:['其他分组'],role:'药师'};
 assert.deepEqual(profileChanges(base,draft,latest),{importance:'key',confirmed_fields:['role','importance']});
 assert.deepEqual(profileChanges(base,{...base,story:'新版'},{...base,importance:'background'}),{story:'新版'});
 assert.throws(()=>profileChanges(base,draft,{...base,importance:'background'}),/其他编辑/);
 assert.throws(()=>profileChanges(base,{...base,importance:'boss'},base),/角色定位/);
});
