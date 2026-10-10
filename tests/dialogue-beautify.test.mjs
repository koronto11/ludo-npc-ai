import test from 'node:test';
import assert from 'node:assert/strict';
import {beautifyDialoguePositions,automaticDialogueRoute,routeDialogueConnections,segmentCrossesCard,orthogonalDialoguePath,routeCenter} from '../src/dialogueBeautify.js';
import {dialogueEdges} from '../src/dialogueEdges.js';

const node=(id,targets=[])=>({id,text:id,condition:{op:'always'},effects:[],options:targets.map((target,i)=>({id:`${id}-${i}`,target_node_id:target,condition:{op:'always'},effects:[],text:`选项 ${i}`}))});
const fixture=()=>({entry_node_id:'start',entry_routes:[{node_id:'alternate'}],nodes:[node('start',['short','long',null]),node('short',['join']),node('long',['later']),node('later',['join']),node('join',[null]),node('alternate',['join']),node('unlinked',[null])]});
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function drawing(graph,sizes={}) {
  const positions=beautifyDialoguePositions(graph,sizes);
  const cards=graph.nodes.map(n=>({id:n.id,...positions[n.id],width:sizes[n.id]?.width||280,height:sizes[n.id]?.height||240+n.options.length*65}));
  return {positions,boxes:[{id:'__entry',x:20,y:40,width:220,height:500},...cards,{id:'__end',x:Math.max(...cards.map(card=>card.x+card.width))+170,y:40,width:160,height:80}]};
}

test('layout puts joins after every predecessor, measures tall cards and separates disconnected content without author mutation',()=>{
  const graph=fixture(),before=structuredClone(graph),sizes={start:{width:280,height:960},alternate:{width:280,height:510}};
  const {positions,boxes}=drawing(graph,sizes);
  assert.ok(positions.join.x>positions.later.x&&positions.join.x>positions.short.x);
  assert.ok(positions.alternate.y>=positions.start.y+960);
  assert.ok(positions.unlinked.y>Math.max(...boxes.filter(b=>!['__entry','__end','unlinked'].includes(b.id)).map(b=>b.y+b.height)));
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++)assert.equal(overlaps(boxes[a],boxes[b]),false,`${boxes[a].id}/${boxes[b].id}`);
  assert.deepEqual(graph,before);
  assert.deepEqual(beautifyDialoguePositions(graph,sizes),positions);
});

test('cycles, self loops and multiple conditional starts retain all stable IDs and finite positions',()=>{
  const graph={entry_node_id:'a',entry_routes:[{node_id:'c'}],nodes:[node('a',['b']),node('b',['a','b','d']),node('c',['b']),node('d',[null]),node('orphan',['orphan'])]};
  const {positions,boxes}=drawing(graph);
  assert.deepEqual(Object.keys(positions).sort(),graph.nodes.map(n=>n.id).sort());
  for(const p of Object.values(positions))assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.ok(positions.a.x<positions.b.x);
  for(const edge of dialogueEdges(graph))checkRoute(edge,boxes,graph);
});

function checkRoute(edge,boxes,graph) {
  const source=boxes.find(b=>b.id===edge.source),target=boxes.find(b=>b.id===edge.target);
  const options=graph.nodes.find(n=>n.id===edge.source)?.options;
  const index=options?options.findIndex(o=>o.id===edge.choiceId):edge.id==='entry:default'?0:1;
  const from={x:source.x+source.width,y:source.y+55+(source.height-90)*(index+1)/((options?.length||2)+1)};
  const to={x:target.x,y:target.y+target.height/2};
  const route=automaticDialogueRoute(from,to,boxes);
  assert.ok(route,edge.id);assert.deepEqual(route[0],from);assert.deepEqual(route.at(-1),to);
  for(let i=1;i<route.length;i++) for(const box of boxes) {
    assert.equal(segmentCrossesCard(route[i-1],route[i],box),false,`${edge.id} crosses ${box.id}`);
  }
  const path=orthogonalDialoguePath(route);
  assert.equal(/NaN|Infinity/.test(path),false);
  assert.ok(path.startsWith(`M ${from.x} ${from.y}`));
  assert.ok(path.endsWith(`L ${to.x} ${to.y}`));
  const center=routeCenter(route);assert.ok(Number.isFinite(center.x)&&Number.isFinite(center.y));
}

test('automatic paths avoid every card for branches, merges, skipped layers, openings and endings',()=>{
  const graph=fixture(),{boxes}=drawing(graph,{start:{width:280,height:960},alternate:{width:280,height:600}});
  for(const edge of dialogueEdges(graph))checkRoute(edge,boxes,graph);
});

test('irregular manual arrangements can use multiple detours and routes remain read-only',()=>{
  const source={x:100,y:60},target={x:900,y:320};
  const boxes=[{x:0,y:0,width:100,height:120},{x:220,y:-70,width:100,height:230},{x:440,y:130,width:100,height:300},{x:650,y:-50,width:110,height:220},{x:900,y:250,width:100,height:140}];
  const before=structuredClone(boxes),route=automaticDialogueRoute(source,target,boxes);
  assert.ok(route);
  for(let i=1;i<route.length;i++)for(const box of boxes)assert.equal(segmentCrossesCard(route[i-1],route[i],box),false);
  assert.deepEqual(boxes,before);
});

test('an overlapping card enclosing the source reports no safe route rather than hanging or producing invalid coordinates',()=>{
  assert.equal(automaticDialogueRoute({x:100,y:50},{x:500,y:50},[{x:90,y:0,width:100,height:100}]),null);
  assert.deepEqual(beautifyDialoguePositions({entry_node_id:null,entry_routes:[],nodes:[]}),{});
});

