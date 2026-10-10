// Presentation only: positions and routes never change authored graph topology.
export function dialogueCardSize(node, measured = {}) {
  return {
    width: measured.width || (node.type === 'entrance' ? 220 : node.type === 'ending' ? 160 : 280),
    height: measured.height || (node.type === 'entrance' ? 180 : node.type === 'ending' ? 80 : 240 + (node.options?.length || 0) * 65),
  };
}

export function beautifyDialoguePositions(graph, sizes = {}) {
  const nodes = graph.nodes, byId = new Map(nodes.map(node => [node.id, node]));
  const adjacent = id => (byId.get(id)?.options || []).map(option => option.target_node_id).filter(id => byId.has(id));
  // Collapse cycles before assigning longest-path layers, so merges follow every parent.
  const indices = new Map(), low = new Map(), stack = [], active = new Set(), components = [];
  let clock = 0;
  function visit(id) {
    indices.set(id, clock); low.set(id, clock++); stack.push(id); active.add(id);
    for (const target of adjacent(id)) {
      if (!indices.has(target)) { visit(target); low.set(id, Math.min(low.get(id), low.get(target))); }
      else if (active.has(target)) low.set(id, Math.min(low.get(id), indices.get(target)));
    }
    if (low.get(id) === indices.get(id)) {
      const group = []; let member;
      do { member = stack.pop(); active.delete(member); group.push(member); } while (member !== id);
      components.push(group);
    }
  }
  for (const node of nodes) if (!indices.has(node.id)) visit(node.id);
  const originalOrder = new Map(nodes.map((node, i) => [node.id, i]));
  for(const members of components)members.sort((a,b)=>(a===graph.entry_node_id?-1:b===graph.entry_node_id?1:originalOrder.get(a)-originalOrder.get(b)));
  const perColumn=components.map(members=>Math.max(1,Math.ceil(Math.sqrt(members.length)/2)));
  const spans=components.map((members,i)=>Math.ceil(members.length/perColumn[i]));
  const component = new Map(components.flatMap((members, i) => members.map(id => [id, i])));
  const children = components.map(() => new Set()), parents = components.map(() => new Set());
  for (const node of nodes) for (const target of adjacent(node.id)) {
    const a = component.get(node.id), b = component.get(target);
    if (a !== b) { children[a].add(b); parents[b].add(a); }
  }
  const roots = [graph.entry_node_id, ...graph.entry_routes.map(route => route.node_id)].filter(id => byId.has(id));
  const reachable = new Set(roots), queue = [...reachable];
  for (let i = 0; i < queue.length; i++) for (const target of adjacent(queue[i])) if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
  const ranks = components.map(() => 0), indegree = parents.map(group => group.size);
  const order = components.map((_, i) => i).filter(i => !indegree[i]);
  for (let i = 0; i < order.length; i++) for (const child of children[order[i]]) {
    ranks[child] = Math.max(ranks[child], ranks[order[i]] + spans[order[i]]);
    if (--indegree[child] === 0) order.push(child);
  }
  const positions = {}, dimensions = new Map(nodes.map(node => [node.id, dialogueCardSize(node, sizes[node.id])]));
  const nodeRank=new Map(components.flatMap((members,i)=>members.map((id,index)=>[id,ranks[i]+Math.floor(index/perColumn[i])])));
  const columns = new Map();
  for (const node of nodes) { const rank = nodeRank.get(node.id); if (!columns.has(rank)) columns.set(rank, []); columns.get(rank).push(node); }
  const xByColumn = new Map(); let x = 20 + dialogueCardSize({type:'entrance'}, sizes.__entry).width + 170;
  for (const rank of [...columns.keys()].sort((a, b) => a - b)) {
    const exits=columns.get(rank).reduce((sum,node)=>sum+node.options.length,0);
    xByColumn.set(rank, x); x += Math.max(...columns.get(rank).map(node => dimensions.get(node.id).width)) + Math.max(170,80+exits*20);
  }
  const incoming = new Map(nodes.map(node => [node.id, []]));
  for (const node of nodes) for (const target of adjacent(node.id)) incoming.get(target).push(node.id);
  function arrange(connected, startY) {
    let bottom = startY;
    for (const rank of [...columns.keys()].sort((a, b) => a - b)) {
      const column = columns.get(rank).filter(node => reachable.has(node.id) === connected);
      const center = node => { const predecessors = incoming.get(node.id).filter(id => positions[id]); return predecessors.length ? predecessors.reduce((sum, id) => sum + positions[id].y + dimensions.get(id).height / 2, 0) / predecessors.length : startY; };
      column.sort((a, b) => center(a) - center(b) || originalOrder.get(a.id) - originalOrder.get(b.id));
      let y = startY;
      for (const node of column) {
        positions[node.id] = {x:xByColumn.get(rank), y};
        y += dimensions.get(node.id).height + 110;
        bottom = Math.max(bottom, y);
      }
    }
    return bottom;
  }
  const bottom = arrange(true, 40); arrange(false, bottom + 80);
  return positions;
}

