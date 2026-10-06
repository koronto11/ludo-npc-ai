import {MoreDetails} from './MoreDetails';
import {authorEntityCommands,editedLevel} from './moreDetailsModel';
import {CharacterImportanceBadge} from './CharacterImportance';
import { t, tm, useI18n } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType } from '@xyflow/react';
import { Plus, Play, FloppyDisk, ChatText, GitBranch, PencilSimple, X, ArrowCounterClockwise, MapPin, Rows, Graph, ArrowsOut } from '@phosphor-icons/react';
import { roleDialogueTree } from './roleDialogueTree';
import { updateDialogueNodeState } from './dialogueCanvasState';
import { DialogueEdge, DialogueEdgeTools } from './DialogueEdge';
import { dialogueEdges, pruneDialogueEdges } from './dialogueEdges';
import { RoleDialogueLibrary } from './RoleDialogueLibrary';
import { useNavigationEditor } from './UnsavedNavigation';
import { ConditionEditor, EffectsEditor } from './StoryAuthoring';
import { RolePreview } from './RolePreview';
import { useDialoguePlay } from './useDialoguePlay';
import { recordDialogueId, replayRecordInputs } from './dialoguePlayModel';
import { dialoguesFor, appearanceLabel, clone, uid, conditionLabel } from './planning';

function DialogueCard({ data, selected }) {
  useI18n();
  const { node, content:c } = data;
  return <article className={`dialogue-flow-card ${selected ? 'selected' : ''} ${data.visited ? 'visited' : ''} ${data.active ? 'active-preview' : ''}`} data-testid={`dialogue-node-${node.id}`} onContextMenu={event=>{event.preventDefault();event.stopPropagation();data.onTrialMenu(node.id,event.clientX,event.clientY);}}>
    <Handle type="target" id="in" position={Position.Left}/>
    <header><ChatText size={16}/><strong>{node.label || t("对白")}</strong><button className="nodrag icon-button" aria-label={t("配置对白 {0}", [node.label || node.id])} onClick={event => { event.stopPropagation(); data.onEdit(node.id); }}><PencilSimple size={14}/></button></header>
    <small className="dialogue-speaker">{c.characters.find(a => a.id === node.speaker_id)?.name || t("旁白")}</small>
    <p>{node.text || t("点击编辑，填写这张卡片的对白")}</p>
    {node.condition.op !== 'always' && <small className="flow-condition">◇ {conditionLabel(node.condition,c)}</small>}
    {node.effects.length > 0 && <small className="flow-effect">{t("进入时执行 ")}{node.effects.length}{t(" 个效果")}</small>}
    <div className="flow-options">{node.options.map((o,i) => <div key={o.id} className={data.selectedOptionId === o.id ? 'editing-option' : ''}>
      <button className="nodrag" aria-label={t("编辑玩家选项 {0}：{1}", [i+1, o.text || t("新选项")])} title={t("点击编辑文字、条件、效果与跳转")} onClick={event => { event.stopPropagation(); data.onEdit(node.id,o.id); }}>
        <span className="flow-option-label">{i+1}. {o.text || t("新选项")}{o.condition.op !== 'always' && <small>{t("◇ 条件分支")}</small>}{o.effects.length > 0 && <small>↳ {o.effects.length}{t(" 个效果")}</small>}</span><PencilSimple size={12} className="flow-option-edit"/>
      </button>
      <Handle type="source" id={o.id} position={Position.Right} style={{ top:'50%' }}/>
    </div>)}</div>
    <footer><button className="nodrag" aria-label={t("为 {0} 添加玩家选项", [node.label || t("对白")])} onClick={event => { event.stopPropagation(); data.onAddOption(node.id); }}><Plus size={12}/>{t("玩家选项")}</button><small>{node.options.length ? t("点击选项编辑 · 拖动出口连线") : t("结束节点")}</small></footer>
  </article>;
}
function EntryCard({ data }) {
  useI18n(); return <article className="dialogue-entry-card"><strong><GitBranch/>{t(" 开场规则")}<button className="nodrag icon-button" aria-label={t("调整对白开场规则")} onClick={event=>{event.stopPropagation();data.onSettings();}}><PencilSimple size={13}/></button></strong><div>{t("默认开场：")}{data.graph.nodes.find(n=>n.id===data.graph.entry_node_id)?.label || t("对白")}<Handle type="source" id="default" position={Position.Right}/></div>{data.routes.map((route,i) => <div key={i}><button className="nodrag" onClick={event => { event.stopPropagation(); data.onEdit(i); }}>{t("条件开场 ")}{i+1} → {data.graph.nodes.find(n=>n.id===route.node_id)?.label || t("对白")}<small>{conditionLabel(route.condition,data.content)}</small></button><Handle type="source" id={`route-${i}`} position={Position.Right}/></div>)}<small>{data.routes.length?t("先检查条件开场，均不匹配时使用默认开场"):t("始终从默认开场进入")}</small></article>; }
