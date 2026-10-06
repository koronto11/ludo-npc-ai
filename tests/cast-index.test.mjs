import test from 'node:test';
import assert from 'node:assert/strict';
import {castIndex,castPage} from '../src/castIndex.js';

test('cast index retains distinct appearances, missing tracks, and actor-owned graphs',()=>{
  const c={levels:[{id:'a',tracks:[{id:'t',name:'篝火'}],appearances:[{id:'p1',character_id:'one',track_id:'t'},{id:'p2',character_id:'one',track_id:null}]},{id:'b',tracks:[],appearances:[{id:'p3',character_id:'two',track_id:null}]}],dialogues:[{id:'g1',character_id:'one',nodes:[{speaker_id:'two'}]},{id:'g2',character_id:null}]};
  const index=castIndex(c);
  assert.deepEqual(index.appearances.get('one').map(r=>r.appearance.id),['p1','p2']);
  assert.equal(index.appearances.get('one')[0].track.name,'篝火');
  assert.equal(index.appearances.get('one')[1].track,undefined);
  assert.equal(index.appearances.get('two')[0].level.id,'b');
  assert.equal(index.dialogues.get('one')[0].id,'g1');
  assert.equal(index.dialogues.has('two'),false);
});

test('pagination clamps after removal and partitions every filtered row without mutation',()=>{
  const rows=Array.from({length:500},(_,id)=>({id}));
  assert.equal(castPage(rows,1).rows.length,60);
  assert.equal(castPage(rows,9).rows.length,20);
  assert.deepEqual(Array.from({length:9},(_,i)=>castPage(rows,i+1).rows).flat(),rows);
  const filtered=rows.filter(r=>r.id%100===0);
  assert.equal(castPage(filtered,9).page,1);
  assert.deepEqual(castPage([],9),{page:1,pages:1,rows:[],start:0,end:0});
  assert.equal(rows.length,500);
});