function simplify(points) {
  const result = [];
  for (const point of points) {
    const last = result.at(-1), previous = result.at(-2);
    if (last && last.x === point.x && last.y === point.y) continue;
    if (previous && ((previous.x === last.x && last.x === point.x && (last.y-previous.y)*(point.y-last.y)>=0) || (previous.y === last.y && last.y === point.y && (last.x-previous.x)*(point.x-last.x)>=0))) result.pop();
    result.push(point);
  }
  return result;
}
export function segmentCrossesCard(a, b, rect) {
  if (a.x === b.x) return a.x > rect.x && a.x < rect.x + rect.width && Math.max(a.y, b.y) > rect.y && Math.min(a.y, b.y) < rect.y + rect.height;
  if (a.y === b.y) return a.y > rect.y && a.y < rect.y + rect.height && Math.max(a.x, b.x) > rect.x && Math.min(a.x, b.x) < rect.x + rect.width;
  // The short fan-in tail can be diagonal; check its actual interior intersection.
  let first=0,last=1;
  for(const [p,d,min,max] of [[a.x,b.x-a.x,rect.x,rect.x+rect.width],[a.y,b.y-a.y,rect.y,rect.y+rect.height]]) {
    if(!d){if(p<=min||p>=max)return false;continue;}
    const enter=(min-p)/d,exit=(max-p)/d;
    first=Math.max(first,Math.min(enter,exit));last=Math.min(last,Math.max(enter,exit));
  }
  return first<last;
}
const length = points => points.slice(1).reduce((sum, point, i) => sum + Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y), 0);
const clear = (points, boxes) => points.slice(1).every((point, i) => boxes.every(box => !segmentCrossesCard(points[i], point, box)));

// Prefer a nearby gutter; use exterior lanes for long jumps and back/loop links.
// Ports are always Right -> Left. The first/last stubs intentionally cross their own card margin.
export function automaticDialogueRoute(source, target, rectangles = [], options = {}) {
  const margin = 14,gap=target.x-source.x,forward=gap>0;
  // Old layouts can have only a narrow gutter: fixed port leads would overshoot.
  const lead=forward?Math.min(28,Math.max(16,gap/4)):28;
  const approach=forward?Math.min(40,Math.max(16,gap/4)):40;
  const boxes = rectangles.map(rect => ({x:rect.x-margin, y:rect.y-margin, width:rect.width+margin*2, height:rect.height+margin*2}));
  const reserved=options.reserved || [],offset=options.targetOffset || 0;
  const start = {x:source.x+lead, y:source.y}, end = {x:target.x-approach, y:target.y+offset};
  const lanes=reserved.flatMap(route=>route.slice(1).map((b,i)=>[route[i],b]));
  const preferred=options.channelX ?? (start.x+end.x)/2;
  const xs = [...new Set([preferred,(start.x+end.x)/2, start.x, end.x, ...boxes.flatMap(box => [box.x, box.x+box.width]),...lanes.filter(([a,b])=>a.x===b.x).flatMap(([a])=>[a.x-20,a.x+20])])];
  const ys = [...new Set([start.y, end.y, ...boxes.flatMap(box => [box.y, box.y+box.height]),...lanes.filter(([a,b])=>a.y===b.y).flatMap(([a])=>[a.y-16,a.y+16])])];
  const tail=offset?[end,{x:target.x-8,y:target.y},target]:[end,target];
  if(!clear(tail,rectangles))return offset?automaticDialogueRoute(source,target,rectangles,{...options,targetOffset:0}):null;
  const candidates = [
    ...xs.map(x => [start, {x,y:start.y}, {x,y:end.y}, end]),
    ...ys.map(y => [start, {x:start.x,y}, {x:end.x,y}, end]),
  ].map(simplify).sort((a, b) => length(a)-length(b) || a.length-b.length);
  let route,best=Infinity;
  for(const points of candidates) {
    const full=simplify([source,...points,...tail.slice(1)]);
    if(!validPortDirections(full))continue;
    const backward=forward?points.slice(1).reduce((sum,b,i)=>sum+Math.max(0,points[i].x-b.x),0):0;
    const base=length(full)+points.length*32+backward*8;
    if(base>=best||!clear(points,boxes))continue;
    const departure=full.find((p,i)=>i>0&&p.y!==source.y)?.x ?? preferred;
    const cost=base+routeLanePenalty(full,reserved)+Math.abs(departure-preferred)*.6;
    if(cost<best){best=cost;route=points;}
  }
  // Irregular manual arrangements may need more bends than a single gutter.
  if (!route) route = gridRoute(start, end, boxes,reserved,{x:tail[1].x-end.x,y:tail[1].y-end.y});
  return route ? simplify([source, ...route, ...tail.slice(1)]) : null;
}

