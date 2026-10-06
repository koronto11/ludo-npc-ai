import assert from 'node:assert/strict';
import test from 'node:test';
import { groupCommands, undoGroupCommands } from '../src/characterGroupCommands.js';

const characters = () => [
  { id:'a', name:'阿洛', tags:['营地','旅人'], story:'故事保留' },
  { id:'b', name:'夏岚', tags:['医帐'], story:'另一段故事' },
  { id:'c', name:'林棠', tags:['营地','医帐'], story:'守夜' },
];
test('batch membership modifies only explicitly touched groups and selected characters', () => {
  const rows = characters();
  const commands = groupCommands(rows, { type:'membership',ids:['a','b'],changes:{新人:true,营地:false} });
  assert.deepEqual(commands.map(c => [c.target.id,c.changes.tags]), [['a',['旅人','新人']],['b',['医帐','新人']]]);
  assert.deepEqual(rows,characters());
});
test('moving a group preserves unrelated membership and ignores selected nonmembers', () => {
  const commands = groupCommands(characters(),{type:'move',ids:['a','b','c'],source:'营地',target:'医帐'});
  assert.deepEqual(commands.map(c => [c.target.id,c.changes.tags]),[['a',['医帐','旅人']],['c',['医帐']]]);
});
test('renaming into an existing group merges membership without duplicates', () => {
  const commands = groupCommands(characters(),{type:'rename',source:'营地',target:'医帐'});
  assert.deepEqual(commands.map(c=>c.changes.tags),[['医帐','旅人'],['医帐']]);
  assert.ok(commands.every(c=>Object.keys(c.changes).join() === 'tags'));
  assert.deepEqual(groupCommands(characters(),{type:'rename',source:'营地',target:'营地'}),[]);
});
test('dissolving a group changes only membership, not characters or other groups', () => {
  const rows=characters();
  assert.deepEqual(groupCommands(rows,{type:'remove',source:'医帐'}).map(c=>[c.target.id,c.changes.tags]),[['b',[]],['c',['营地']]]);
  assert.deepEqual(rows,characters());
});
test('undo restores original tags and rejects intervening edits or removed characters', () => {
  const rows=characters(); const commands=groupCommands(rows,{type:'membership',ids:['a'],changes:{新人:true}});
  const entry={before:[{id:'a',tags:rows[0].tags}],after:[{id:'a',tags:commands[0].changes.tags}]};
  const changed=rows.map(row=>row.id==='a'?{...row,tags:commands[0].changes.tags}:row);
  assert.deepEqual(undoGroupCommands(changed,entry)[0].changes.tags,['营地','旅人']);
  assert.throws(()=>undoGroupCommands(rows,entry),/其他操作修改/);
  assert.throws(()=>undoGroupCommands([],entry),/其他操作修改/);
});
test('invalid names, no-op moves and batch limits fail before a transaction', () => {
  assert.throws(()=>groupCommands(characters(),{type:'move',ids:['a'],source:'营地',target:'营地'}),/相同/);
  assert.throws(()=>groupCommands(characters(),{type:'membership',ids:['missing'],changes:{新人:true}}),/不存在/);
  assert.throws(()=>groupCommands(characters(),{type:'rename',source:'营地',target:'   '}),/1–150/);
  const many=Array.from({length:501},(_,i)=>({id:`c${i}`,name:`人物${i}`,tags:['旧组']}));
  assert.throws(()=>groupCommands(many,{type:'rename',source:'旧组',target:'新组'}),/500/);
  assert.ok(many.every(row=>row.tags.join()==='旧组'));
});