function sharedSegmentLength(a,b,c,d) {
  if(a.x===b.x&&c.x===d.x&&a.x===c.x)return Math.max(0,Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)));
  if(a.y===b.y&&c.y===d.y&&a.y===c.y)return Math.max(0,Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)));
  return 0;
}
test('two choices reaching the same card stay separate until the final short port stub',()=>{
  const connections=[180,230].map((y,i)=>({id:`choice-${i}`,source:{x:100,y},target:{x:600,y:200},targetId:'target'}));
  const boxes=[{id:'source',x:0,y:0,width:100,height:320},{id:'target',x:600,y:80,width:280,height:300}];
  const routes=routeDialogueConnections(connections,boxes),a=routes['choice-0'],b=routes['choice-1'];
  for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++)assert.ok(sharedSegmentLength(a[i-1],a[i],b[j-1],b[j])<=8,'Branches share a long channel');
  assert.ok(a.some(p=>p.y===192)&&b.some(p=>p.y===208),'Fan-in lanes are not separated');
  for(const route of Object.values(routes))for(let i=1;i<route.length;i++)for(const box of boxes)assert.equal(segmentCrossesCard(route[i-1],route[i],box),false);
});

test('batch routing covers cycles, openings, merges and endings without mutating connections or manual layouts',()=>{
  const graph={entry_node_id:'a',entry_routes:[{node_id:'a'}],nodes:[node('a',['b','b',null]),node('b',['a','b','c']),node('c',[null])]};
  const {boxes}=drawing(graph);
  const connections=dialogueEdges(graph).map(edge=>{
    const a=boxes.find(box=>box.id===edge.source),b=boxes.find(box=>box.id===edge.target),options=graph.nodes.find(n=>n.id===edge.source)?.options;
    const index=options?options.findIndex(o=>o.id===edge.choiceId):edge.id==='entry:default'?0:1;
    return {id:edge.id,source:{x:a.x+a.width,y:a.y+55+(a.height-90)*(index+1)/((options?.length||2)+1)},target:{x:b.x,y:b.y+b.height/2},targetId:edge.target};
  });
  connections.push({id:'manual',manual:true,source:connections[0].source,target:connections[0].target,targetId:'a'});
  const before=structuredClone(connections),routes=routeDialogueConnections(connections,boxes);
  assert.equal(Object.keys(routes).length,connections.length-1);assert.equal(routes.manual,undefined);
  for(const edge of connections.filter(edge=>!edge.manual)) {
    const route=routes[edge.id];assert.deepEqual(route[0],edge.source);assert.deepEqual(route.at(-1),edge.target);
    for(let i=1;i<route.length;i++)for(const box of boxes)assert.equal(segmentCrossesCard(route[i-1],route[i],box),false,`${edge.id} crosses ${box.id}`);
    assert.equal(/NaN|Infinity/.test(orthogonalDialoguePath(route)),false);
  }
  assert.deepEqual(connections,before);assert.deepEqual(routeDialogueConnections(connections,boxes),routes);
});

function assertPortFlow(route) {
  assert.ok(route[1].x>route[0].x,'Source immediately folds left');
  assert.ok(route.at(-1).x>route.at(-2).x,'Target entered from the right');
  for(let i=1;i<route.length-1;i++) {
    const a=route[i-1],b=route[i],c=route[i+1],cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x),dot=(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y);
    assert.ok(dot>=-.001,'Route contains a U-turn or an obtuse terminal hook');
  }
}
test('legacy narrow gutters do not overshoot the next card or create terminal hooks',()=>{
  const boxes=[{id:'source',x:340,y:40,width:280,height:303},{id:'weather',x:690,y:40,width:280,height:275},{id:'travel',x:690,y:368,width:280,height:330},{id:'end',x:1490,y:40,width:160,height:73}];
  const connections=[{id:'weather',sourceId:'source',source:{x:624,y:251},target:{x:685,y:177},targetId:'weather'},{id:'travel',sourceId:'source',source:{x:624,y:289},target:{x:685,y:533},targetId:'travel'},{id:'end',sourceId:'source',source:{x:624,y:327},target:{x:1485,y:76.5},targetId:'end'}];
  const routes=routeDialogueConnections(connections,boxes);
  for(const connection of connections) {
    const route=routes[connection.id];assert.ok(route);assertPortFlow(route);
    for(let i=1;i<route.length;i++)for(const box of boxes)assert.equal(segmentCrossesCard(route[i-1],route[i],box),false);
    if(connection.id!=='end')for(let i=1;i<route.length;i++)assert.ok(route[i].x>=route[i-1].x,'Simple forward branch unnecessarily doubles back');
  }
});

test('beautification reserves wider column gutters for many source choices without altering topology',()=>{
  const graph={entry_node_id:'a',entry_routes:[],nodes:[node('a',Array(12).fill('b')),node('b',[null])]},before=structuredClone(graph);
  const positions=beautifyDialoguePositions(graph);
  assert.ok(positions.b.x-positions.a.x-280>=320);
  assert.deepEqual(graph,before);
});

test('rounded paths never draw a hook at a collinear reversal',()=>{
  const path=orthogonalDialoguePath([{x:0,y:0},{x:40,y:0},{x:20,y:0},{x:20,y:40}]);
  assert.ok(path.startsWith('M 0 0 L 40 0'));
  assert.equal(path.includes('Q 40 0'),false);assert.equal(/NaN|Infinity/.test(path),false);
});
