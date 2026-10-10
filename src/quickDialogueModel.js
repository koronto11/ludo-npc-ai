// Derived, display-only data. Never reorder or rewrite authored dialogue nodes.
export function quickDialogueMatches(node, characters, query) {
  const needle=query.trim().toLocaleLowerCase();
  if(!needle)return true;
  const speaker=characters.find(row=>row.id===node.speaker_id)?.name || '';
  return [node.label,node.text,speaker,...node.options.map(option=>option.text)].join(' ').toLocaleLowerCase().includes(needle);
}

export function quickDialogueStructure(graph) {
  const byId=new Map(graph.nodes.map(node=>[node.id,node])), depth=new Map(), queue=[];
  for(const id of [graph.entry_node_id,...graph.entry_routes.map(route=>route.node_id)])if(byId.has(id)&&!depth.has(id)){depth.set(id,0);queue.push(id);}
  for(let cursor=0;cursor<queue.length;cursor++) {
    const id=queue[cursor];
    for(const option of byId.get(id).options)if(byId.has(option.target_node_id)&&!depth.has(option.target_node_id)){depth.set(option.target_node_id,depth.get(id)+1);queue.push(option.target_node_id);}
  }
  const lastDepth=Math.max(-1,...depth.values())+1, heights=new Map();
  for(const node of graph.nodes){const row=depth.get(node.id) ?? lastDepth;heights.set(row,Math.max(heights.get(row)||0,92+node.options.length*22));}
  const rowY=new Map();let y=24;
  for(const row of [...heights.keys()].sort((a,b)=>a-b)){rowY.set(row,y);y+=heights.get(row)+32;}
  const offsets=new Map();
  const positions=Object.fromEntries(graph.nodes.map(node=>{
    const row=depth.get(node.id) ?? lastDepth, x=offsets.get(row) || 24;
    offsets.set(row,x+245);
    return [node.id,{x,y:rowY.get(row)}];
  }));
  return {positions,reachable:new Set(depth.keys()),options:graph.nodes.reduce((sum,node)=>sum+node.options.length,0)};
}

// Text changes do not reset the overview's pan/zoom. Only topology affects layout.
export function quickDialogueTopology(graph) {
  return JSON.stringify([graph.entry_node_id,graph.entry_routes.map(route=>route.node_id),graph.nodes.map(node=>[node.id,node.options.map(option=>[option.id,option.target_node_id])])]);
}
