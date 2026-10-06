export const edgeColors = ['#c59b78','#da7770','#d5ba64','#85b59a','#79b4cf','#ad93d2'];
export function dialogueEdges(graph) {
  return [
    {id:'entry:default',source:'__entry',sourceHandle:'default',target:graph.entry_node_id},
    ...graph.entry_routes.map((route,i)=>({id:`route:${i}`,source:'__entry',sourceHandle:`route-${i}`,target:route.node_id,label:`条件 ${i+1}`})),
    ...graph.nodes.flatMap(node=>node.options.map(option=>({id:`option:${option.id}`,choiceId:option.id,source:node.id,sourceHandle:option.id,target:option.target_node_id || '__end',label:option.condition.op==='always'?'':'◇ 条件'}))),
  ];
}
export function pruneDialogueEdges(layouts, graph, routesChanged=false) {
  const ids = new Set(dialogueEdges(graph).map(edge=>edge.id));
  return Object.fromEntries(Object.entries(layouts).filter(([id])=>ids.has(id) && !(routesChanged && id.startsWith('route:'))));
}
export function routedEdgePath(source, target, points) {
  const knots=[source,{x:source.x+40,y:source.y},...points,{x:target.x-40,y:target.y},target];
  let path=`M ${source.x} ${source.y}`;
  for(let i=0;i<knots.length-1;i++) {
    const a=knots[Math.max(0,i-1)],b=knots[i],c=knots[i+1],d=knots[Math.min(knots.length-1,i+2)];
    path+=` C ${b.x+(c.x-a.x)/6} ${b.y+(c.y-a.y)/6}, ${c.x-(d.x-b.x)/6} ${c.y-(d.y-b.y)/6}, ${c.x} ${c.y}`;
  }
  return path;
}
export function insertEdgePoint(points, point, source, target) {
  const knots=[source,...points,target];
  let closest=Infinity,index=0;
  for(let i=0;i<knots.length-1;i++) {
    const a=knots[i],b=knots[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    const distance=(point.x-a.x-t*dx)**2+(point.y-a.y-t*dy)**2;
    if(distance<closest){closest=distance;index=i;}
  }
  return [...points.slice(0,index),point,...points.slice(index)];
}