function validPortDirections(points) {
  if(points.length<2||points[1].x<=points[0].x||points.at(-1).x<=points.at(-2).x)return false;
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1],b=points[i],c=points[i+1];
    const dot=(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y);
    if(dot<-.001)return false;
  }
  return true;
}

// Parallel overlap is much more confusing than a short transverse crossing.
function routeLanePenalty(points,reserved) {
  let cost=0;
  for(let i=1;i<points.length;i++)for(const route of reserved)for(let j=1;j<route.length;j++) {
    const a=points[i-1],b=points[i],c=route[j-1],d=route[j];
    if((a.x!==b.x&&a.y!==b.y)||(c.x!==d.x&&c.y!==d.y))continue;
    const vertical=a.x===b.x,otherVertical=c.x===d.x;
    if(vertical===otherVertical) {
      const gap=Math.abs(vertical?a.x-c.x:a.y-c.y);
      const overlap=Math.min(vertical?Math.max(a.y,b.y):Math.max(a.x,b.x),vertical?Math.max(c.y,d.y):Math.max(c.x,d.x))-Math.max(vertical?Math.min(a.y,b.y):Math.min(a.x,b.x),vertical?Math.min(c.y,d.y):Math.min(c.x,d.x));
      if(gap<18&&overlap>0)cost+=(18-gap)/18*(overlap*8+160);
    } else if((vertical?c.x<a.x&&d.x>a.x||d.x<a.x&&c.x>a.x:c.y<a.y&&d.y>a.y||d.y<a.y&&c.y>a.y)&&(vertical?Math.min(a.y,b.y)<c.y&&Math.max(a.y,b.y)>c.y:Math.min(a.x,b.x)<c.x&&Math.max(a.x,b.x)>c.x))cost+=24;
  }
  return cost;
}

export function routeDialogueConnections(connections,rectangles) {
  const incoming=new Map(),outgoing=new Map(),routes={},reserved=[];
  for(const connection of connections) {
    const key=connection.targetId || `${connection.target.x}:${connection.target.y}`;
    if(!incoming.has(key))incoming.set(key,[]);
    incoming.get(key).push(connection);
    const sourceKey=connection.sourceId || String(connection.source.x);
    if(!outgoing.has(sourceKey))outgoing.set(sourceKey,[]);
    outgoing.get(sourceKey).push(connection);
  }
  for(const group of incoming.values())group.sort((a,b)=>a.source.y-b.source.y||a.source.x-b.source.x||a.id.localeCompare(b.id));
  for(const group of outgoing.values())group.sort((a,b)=>a.source.y-b.source.y||a.id.localeCompare(b.id));
  for(const connection of connections) {
    if(connection.manual)continue;
    const key=connection.targetId || `${connection.target.x}:${connection.target.y}`,group=incoming.get(key);
    const height=rectangles.find(rect=>rect.id===connection.targetId)?.height || 160;
    const spacing=Math.min(16,Math.max(0,height-40)/Math.max(1,group.length-1));
    const targetOffset=(group.indexOf(connection)-(group.length-1)/2)*spacing;
    const departures=outgoing.get(connection.sourceId || String(connection.source.x));
    const rightBoundary=Math.min(connection.target.x>connection.source.x?connection.target.x:Infinity,...rectangles.filter(box=>box.x>connection.source.x+28).map(box=>box.x));
    const available=Number.isFinite(rightBoundary)?rightBoundary-connection.source.x:170;
    const channelSpacing=Math.min(22,Math.max(0,available-48)/Math.max(1,departures.length-1));
    const channelX=connection.source.x+Math.max(24,Math.min(available/2,56))+(departures.indexOf(connection)-(departures.length-1)/2)*channelSpacing;
    const route=automaticDialogueRoute(connection.source,connection.target,rectangles,{reserved,targetOffset,channelX});
    if(route){routes[connection.id]=route;reserved.push(route);}
  }
  return routes;
}