function EntrySettings({ graph, content, update, editRoute }) {
  useI18n();
  return <div className="dialogue-entry-settings"><p>{t("开场规则决定从哪张卡片开始；玩家选项的条件决定哪些回答可以点击。")}</p><label>{t("默认开场")}<select aria-label={t("默认开场卡片")} value={graph.entry_node_id} onChange={e=>update({entry_node_id:e.target.value})}>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.label || t("对白")}</option>)}</select></label>
    {graph.entry_routes.length>0&&<><div className="entry-default-action"><button className="secondary" onClick={()=>update({entry_routes:[]})}>{t("仅使用默认开场")}</button><small>{t("移除 ")}{graph.entry_routes.length}{t(" 条条件开场，保留玩家选项条件。保存前可放弃修改。")}</small></div><h4>{t("条件开场 · 优先匹配")}</h4>{graph.entry_routes.map((route,i)=><article key={i}><strong>{i+1}. {graph.nodes.find(n=>n.id===route.node_id)?.label || t("对白")}</strong><p>{conditionLabel(route.condition,content)}</p><div><button className="secondary" onClick={()=>editRoute(i)}>{t("编辑条件")}</button><button className="subtle-button danger" onClick={()=>update({entry_routes:graph.entry_routes.filter((_,index)=>index!==i)})}>{t("移除")}</button></div></article>)}</>}
    {!graph.entry_routes.length&&<p>{t("当前仅使用默认开场。可在工具栏添加“条件开场”，用于受伤、任务完成等不同开局。")}</p>}
  </div>;
}
function EndCard() {
  useI18n(); return <article className="dialogue-end-card"><Handle type="target" id="in" position={Position.Left}/><strong>{t("结束对话")}</strong><small>{t("无后续跳转")}</small></article>; }
