import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectView} from '../src/projectBridge.js';
import {orderedLibraryRows,librarySiblings,moveLibrarySibling,libraryOrderCommands} from '../src/libraryOrderingModel.js';
const read=()=>JSON.parse(fs.readFileSync(new URL('../docs/examples/outpost-v2.ludo.json',import.meta.url),'utf8'));

test('legacy, missing, duplicate and newly added IDs never hide library rows',()=>{
  const rows=['a','b','c'].map(id=>({id}));
  assert.deepEqual(orderedLibraryRows(rows),rows);
  assert.deepEqual(orderedLibraryRows(rows,['c','missing','c']).map(r=>r.id),['c','a','b']);
});
test('filtered sorting keeps unseen siblings and cannot target another group',()=>{
  assert.deepEqual(moveLibrarySibling(['a','hidden','b','c'],'c','a'),['c','a','hidden','b']);
  assert.deepEqual(moveLibrarySibling(['a','hidden','b','c'],'a','b',true),['hidden','b','a','c']);
  assert.throws(()=>moveLibrarySibling(['a','b'],'a','other-group'),/同级/);
});
test('sorting preserves all authored content; conflicts reject only changed order or membership',()=>{
  const base=read(),snapshot=structuredClone(base),ids=librarySiblings(projectView(base),'world').map(r=>r.id),latest=structuredClone(base);
  assert.ok(ids.length>=2);
  latest.content.world.premise='后来编辑的世界底稿';
  assert.equal(libraryOrderCommands(base,latest,'world',ids[0],ids[1],true)[0].type,'set_library_order');
  assert.deepEqual(base,snapshot);
  latest.editor.library_orders={world:[...ids].reverse()};
  assert.throws(()=>libraryOrderCommands(base,latest,'world',ids[0],ids[1],true),/变化/);
  delete latest.editor.library_orders;latest.content.locations=latest.content.locations.filter(r=>r.id!==ids[1]);
  assert.throws(()=>libraryOrderCommands(base,latest,'world',ids[0],ids[1],true),/变化/);
});
test('characters and background residents are isolated sibling scopes',()=>{
  const view=projectView(read());view.entities.push({...view.entities.find(row=>row.kind==='character'),id:'background-test'});const people=view.entities.filter(row=>row.kind==='character');
  people[0].hidden=false;people[0].tier='支线角色';people[1].hidden=true;
  assert.ok(librarySiblings(view,'characters').some(row=>row.id===people[0].id));
  assert.ok(!librarySiblings(view,'residents').some(row=>row.id===people[0].id));
  assert.ok(!librarySiblings(view,'characters').some(row=>row.id===people[1].id));
  assert.ok(librarySiblings(view,'residents').some(row=>row.id===people[1].id));
});