function gridRoute(start, end, boxes,reserved=[],arrival={x:1,y:0}) {
  const xs = [...new Set([start.x,end.x,...boxes.flatMap(box => [box.x,box.x+box.width])])].sort((a,b)=>a-b);
  const ys = [...new Set([start.y,end.y,...boxes.flatMap(box => [box.y,box.y+box.height])])].sort((a,b)=>a-b);
  const id = (x,y) => y*xs.length+x, point = key => ({x:xs[key%xs.length],y:ys[Math.floor(key/xs.length)]});
  const first = id(xs.indexOf(start.x),ys.indexOf(start.y))*4, last = id(xs.indexOf(end.x),ys.indexOf(end.y));
  const distance = new Map([[first,0]]), previous = new Map(), open = [{key:first,score:0}], closed = new Set();
  // Sparse A*: no eagerly constructed all-pairs visibility graph.
  while (open.length) {
    open.sort((a,b)=>b.score-a.score);const {key}=open.pop();
    if (closed.has(key)) continue;
    const cell=Math.floor(key/4),direction=key%4;
    const heading=[[1,0],[0,1],[-1,0],[0,-1]][direction];
    if (cell===last&&heading[0]*arrival.x+heading[1]*arrival.y>=0) {const result=[];for(let cursor=key;cursor!==undefined;cursor=previous.get(cursor))result.push(point(Math.floor(cursor/4)));return simplify(result.reverse());}
    closed.add(key);const x=cell%xs.length,y=Math.floor(cell/xs.length),a=point(cell);
    for (const [nx,ny,nextDirection] of [[x+1,y,0],[x,y+1,1],[x-1,y,2],[x,y-1,3]]) {
      if(nx<0||ny<0||nx>=xs.length||ny>=ys.length)continue;
      if(nextDirection===(direction+2)%4)continue;
      const next=id(nx,ny)*4+nextDirection,b=point(id(nx,ny));if(closed.has(next)||!clear([a,b],boxes))continue;
      const cost=distance.get(key)+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+(direction===nextDirection?0:32)+routeLanePenalty([a,b],reserved);
      if(cost>=(distance.get(next)??Infinity))continue;
      distance.set(next,cost);previous.set(next,key);open.push({key:next,score:cost+Math.abs(b.x-end.x)+Math.abs(b.y-end.y)});
    }
  }
  return null;
}

export function orthogonalDialoguePath(points, radius = 6) {
  let path=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1],b=points[i],c=points[i+1];
    const before=Math.hypot(b.x-a.x,b.y-a.y),after=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(radius,before/2,after/2);
    if(!before||!after||Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<.001){path+=` L ${b.x} ${b.y}`;continue;}
    const entry={x:b.x+(a.x-b.x)*r/before,y:b.y+(a.y-b.y)*r/before};
    const exit={x:b.x+(c.x-b.x)*r/after,y:b.y+(c.y-b.y)*r/after};
    path+=` L ${entry.x} ${entry.y} Q ${b.x} ${b.y} ${exit.x} ${exit.y}`;
  }
  return path+` L ${points.at(-1).x} ${points.at(-1).y}`;
}

export function routeCenter(points) {
  let remaining=length(points)/2;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],span=Math.abs(b.x-a.x)+Math.abs(b.y-a.y);
    if(remaining<=span) return {x:a.x+(b.x-a.x)*remaining/(span||1),y:a.y+(b.y-a.y)*remaining/(span||1)};
    remaining-=span;
  }
  return points.at(-1);
}
