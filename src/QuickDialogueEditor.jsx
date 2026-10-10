import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,ReactFlowProvider,Background,Handle,Position,MarkerType,useNodesInitialized} from '@xyflow/react';
import {Plus,Play,Gear,GitBranch,ArrowRight,ArrowsOut,X} from '@phosphor-icons/react';
import {t,useI18n} from './i18n';
import {conditionLabel} from './planning';
import {quickDialogueMatches,quickDialogueStructure,quickDialogueTopology} from './quickDialogueModel';
import './quickDialogue.css';

function GrowingText({value,inputRef,...props}) {
  const ref=useRef(null);
  useLayoutEffect(()=>{const field=ref.current;if(field){field.style.height='0px';field.style.height=`${Math.max(72,Math.min(320,field.scrollHeight+2))}px`;}},[value]);
  return <textarea {...props} value={value} ref={element=>{ref.current=element;inputRef?.(element);}}/>;
}

function SummaryNode({data}) {
  const {node,content,reachable,onLocate}=data;
  return <div className="quick-summary-node">
    <Handle type="target" position={Position.Left}/>
    <strong><button className="nodrag quick-summary-title" title={node.label || node.id} onClick={()=>onLocate(node.id)}>{node.label || node.id}</button></strong>
    <small>{content.characters.find(actor=>actor.id===node.speaker_id)?.name || t('旁白')}{!reachable&&<span> · {t('未连入开场')}</span>}</small>
    <p title={node.text}>{node.text || t('待填写对白')}</p>
    {node.options.map(option=><div className="quick-summary-choice" key={option.id}>
      <button className="nodrag" title={option.text} onClick={event=>{event.stopPropagation();onLocate(option.target_node_id || node.id);}}>{option.text || t('新选项')}{!option.target_node_id&&<small> · {t('结束')}</small>}</button>
      <Handle type="source" id={option.id} position={Position.Right}/>
    </div>)}
    {!node.options.length&&<small className="quick-summary-end">{t('结束节点')}</small>}
  </div>;
}
const summaryTypes={summary:SummaryNode};
function BranchOverview({graph,content,selectedId,onLocate,onClose,onEntryEdit}) {
  const [flow,setFlow]=useState(null),signature=quickDialogueTopology(graph);
  const initialized=useNodesInitialized(),canvasRef=useRef(null);
  const structure=useMemo(()=>quickDialogueStructure(graph),[signature]);
  useEffect(()=>{
    if(!flow || !initialized || !canvasRef.current)return;
    let frame;
    const fit=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const size=canvasRef.current?.getBoundingClientRect();if(size?.width>0&&size.height>0)flow.fitView({padding:.1,maxZoom:1,duration:0});});};
    fit();const observer=new ResizeObserver(fit);observer.observe(canvasRef.current);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[flow,initialized,signature]);
  const nodes=graph.nodes.map(node=>({id:node.id,type:'summary',position:structure.positions[node.id],selected:node.id===selectedId,data:{node,content,reachable:structure.reachable.has(node.id),onLocate}}));
  const edges=graph.nodes.flatMap(node=>node.options.filter(option=>structure.positions[option.target_node_id]).map(option=>({id:option.id,source:node.id,sourceHandle:option.id,target:option.target_node_id,type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed,color:'#a6866b'},style:{stroke:node.id===selectedId?'#d7b28c':'#78634e',strokeWidth:node.id===selectedId?1.8:1}})));
  return <aside className="quick-branch-overview" aria-label={t('分支概览')}>
    <header><strong><GitBranch size={14}/>{t('分支概览')}</strong><button className="icon-button" aria-label={t('缩小分支概览')} onClick={()=>flow?.zoomOut({duration:0})}>−</button><button className="icon-button" aria-label={t('放大分支概览')} onClick={()=>flow?.zoomIn({duration:0})}>+</button><button className="icon-button" aria-label={t('适配分支概览')} onClick={()=>flow?.fitView({padding:.1,maxZoom:1,duration:0})}><ArrowsOut size={14}/></button><button className="icon-button" aria-label={t('收起分支概览')} onClick={onClose}><X size={14}/></button></header>
    <div className="quick-entry-links"><button onClick={()=>onLocate(graph.entry_node_id)}>{t('默认开场')} · {graph.nodes.find(node=>node.id===graph.entry_node_id)?.label || t('对白')}</button>{graph.entry_routes.map((route,index)=><button key={index} title={conditionLabel(route.condition,content)} onClick={()=>onLocate(route.node_id)}>{t('条件开场 ')}{index+1} · {graph.nodes.find(node=>node.id===route.node_id)?.label || t('对白')}</button>)}<button className="quick-entry-settings" onClick={onEntryEdit}><Gear size={12}/>{t('配置开场规则')}</button></div>
    <div className="quick-overview-canvas" ref={canvasRef}><ReactFlow nodes={nodes} edges={edges} nodeTypes={summaryTypes} onInit={setFlow} onNodeClick={(_,node)=>onLocate(node.id)} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} deleteKeyCode={null} minZoom={.08} maxZoom={1.4} fitView fitViewOptions={{padding:.1,maxZoom:1}}><Background gap={18} size={.6} color="#4b4035"/></ReactFlow></div>
    <small className="quick-overview-help">{t('点击节点定位正文；拖动背景平移。')}</small>
  </aside>;
}