const nodeTypes = { speech:DialogueCard, entrance:EntryCard, ending:EndCard };
const edgeTypes = { routed:DialogueEdge };
export function autoPositions(graph) {
  const depth = new Map([[graph.entry_node_id,0]]); const queue = [graph.entry_node_id];
  while (queue.length) { const id = queue.shift(); const node = graph.nodes.find(n => n.id === id); for (const option of node?.options || []) if (option.target_node_id && !depth.has(option.target_node_id)) { depth.set(option.target_node_id,depth.get(id)+1); queue.push(option.target_node_id); } }
  const counts = new Map();
  return Object.fromEntries(graph.nodes.map(node => { const column = depth.get(node.id) ?? 0; const index = counts.get(column) || 0; counts.set(column,index+1); return [node.id,{ x:340+column*350,y:40+index*340 }]; }));
}
export function RoleWorkbench({ onGlobalRecords, local, rehearsal:r, characterId, context, onTemplate, onWorkbench, onLocate, onRelation, onGenerate, announce, onDirtyChange, onNavigationHandlers, onNavigate }) {
  useI18n();
  const doc = local.project._document; const c = doc?.content;
  const actor = c?.characters.find(a => a.id === characterId) || c?.characters[0];
  const level = c?.levels.find(l => l.id === context?.levelId);
  const appearance = level?.appearances.find(a => a.id === context?.appearanceId && a.character_id===actor?.id);
  const [graphId, setGraphId] = useState(''); const [draft, setDraft] = useState(null); const [positions, setPositions] = useState({}); const [selection, setSelection] = useState(null); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [mode, setMode] = useState('canvas'); const [search, setSearch] = useState(''); const [flow, setFlow] = useState(null); const [showPreview, setShowPreview] = useState(true);
  const [compactPane,setCompactPane]=useState('edit');
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [reloadError,setReloadError]=useState('');
  const reloadLatest=()=>onNavigate(async()=>{try{await local.refresh(true);setReloadError('');}catch(reason){setReloadError(reason.message);}},'载入最新工程');
  const baseRef=useRef(null);
  const draftRef = useRef(null); draftRef.current = draft;
  const [nodeState, setNodeState] = useState({});
  const [edgeLayouts,setEdgeLayouts] = useState({});
  const [selectedEdge,setSelectedEdge] = useState(null);
  const [trialMenu,setTrialMenu] = useState(null);
  const play = useDialoguePlay(local,draft,level,appearance,context);
  const trialMenuRef = useRef(null);
  useEffect(()=>{
    const close=event=>{if(!trialMenuRef.current?.contains(event.target))setTrialMenu(null);};
    const escape=event=>{if(event.key==='Escape')setTrialMenu(null);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[]);
  const optionInputRef = useRef(null);
  useEffect(() => {
    if (selection?.optionId && mode === 'canvas') {
      optionInputRef.current?.focus();
      optionInputRef.current?.select();
    }
  }, [selection?.nodeId,selection?.optionId,mode]);
  const load = graph => { baseRef.current=clone(c.dialogues.find(row=>row.id===graph?.id) || null);setGraphId(graph?.id || ''); setDraft(graph ? clone(graph) : null); setPositions(graph ? { ...autoPositions(graph),...(doc.editor.dialogue_layouts?.[graph.id] || {}) } : {}); setNodeState({}); setEdgeLayouts(clone(doc.editor.dialogue_edges?.[graph?.id] || {})); setSelectedEdge(null); setSelection(null); setDirty(false); setError(''); };
  const freshGraph = () => { const nodeId=uid('node');return {id:uid('dialogue'),kind:'dialogue',name:`${actor.name} · ${level?.tracks.find(t=>t.id===appearance?.track_id)?.name || '新对白'}`,description:'',tags:[],character_id:actor.id,entry_node_id:nodeId,entry_routes:[],nodes:[{id:nodeId,label:'开场',speaker_id:actor.id,text:'',condition:{op:'always'},effects:[],options:[]}]}; };
  useEffect(() => {
    if(!c || !actor)return;
    if(context?.createDialogueNonce){const graph=freshGraph();load(graph);setDirty(true);edit(graph.entry_node_id);return;}
    const graphs=appearance?dialoguesFor(c,appearance):c.dialogues.filter(graph=>graph.character_id===actor.id || (!graph.character_id && graph.id===context?.dialogueId));
    load(graphs.find(graph=>graph.id===context?.dialogueId) || graphs[0] || null);
  }, [doc?.project_id,actor?.id,context?.levelId,context?.appearanceId,context?.dialogueId,context?.createDialogueNonce]);
  useEffect(() => { if (!dirty && draftRef.current) { const saved = c?.dialogues.find(d => d.id === draftRef.current.id); if (saved) { baseRef.current=clone(saved);setDraft(clone(saved)); setPositions({ ...autoPositions(saved),...(doc.editor.dialogue_layouts?.[saved.id] || {}) }); setEdgeLayouts(clone(doc.editor.dialogue_edges?.[saved.id] || {})); } } }, [doc?.revision]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty,onDirtyChange]);
  useEffect(() => { const handler=e=>{ if (dirty) { e.preventDefault(); e.returnValue=''; } }; window.addEventListener('beforeunload',handler); return () => window.removeEventListener('beforeunload',handler); }, [dirty]);
  const update = patch => { setEdgeLayouts(v=>pruneDialogueEdges(v,{...draft,...patch},!!patch.entry_routes && JSON.stringify(patch.entry_routes)!==JSON.stringify(draft.entry_routes))); setDraft(v => ({ ...v,...patch })); setDirty(true); setError(''); };
  const patchNode = (id, patch) => update({ nodes:draft.nodes.map(n => n.id === id ? { ...n,...patch } : n) });
  const patchOption = (nodeId, optionId, patch) => patchNode(nodeId,{ options:draft.nodes.find(n => n.id === nodeId).options.map(o => o.id === optionId ? { ...o,...patch } : o) });
  const edit = (nodeId, optionId = null) => {setSelectedEdge(null);setSelection({ nodeId,optionId });};
  const changeEdge = (id,patch) => {if(patch.points?.length>8){announce(t("最多添加 8 个走线控制点"));return;}setEdgeLayouts(v=>({...v,[id]:{...v[id],...patch}}));setDirty(true);setError('');};
  const addOption = nodeId => { const option = { id:uid('option'),text:'新选项',condition:{op:'always'},effects:[],target_node_id:null }; patchNode(nodeId,{options:[...draft.nodes.find(n => n.id === nodeId).options,option]}); edit(nodeId,option.id); };
  const addNode = () => { const node = { id:uid('node'),label:'新对白',speaker_id:actor.id,text:'',condition:{op:'always'},effects:[],options:[] }; update({nodes:[...draft.nodes,node]}); setPositions(v => ({ ...v,[node.id]:{x:340+draft.nodes.length%3*350,y:40+Math.floor(draft.nodes.length/3)*340} })); edit(node.id); };
  const create = () => onWorkbench(level,appearance,actor.id,undefined,{create:true,unscoped:!appearance});
  const save = async () => {
    if(!draft||busy)return false;setBusy(true);setError('');
    try {
      const updated=await local.transact(latest=>{
        const exists=latest.content.dialogues.some(row=>row.id===draft.id);
        const commands=authorEntityCommands(baseRef.current,draft,latest);
        commands.push({type:'put_dialogue_layout',dialogue_id:draft.id,positions:Object.fromEntries(Object.entries(positions).filter(([key])=>draft.nodes.some(node=>node.id===key))),edges:pruneDialogueEdges(edgeLayouts,draft)});
        if(!exists&&appearance){
          const ids=appearance.dialogue_ids.length?appearance.dialogue_ids:c.dialogues.filter(row=>row.character_id===actor.id).map(row=>row.id);
          commands.push({type:'put_level',level:editedLevel(level,{...level,appearances:level.appearances.map(row=>row.id===appearance.id?{...row,dialogue_ids:[...ids,draft.id]}:row)},latest)});
        }
        return commands;
      });
      const saved=updated.content.dialogues.find(row=>row.id===draft.id);baseRef.current=clone(saved);setDraft(clone(saved));setDirty(false);announce(t("对白编排已保存"));return true;
    }catch(reason){setError(reason.message);return false;}finally{setBusy(false);}
  };
  const discard = () => { const tree=roleDialogueTree(c,actor.id);load(c.dialogues.find(d=>d.id===graphId) || (appearance?dialoguesFor(c,appearance)[0]:tree.common[0] || tree.unlinked[0]));return true; };
  useNavigationEditor(onNavigationHandlers,{dirty,busy,name:draft?.name || '对白编排',save:()=>save(),discard});
  const connect = connection => { const target = connection.target === '__end' ? null : connection.target; if (connection.target === '__entry' || connection.source === '__end') return; if (connection.source === '__entry') { if (!target) return; if (connection.sourceHandle === 'default') update({entry_node_id:target}); else { const index = Number(connection.sourceHandle.replace('route-','')); update({entry_routes:draft.entry_routes.map((route,i) => i === index ? {...route,node_id:target} : route)}); } } else patchOption(connection.source,connection.sourceHandle,{target_node_id:target}); };
  const active = play.result?.dialogues.find(d => d.id === draft?.id);
  const visited = new Set((play.result?.log || []).filter(item => item.kind === 'node' && item.source_id?.startsWith(`${draft?.id}:`)).map(item => item.source_id.slice(draft.id.length+1)));
  const chosenOptions = new Set((play.result?.log || []).filter(item => item.kind === 'choice').map(item => item.source_id));
  const graphNodes = useMemo(() => draft ? [
    {id:'__entry',type:'entrance',position:{x:20,y:40},draggable:false,data:{graph:draft,routes:draft.entry_routes,content:c,onEdit:index=>setSelection({routeIndex:index}),onSettings:()=>setSelection({entrySettings:true})}},
    ...draft.nodes.map(node => ({id:node.id,type:'speech',position:positions[node.id] || {x:340,y:40},selected:selection?.nodeId===node.id,data:{node,content:c,onEdit:edit,onAddOption:addOption,onTrialMenu:(nodeId,x,y)=>setTrialMenu({nodeId,x,y}),selectedOptionId:selection?.nodeId===node.id?selection.optionId:null,active:active?.available && active.node_id===node.id,visited:visited.has(node.id)}})),
    {id:'__end',type:'ending',position:{x:Math.max(800,...Object.values(positions).map(p=>p.x+360)),y:40},draggable:false,data:{}}
  ].map(n=>({...n,...nodeState[n.id],style:search && n.type==='speech' && !`${n.data.node.text} ${n.data.node.label}`.includes(search)?{opacity:.25}:undefined})) : [], [draft,positions,nodeState,search,selection,doc?.revision,active?.node_id,active?.available,play.result?.log]);
  const graphEdges = draft ? dialogueEdges(draft).map(edge=>{
    const chosen=chosenOptions.has(edge.choiceId);
    const color=edgeLayouts[edge.id]?.color || (chosen?'#96b4a0':'#a6866b');
    return {...edge,type:'routed',selected:selectedEdge===edge.id,animated:chosen,markerEnd:{type:MarkerType.ArrowClosed,color},style:{stroke:color,strokeWidth:chosen?2.6:1.4},data:{layout:edgeLayouts[edge.id],onChange:changeEdge,onSelect:setSelectedEdge}};
  }) : [];
  const activeEdge=graphEdges.find(edge=>edge.id===selectedEdge);
  if (!c) return <div className="empty-state">{t("正在载入角色工作台…")}</div>;
  if (!actor) return <div className="planning-empty workspace-empty"><ChatText size={36}/><h2>{t("先创建一个人物")}</h2><p>{t("从左侧资料库添加人物，再进入对白与预演。")}</p></div>;
  const node = draft?.nodes.find(n => n.id === selection?.nodeId); const option = node?.options.find(o => o.id === selection?.optionId); const route = draft?.entry_routes[selection?.routeIndex];
  const sceneName=appearance?level.tracks.find(track=>track.id===appearance.track_id)?.name || '待安排场景':'通用 / 未关联对白';
  const openTreeGraph = (scene,graph) => {if(scene?.appearance.id===appearance?.id && scene?.level.id===level?.id && graph?.id===draft?.id)return;onWorkbench(scene?.level,scene?.appearance,actor.id,graph?.id,{unscoped:!scene});};
  const startCard = nodeId => {if(dirty){announce(t("先保存编排，再试玩这张卡片"));return;}if(play.restart(nodeId,false)){setShowPreview(true);setCompactPane('play');setTrialMenu(null);}};
  const replayRecord = record => {
    const target=c.dialogues.find(g=>g.id===(recordDialogueId(record) || draft?.id));
    if(!target)return;
    const targetLevel=c.levels.find(l=>l.id===record.inputs.level_id);
    const occurrence=targetLevel?.appearances.find(a=>a.character_id===target.character_id && targetLevel.tracks.find(t=>t.id===a.track_id)?.location_id===record.inputs.location_id && (!a.dialogue_ids.length || a.dialogue_ids.includes(target.id)));
    onWorkbench(targetLevel,occurrence,target.character_id || actor.id,target.id,{unscoped:!occurrence,replayInputs:replayRecordInputs(record,target.id)});
  };
  return <div className="role-workspace"><div className="planning-heading"><div><small>{t("角色场景工作台 / 编排与预演")}</small><h1>{actor.name} <span>{actor.role}</span><CharacterImportanceBadge value={actor.importance}/></h1><p className="role-context-path" aria-label={t("当前对白上下文")}>{actor.name}<span>/</span>{sceneName}<span>/</span>{draft?.name || t("尚无对白")}</p>{appearance&&<small className="role-context-interval">{appearanceLabel(level,appearance)}</small>}</div><div className="planning-actions">{onTemplate&&<button className="secondary" disabled={busy||dirty||!c.dialogues.some(g=>g.id===draft?.id)} title={dirty?t("先保存编排，再保存结构模板"):t("仅复用对白正文、选项和跳转")} onClick={()=>onTemplate(draft?.id)}>{t("保存结构模板")}</button>}<button className="secondary" onClick={()=>onRelation(actor.id)}>{t("人物设定")}</button><button className="secondary role-preview-toggle" onClick={()=>onNavigate?onNavigate(()=>setShowPreview(!showPreview),showPreview?'收起预演':'展开预演'):setShowPreview(!showPreview)}><Play/>{showPreview?t("收起预演"):t("展开预演")}</button><button className="primary" disabled={!dirty || busy} onClick={()=>save()}><FloppyDisk/>{busy?t("保存中…"):t("保存编排")}</button></div></div>
    {trialMenu&&<div ref={trialMenuRef} className="play-card-menu" role="menu" aria-label={t("对白卡片操作")} style={{left:Math.min(trialMenu.x,window.innerWidth-190),top:Math.min(trialMenu.y,window.innerHeight-100)}}><button role="menuitem" disabled={dirty || busy || play.busy} onClick={()=>startCard(trialMenu.nodeId)}><Play size={14}/>{t("从这张卡片试玩")}</button><button role="menuitem" onClick={()=>{edit(trialMenu.nodeId);setTrialMenu(null);}}>{t("编辑卡片")}</button></div>}
    <div className="role-compact-controls"><button className="secondary" aria-expanded={libraryOpen} onClick={()=>setLibraryOpen(!libraryOpen)}>{t('选择出场与对白')}</button><div role="tablist" aria-label={t('角色工作区')}><button role="tab" aria-selected={compactPane==='edit'} onClick={()=>setCompactPane('edit')}>{t('编排')}</button><button role="tab" aria-selected={compactPane==='play'} onClick={()=>{setShowPreview(true);setCompactPane('play');}}>{t('试玩')}</button></div></div>
    {reloadError&&<p className="danger role-error" role="alert">{tm(reloadError)}</p>}
    <div className={`role-stage ${showPreview?'with-preview':''} compact-${compactPane} ${libraryOpen?'library-open':''}`}><div className="role-library-shell"><button className="secondary role-library-close" onClick={()=>setLibraryOpen(false)}>{t('关闭对白目录')}</button><RoleDialogueLibrary local={local} actor={actor} level={level} appearance={appearance} draft={draft} dirty={dirty} busy={busy} onOpen={(scene,graph)=>{openTreeGraph(scene,graph);setLibraryOpen(false);}} onCreate={scene=>onWorkbench(scene?.level,scene?.appearance,actor.id,undefined,{create:true,unscoped:!scene})} onLocate={onLocate} onNavigate={onNavigate} onGenerate={onGenerate} announce={announce}/></div>
      <div className="role-editor">{draft&&<MoreDetails value={draft} label={t("对白")} disabled={busy} onChange={update}/>}<div className="dialogue-toolbar"><div className="dialogue-view-tabs"><button className={mode==='canvas'?'active':''} onClick={()=>setMode('canvas')}><Graph/>{t("画布")}</button><button className={mode==='list'?'active':''} onClick={()=>setMode('list')}><Rows/>{t("文本列表")}</button></div><button className="secondary" disabled={!draft || busy} onClick={addNode}><Plus/>{t("对白卡片")}</button><button className="secondary" disabled={!draft || busy} onClick={()=>{update({entry_routes:[...draft.entry_routes,{node_id:draft.entry_node_id,condition:{op:'always'}}]});setSelection({routeIndex:draft.entry_routes.length});}}><GitBranch/>{t("条件开场")}</button><button className="icon-button" aria-label={t("整理对白画布")} disabled={!draft} onClick={()=>{setPositions(autoPositions(draft));setDirty(true);setTimeout(()=>flow?.fitView({padding:.12,duration:200}),50);}}><ArrowsOut/></button><input aria-label={t("搜索对白节点")} placeholder={t("搜索对白…")} value={search} onChange={e=>setSearch(e.target.value)}/></div>
        {!draft ? <div className="planning-empty workspace-empty"><ChatText size={36}/><h2>{t("为 ")}{actor.name}{t(" 编写第一段对白")}</h2><p>{t("对白、玩家选项和条件分支都在画布上组织，右侧直接预演。")}</p><button className="primary" onClick={create}><Plus/>{t("新建场景对白")}</button></div> : <><div className="dialogue-title-row"><input aria-label={t("对白流程名称")} value={draft.name} onChange={e=>update({name:e.target.value})}/><span>{dirty?t("● 未保存编排"):t("已保存")}</span>{dirty&&<button className="dialogue-discard-button" disabled={busy} onClick={discard}><ArrowCounterClockwise size={15}/>{t("放弃未保存编排")}</button>}</div>
          <div className={`dialogue-edit-stage ${selection?'with-properties':''}`}>
            <div className="dialogue-canvas">{mode==='canvas'?<ReactFlow key={`${actor.id}-${draft.id}`} nodes={graphNodes} edges={graphEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onEdgeClick={(event,edge)=>{event.stopPropagation();setSelectedEdge(edge.id);}} onPaneClick={()=>setSelectedEdge(null)} onInit={setFlow} onConnect={connect} onNodeClick={(event,n)=>{if(n.type==='speech' && !event.target.closest('button,input,textarea,select,.react-flow__handle'))edit(n.id);}} onNodesChange={changes=>{setNodeState(v=>updateDialogueNodeState(v,changes));const moves=changes.filter(change=>change.type==='position'&&change.position&&draft.nodes.some(n=>n.id===change.id));if(moves.length){setPositions(v=>({...v,...Object.fromEntries(moves.map(m=>[m.id,m.position]))}));setDirty(true);}}} fitView fitViewOptions={{padding:.08,maxZoom:1,minZoom:.75,nodes:[{id:'__entry'},{id:draft.entry_node_id}]}} minZoom={.15} maxZoom={1.5} deleteKeyCode={null}><Background gap={18} size={.8} color="#514638"/><Controls showInteractive={false}/></ReactFlow>:<div className="dialogue-text-list">{draft.nodes.filter(n=>`${n.label} ${n.text}`.includes(search)).map(n=><article key={n.id}><header><strong>{n.label || t("对白")}</strong><button onClick={()=>edit(n.id)}>{t("条件与选项")}</button></header><textarea aria-label={t("列表对白 {0}", [n.id])} value={n.text} onChange={e=>patchNode(n.id,{text:e.target.value})}/>{n.options.map(o=><div className="text-option" key={o.id}><span>↳</span><input aria-label={t("列表选项 {0}", [o.id])} value={o.text} onChange={e=>patchOption(n.id,o.id,{text:e.target.value})}/><small>{draft.nodes.find(target=>target.id===o.target_node_id)?.label || t("结束")}</small></div>)}</article>)}</div>}{mode==='canvas'&&activeEdge&&<DialogueEdgeTools edge={activeEdge} layout={edgeLayouts[activeEdge.id] || {}} onChange={changeEdge} onClose={()=>setSelectedEdge(null)}/>}</div>
            {selection && <aside className="dialogue-properties"><header><strong>{selection.entrySettings?t("开场规则"):route?t("条件开场"):option?t("玩家选项"):t("对白卡片")}</strong><button className="icon-button" aria-label={t("收起对白配置")} onClick={()=>setSelection(null)}><X/></button></header>{selection.entrySettings?<EntrySettings graph={draft} content={c} update={update} editRoute={index=>setSelection({routeIndex:index})}/>:route?<><p className="entry-rule-help">{t("此条件决定开场起点，匹配时会跳过默认开场。要让玩家主动选择，请在玩家选项上设置条件。")}</p><label>{t("进入节点")}<select aria-label={t("条件入口目标")} value={route.node_id} onChange={e=>update({entry_routes:draft.entry_routes.map((row,i)=>i===selection.routeIndex?{...row,node_id:e.target.value}:row)})}>{draft.nodes.map(n=><option key={n.id} value={n.id}>{n.label || n.id}</option>)}</select></label><ConditionEditor content={c} value={route.condition} onChange={condition=>update({entry_routes:draft.entry_routes.map((row,i)=>i===selection.routeIndex?{...row,condition}:row)})}/><button className="subtle-button danger" onClick={()=>{update({entry_routes:draft.entry_routes.filter((_,i)=>i!==selection.routeIndex)});setSelection(null);}}>{t("移除此条件开场")}</button></>:node?<>{option?<><p className="option-edit-context">{node.label || t("对白")}{t(" · 第 ")}{node.options.findIndex(o=>o.id===option.id)+1}{t(" 个选项")}</p><label>{t("玩家选项")}<input ref={optionInputRef} aria-label={t("画布玩家选项")} value={option.text} onChange={e=>patchOption(node.id,option.id,{text:e.target.value})}/></label><label>{t("跳转到")}<select aria-label={t("画布选项跳转")} value={option.target_node_id || ''} onChange={e=>patchOption(node.id,option.id,{target_node_id:e.target.value || null})}><option value="">{t("结束对话")}</option>{draft.nodes.map(n=><option key={n.id} value={n.id}>{n.label || n.id}</option>)}</select></label><h4>{t("可选择条件")}</h4><ConditionEditor content={c} value={option.condition} onChange={condition=>patchOption(node.id,option.id,{condition})}/><EffectsEditor content={c} value={option.effects} onChange={effects=>patchOption(node.id,option.id,{effects})}/><button className="subtle-button danger" onClick={()=>{patchNode(node.id,{options:node.options.filter(o=>o.id!==option.id)});edit(node.id);}}>{t("删除此选项")}</button></>:<><button className="secondary" disabled={dirty || busy || play.busy} onClick={()=>startCard(node.id)}><Play size={14}/>{t("从这张卡片试玩")}</button><label>{t("卡片标题")}<input aria-label={t("画布对白标题")} value={node.label || ''} onChange={e=>patchNode(node.id,{label:e.target.value})}/></label><label>{t("说话者")}<select aria-label={t("画布对白说话者")} value={node.speaker_id || ''} onChange={e=>patchNode(node.id,{speaker_id:e.target.value || null})}><option value="">{t("旁白")}</option>{c.characters.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label><label>{t("对白")}<textarea aria-label={t("画布对白内容")} value={node.text} onChange={e=>patchNode(node.id,{text:e.target.value})}/></label><h4>{t("出现条件")}</h4><ConditionEditor content={c} value={node.condition} onChange={condition=>patchNode(node.id,{condition})}/><EffectsEditor label={t("进入卡片时的效果")} content={c} value={node.effects} onChange={effects=>patchNode(node.id,{effects})}/><button className="secondary" onClick={()=>addOption(node.id)}><Plus/>{t("添加玩家选项")}</button><button className="subtle-button" onClick={()=>update({entry_node_id:node.id})}>{t("设为默认入口")}</button><button className="subtle-button danger" disabled={draft.nodes.length<=1} onClick={()=>{const nodes=draft.nodes.filter(n=>n.id!==node.id).map(n=>({...n,options:n.options.map(o=>o.target_node_id===node.id?{...o,target_node_id:null}:o)}));update({nodes,entry_node_id:draft.entry_node_id===node.id?nodes[0].id:draft.entry_node_id,entry_routes:draft.entry_routes.filter(route=>route.node_id!==node.id)});setPositions(Object.fromEntries(Object.entries(positions).filter(([id])=>id!==node.id)));setSelection(null);}}>{t("删除这张卡片")}</button></>}</>:null}</aside>}
          </div><div className="dialogue-footer"><span>{t("点击选项编辑 · 右键卡片试玩 · 点击连线标色与调整走线")}</span></div></>}
        {error&&<p className="danger role-error" role="alert">{tm(error)}</p>}
      </div>
      {showPreview&&<RolePreview local={local} onGlobalRecords={onGlobalRecords} onReload={reloadLatest} play={play} actor={actor} draft={draft} authorDirty={dirty} saving={busy} onSave={()=>save()} onReplayRecord={replayRecord} canLocate={mode==='canvas' && !!flow} onLocateNode={id=>{const position=positions[id];if(position&&flow)flow.setCenter(position.x+140,position.y+(nodeState[id]?.measured?.height || 180)/2,{zoom:flow.getViewport().zoom,duration:200});}}/>}
    </div>
  </div>;
}
