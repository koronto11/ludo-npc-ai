import { t, tm, useI18n } from './i18n';
import { useMemo, useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from '@xyflow/react';
import { edgeColors, routedEdgePath, insertEdgePoint } from './dialogueEdges';
import { automaticDialogueRoute, routeDialogueConnections, orthogonalDialoguePath, routeCenter } from './dialogueBeautify';
import './dialogueEdges.css';

// Share one route plan across edges using React Flow's measured port bounds.
// The cache holds presentation geometry only, and never persists in the project.
const plans=new WeakMap();
function sharedRoutes(context,flow) {
  if(!context)return {};
  const connections=context.edges.flatMap(edge=>{
    const source=flow.getInternalNode(edge.source),target=flow.getInternalNode(edge.target);
    const sources=source?.internals.handleBounds?.source,targets=target?.internals.handleBounds?.target;
    const a=edge.sourceHandle?sources?.find(handle=>handle.id===edge.sourceHandle):sources?.[0];
    const b=edge.targetHandle?targets?.find(handle=>handle.id===edge.targetHandle):targets?.[0];
    if(!a||!b)return [];
    return [{id:edge.id,manual:edge.manual,sourceId:edge.source,targetId:edge.target,source:{x:source.internals.positionAbsolute.x+a.x+a.width,y:source.internals.positionAbsolute.y+a.y+a.height/2},target:{x:target.internals.positionAbsolute.x+b.x,y:target.internals.positionAbsolute.y+b.y+b.height/2}}];
  });
  const key=JSON.stringify(connections),saved=plans.get(context);
  if(saved?.key===key)return saved.routes;
  const routes=routeDialogueConnections(connections,context.obstacles);
  plans.set(context,{key,routes});return routes;
}

export function DialogueEdge({id,sourceX,sourceY,targetX,targetY,sourcePosition,targetPosition,markerEnd,style,label,data,selected}) {
  useI18n();
  const flow=useReactFlow();
  const dragging=useRef(null);
  const [autoPath,midX,midY]=getBezierPath({sourceX,sourceY,targetX,targetY,sourcePosition,targetPosition});
  const points=data.layout?.points || [];
  const automatic=useMemo(()=>{
    if(points.length)return null;
    const route=sharedRoutes(data.routeContext,flow)[id];
    // During a node drag React Flow can update endpoints before the parent geometry.
    if(route&&route[0].x===sourceX&&route[0].y===sourceY&&route.at(-1).x===targetX&&route.at(-1).y===targetY)return route;
    return automaticDialogueRoute({x:sourceX,y:sourceY},{x:targetX,y:targetY},data.obstacles);
  },[id,sourceX,sourceY,targetX,targetY,data.obstacles,data.routeContext,points.length,flow]);
  const automaticCenter=automatic?routeCenter(automatic):{x:midX,y:midY};
  const handles=points.length?points:[automaticCenter];
  const path=points.length?routedEdgePath({x:sourceX,y:sourceY},{x:targetX,y:targetY},points):automatic?orthogonalDialoguePath(automatic):autoPath;
  const center=points.length?points[Math.floor(points.length/2)]:automaticCenter;
  return <>
    <g onDoubleClick={event=>{event.preventDefault();event.stopPropagation();const point=flow.screenToFlowPosition({x:event.clientX,y:event.clientY});data.onSelect(id);data.onChange(id,{points:insertEdgePoint(points,point,{x:sourceX,y:sourceY},{x:targetX,y:targetY})});}}>
      {selected&&<path className="dialogue-edge-selection-halo" d={path} style={{'--edge-color':style.stroke}} aria-hidden="true"/>}
      <BaseEdge id={id} className={selected?'dialogue-edge-selected-path':undefined} path={path} markerEnd={markerEnd} style={{...style,stroke:selected?'#fff1dc':style.stroke,strokeWidth:selected?3.6:style.strokeWidth}} interactionWidth={22}/>
    </g>
    <EdgeLabelRenderer>
      {label&&<span className={`dialogue-edge-label ${selected?'selected':''}`} style={{transform:`translate(-50%,-50%) translate(${center.x}px,${center.y}px)`}}>{tm(label)}</span>}
      {selected&&handles.map((point,index)=><button key={index} className="dialogue-edge-point nodrag nopan" aria-label={t("连线路径控制点 {0}", [index+1])} title={t("拖动调整走线 · 方向键微调 · 双击移除")} style={{transform:`translate(-50%,-50%) translate(${point.x}px,${point.y}px)`,borderColor:style.stroke}}
        onPointerDown={event=>{event.stopPropagation();event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);dragging.current={index,pointerId:event.pointerId,points:handles};}}
        onPointerMove={event=>{const drag=dragging.current;if(!drag || drag.pointerId!==event.pointerId)return;event.stopPropagation();const moved=flow.screenToFlowPosition({x:event.clientX,y:event.clientY});data.onChange(id,{points:drag.points.map((p,i)=>i===drag.index?moved:p)});}}
        onPointerUp={event=>{event.stopPropagation();dragging.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}
        onPointerCancel={()=>{dragging.current=null;}}
        onClick={event=>event.stopPropagation()}
        onDoubleClick={event=>{event.stopPropagation();data.onChange(id,{points:points.filter((_,i)=>i!==index)});}}
        onKeyDown={event=>{const diff={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[event.key];if(!diff)return;event.preventDefault();event.stopPropagation();data.onChange(id,{points:handles.map((p,i)=>i===index?{x:p.x+diff[0],y:p.y+diff[1]}:p)});}}
      />)}
    </EdgeLabelRenderer>
  </>;
}

export function DialogueEdgeTools({edge,layout,onChange,onClose}) {
  useI18n();
  return <div className="dialogue-edge-tools nodrag nopan" aria-label={t("连线标记与走线")} onPointerDown={event=>event.stopPropagation()}>
    <header><strong>{t("连线标记与走线")}</strong><button aria-label={t("收起连线设置")} onClick={onClose}>×</button></header>
    <div className="dialogue-edge-palette">{edgeColors.map(color=><button key={color} aria-label={t("标记连线 {0}", [color])} aria-pressed={layout.color===color} style={{background:color}} onClick={()=>onChange(edge.id,{color})}/>)}<input type="color" aria-label={t("自定义连线颜色")} value={layout.color || edgeColors[0]} onChange={event=>onChange(edge.id,{color:event.target.value})}/></div>
    <div className="dialogue-edge-actions"><button onClick={()=>onChange(edge.id,{color:null})}>{t("默认颜色")}</button><button onClick={()=>onChange(edge.id,{points:[]})}>{t("恢复自动走线")}</button></div>
    <p>{t("拖动线上圆点调整路径")}<br/>{t("双击连线追加点 · 双击圆点移除")}<br/>{t("最多 8 个控制点，颜色仅用于标记")}</p>
  </div>;
}