export function QuickDialogueEditor({graph,content,search,selectedId,focusRequest,busy,dirty,playBusy,onSelect,onLocate,onNodeChange,onOptionChange,onAddNode,onAddOption,onEdit,onTrial,onShowCanvas,onEntryEdit}) {
  useI18n();
  const refs=useRef(new Map());
  const [overview,setOverview]=useState(window.innerWidth>1150);
  const rows=graph.nodes.filter(node=>quickDialogueMatches(node,content.characters,search));
  const options=graph.nodes.reduce((sum,node)=>sum+node.options.length,0);
  const locateId=graph.nodes.some(node=>node.id===selectedId)?selectedId:graph.entry_node_id;
  const bind=(id,key,element)=>{if(!refs.current.has(id))refs.current.set(id,new Map());if(element)refs.current.get(id).set(key,element);else refs.current.get(id).delete(key);};
  useLayoutEffect(()=>{
    if(!focusRequest)return;
    const row=refs.current.get(focusRequest.nodeId);
    row?.get('article')?.scrollIntoView({block:'nearest',behavior:'auto'});
    (row?.get(focusRequest.optionId || 'text'))?.focus({preventScroll:true});
    if(focusRequest.optionId)row?.get(focusRequest.optionId)?.select();
  },[focusRequest]);
  const shortcut=(event,nodeId)=>{
    if(event.nativeEvent.isComposing || !event.target.matches('textarea,input') || !(event.ctrlKey||event.metaKey)||event.key!=='Enter')return;
    event.preventDefault();event.stopPropagation();
    if(!busy){if(event.shiftKey)onAddOption(nodeId);else onAddNode();}
  };
  return <div className={`quick-text-shell ${overview?'quick-overview-open':''}`}>
    <div className="quick-text-heading"><div><strong>{t('连续编辑')}</strong><small>{t('{0} 张对白 · {1} 个玩家选项',[graph.nodes.length,options])}</small>{search&&<small>{t('匹配 {0} / {1} 张对白',[rows.length,graph.nodes.length])}</small>}</div><div><button className="secondary" disabled={busy} onClick={onAddNode}><Plus size={13}/>{t('对白卡片')}</button><button className="secondary" aria-pressed={overview} onClick={()=>setOverview(!overview)}><GitBranch size={13}/>{t('分支概览')}</button><button className="secondary" onClick={()=>onShowCanvas(locateId)}>{t('定位到画布')}</button></div></div>
    <div className="quick-text-body">
      <div className="quick-text-scroll" aria-label={t('快速文本编辑区')}>
        {!rows.length&&<div className="quick-text-empty"><p>{t('没有匹配的对白或选项。')}</p><button className="secondary" onClick={()=>onLocate(locateId)}>{t('显示全部对白')}</button></div>}
        {rows.map((node,index)=><article key={node.id} className={`quick-text-article ${locateId===node.id?'active':''}`} ref={element=>bind(node.id,'article',element)} onFocusCapture={()=>onSelect(node.id)} onKeyDown={event=>shortcut(event,node.id)}>
          <fieldset disabled={busy}>
            <header><span className="quick-node-number">{index+1}</span><input className="quick-node-title" placeholder={t('对白标题')} aria-label={t('快速编辑标题 {0}',[node.id])} value={node.label || ''} onChange={event=>onNodeChange(node.id,{label:event.target.value})}/><select aria-label={t('快速编辑说话者 {0}',[node.id])} value={node.speaker_id || ''} onChange={event=>onNodeChange(node.id,{speaker_id:event.target.value || null})}><option value="">{t('旁白')}</option>{content.characters.map(actor=><option key={actor.id} value={actor.id}>{actor.name}</option>)}</select><button className="icon-button" aria-label={t('配置对白 {0}',[node.label || node.id])} onClick={()=>onEdit(node.id)}><Gear size={14}/></button></header>
            <div className="quick-node-metadata">{node.id===graph.entry_node_id&&<span>{t('默认开场')}</span>}{node.condition.op!=='always'&&<button title={conditionLabel(node.condition,content)} onClick={()=>onEdit(node.id)}>{t('出现条件')}</button>}{node.effects.length>0&&<button onClick={()=>onEdit(node.id)}>{t('{0} 个进入效果',[node.effects.length])}</button>}</div>
            <GrowingText inputRef={element=>bind(node.id,'text',element)} aria-label={t('快速编辑对白 {0}',[node.id])} placeholder={t('填写这张卡片的对白…')} value={node.text} onChange={event=>onNodeChange(node.id,{text:event.target.value})}/>
            <div className="quick-text-options">{node.options.map((option,i)=><div className="quick-text-option" key={option.id}>
              <span className="quick-choice-number">{i+1}</span><input ref={element=>bind(node.id,option.id,element)} aria-label={t('快速编辑选项 {0}',[option.id])} placeholder={t('玩家选项')} value={option.text} onChange={event=>onOptionChange(node.id,option.id,{text:event.target.value})}/>
              <div className="quick-target"><ArrowRight size={12}/><select aria-label={t('快速编辑跳转 {0}',[option.id])} value={option.target_node_id || ''} onChange={event=>onOptionChange(node.id,option.id,{target_node_id:event.target.value || null})}><option value="">{t('结束对话')}</option>{graph.nodes.map(target=><option key={target.id} value={target.id}>{target.label || target.id}</option>)}</select><button className="icon-button" disabled={!option.target_node_id} aria-label={t('定位选项目标 {0}',[option.id])} onClick={()=>onLocate(option.target_node_id)}><ArrowRight size={13}/></button></div>
              <button className={`icon-button quick-option-settings ${option.condition.op!=='always'||option.effects.length?'configured':''}`} aria-label={t('配置选项条件与效果 {0}',[option.id])} title={option.condition.op!=='always'?conditionLabel(option.condition,content):t('条件与效果')} onClick={()=>onEdit(node.id,option.id)}><Gear size={13}/></button>
              {(option.condition.op!=='always'||option.effects.length>0)&&<small className="quick-option-meta">{option.condition.op!=='always'&&t('条件分支')}{option.condition.op!=='always'&&option.effects.length>0&&' · '}{option.effects.length>0&&t('{0} 个效果',[option.effects.length])}</small>}
            </div>)}</div>
            <footer><button onClick={()=>onAddOption(node.id)}><Plus size={12}/>{t('玩家选项')}</button><button disabled={dirty||playBusy} title={dirty?t('先保存编排，再试玩这张卡片'):t('从这张卡片试玩')} onClick={()=>onTrial(node.id)}><Play size={12}/>{t('试玩本卡片')}</button>{!node.options.length&&<small>{t('结束节点')}</small>}</footer>
          </fieldset>
        </article>)}
        {rows.length>0&&<button className="quick-add-node secondary" disabled={busy} onClick={onAddNode}><Plus size={14}/>{t('新增对白卡片')}</button>}
      </div>
      <div className="quick-overview-shell" hidden={!overview}><ReactFlowProvider><BranchOverview graph={graph} content={content} selectedId={locateId} onLocate={onLocate} onClose={()=>setOverview(false)} onEntryEdit={onEntryEdit}/></ReactFlowProvider></div>
    </div>
    <div className="quick-text-shortcuts">{t('Ctrl / ⌘ Enter 新增对白 · Ctrl / ⌘ Shift Enter 添加选项；新增对白不会自动接入分支。')}</div>
  </div>;
}
