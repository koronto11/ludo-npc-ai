import { t, tm, useI18n } from './i18n';
import { useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from '@xyflow/react';
import { edgeColors, routedEdgePath, insertEdgePoint } from './dialogueEdges';
import './dialogueEdges.css';

export function DialogueEdge({id,sourceX,sourceY,targetX,targetY,sourcePosition,targetPosition,markerEnd,style,label,data,selected}) {
  useI18n();
  const flow=useReactFlow();
  const dragging=useRef(null);
  const [autoPath,midX,midY]=getBezierPath({sourceX,sourceY,targetX,targetY,sourcePosition,targetPosition});
  const points=data.layout?.points || [];
  const handles=points.length?points:[{x:midX,y:midY}];
  const path=points.length?routedEdgePath({x:sourceX,y:sourceY},{x:targetX,y:targetY},points):autoPath;
  const center=points.length?points[Math.floor(points.length/2)]:{x:midX,y:midY};
  return <>
    <g onDoubleClick={event=>{event.preventDefault();event.stopPropagation();const point=flow.screenToFlowPosition({x:event.clientX,y:event.clientY});data.onSelect(id);data.onChange(id,{points:insertEdgePoint(points,point,{x:sourceX,y:sourceY},{x:targetX,y:targetY})});}}>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{...style,strokeWidth:selected?2.8:style.strokeWidth}} interactionWidth={22}/>
    </g>
    <EdgeLabelRenderer>
      {label&&<span className="dialogue-edge-label" style={{transform:`translate(-50%,-50%) translate(${center.x}px,${center.y}px)`}}>{tm(label)}</span>}
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
