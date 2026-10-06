import {MoreDetails,DraftCloseGuard,useDraftClose} from './MoreDetails';
import {editedLevel} from './moreDetailsModel';
import {legacyRegionCommands} from './worldEditorModel';
import { t, tm, useI18n } from './i18n';
import { AppearanceDialogueCheck } from './AppearanceDialogueCheck';
import { levelDialogueChecks } from './appearanceDialogue';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, Users, Play, PencilSimple, ArrowCounterClockwise, ArrowClockwise, MapPin, Flag, DotsSixVertical, ChatText, Check, X } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { useNavigationEditor } from './UnsavedNavigation';
import { PlotDirector } from './PlotDirector';
import { PlotEventCard } from './PlotEventCard';
import { resizedControlWidth } from './controlWidths';
import {controlKey, levelControlKeys, layoutControls, insertionPoint, reorderedControls, dragDelta, dragTimeDelta, edgeScroll} from './levelControlLayout';
import { movePlotEvent, plotsForActor } from './plotPlanning';
import { ConditionEditor } from './StoryAuthoring';
import { uid, clone, newAppearance, moveAnchor, removeAnchor, removeTrack, placeAppearance, conditionLabel } from './planning';
import { NpcGroupCard, NpcMemberEditor, NpcGroupSettings } from './NpcGroupCards';
import { npcGroupBounds, moveNpcGroup } from './npcGroups';
import { sceneContent } from './sceneGeneration';
import { AxisIcon, axisColor, AxisMarkerPicker, AxisNodeMenu, AxisNodeModal } from './AxisNodes';

const levelEventsKey=(content,level)=>content?.events.filter(e=>e.scope?.level_id===level?.id).map(e=>e.id).join('|');

export function LevelCanvas({ onWorld, onCharacters, local, levelId, initialSettingsRequest, onSettingsOpened, locatedAppearance, locatedTrack, onLevel, onSelect, onWorkbench, onPlace, onCrowd, onNpcReview, onSceneContent, announce, onDirtyChange, rehearsal, initialPlotRequest, onPlot, onNavigationHandlers, onNavigate }) {
  useI18n();
  const c = local.project._document?.content;
  const levels = c?.levels || [];
  const level = levels.find(l => l.id === levelId) || levels[0];
  const dialogueProblems=level?levelDialogueChecks(c,level).filter(r=>r.problems.length):[];
  const [modal, setModal] = useState(null);
  const [collapsedGroups,setCollapsedGroups]=useState({});
  const groupCollapsed = id => collapsedGroups[id] ?? false;
  const [widthOverrides,setWidthOverrides]=useState({});
  const [plotRequest,setPlotRequest] = useState(null);
  const [plotDirty,setPlotDirty] = useState(false);
  const showPlot = request => {if(nameEdit || plotDirty || busy){announce(t("请先保存或放弃当前编辑"));return;}setPlotRequest({...request,nonce:uid('plot-panel')});setSelected('');};
  const [nameEdit, setNameEdit] = useState(null);
  const [nodeMenu, setNodeMenu] = useState(null);
  const menuTargetRef = useRef(null);
  const saveRef = useRef(false);
  const nameSaveRef = useRef(false);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = busy || !!nameEdit || plotDirty;
  const [axes, setAxes] = useState({ x: true, y: true });
  const [scale, setScale] = useState(30);
  const [drag, setDrag] = useState(null);
  const [controlHeights,setControlHeights]=useState({});
  const layoutRef=useRef(new Map());
  const moveRef=useRef(null);

  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const movedPlotRef = useRef(0);
  useLayoutEffect(()=>{if(drag&&!dragRef.current&&local.project._document?.revision!==drag.revision)setDrag(null);},[local.project._document?.revision,drag]);
  useLayoutEffect(()=>{const board=boardRef.current;const event=plotRequest?.id && board?.querySelector(`[data-testid="plot-event-${plotRequest.id}"]`);if(event){board.scrollLeft=Math.max(0,event.offsetLeft-180);event.scrollIntoView({block:'center',inline:'nearest'});}},[plotRequest]);
  useEffect(() => { setSelected(''); setModal(null); setNameEdit(null); setNodeMenu(null); setPlotRequest(null); setCollapsedGroups({}); setWidthOverrides({}); }, [local.project._document?.project_id, level?.id]);
  useEffect(()=>{if(initialSettingsRequest&&level){setModal({type:'settings'});onSettingsOpened?.();}},[initialSettingsRequest]);
  useEffect(()=>{if(initialPlotRequest){setPlotRequest(initialPlotRequest);setSelected('');}},[initialPlotRequest]);
  useEffect(() => { if(locatedAppearance) { setSelected(locatedAppearance);const group=level?.appearances.find(a=>a.id===locatedAppearance)?.npc_group_id;if(group)setCollapsedGroups(v=>({...v,[group]:false})); requestAnimationFrame(()=>boardRef.current?.querySelector(`[data-testid="appearance-${locatedAppearance}"]`)?.scrollIntoView({block:'nearest',inline:'center'})); } },[locatedAppearance,level?.id]);
  useLayoutEffect(()=>{if(locatedTrack?.levelId!==level?.id)return;const track=[...(boardRef.current?.querySelectorAll('[data-scene-track]') || [])].find(row=>row.dataset.sceneTrack===locatedTrack.trackId);track?.scrollIntoView({block:'center',inline:'nearest'});},[locatedTrack,level?.id]);
  const persist = async (next, history = true, locations = [], bindingCommands = [], base = level, legacyRegion = null) => {
    if (saveRef.current) throw new Error(t("正在保存，请稍后重试"));
    saveRef.current = true; setBusy(true);
    try { await local.transact(latest=>[...locations.map(entity => ({ type: 'create_entity', entity })), { type: 'put_level', level: editedLevel(base,next,latest) }, ...bindingCommands, ...legacyRegionCommands(legacyRegion,latest)]); onLevel(next.id); }
    catch (error) { announce(error.message); throw error; } finally { saveRef.current = false; setBusy(false); }
  };
  useEffect(() => { onDirtyChange?.(!!nameEdit || plotDirty); }, [!!nameEdit, plotDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (!nameEdit) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [!!nameEdit]);
  const closeNodeMenu = useCallback((restoreFocus = true) => {
    setNodeMenu(null);
    if (restoreFocus) requestAnimationFrame(() => menuTargetRef.current?.focus({ preventScroll: true }));
  }, []);
  const openNodeMenu = (event, kind, row, keyboard = false) => {
    event.preventDefault(); event.stopPropagation();
    if (locked) return;
    const box = event.currentTarget.getBoundingClientRect();
    menuTargetRef.current = event.currentTarget;
    setNodeMenu({ kind, id: row.id, x: keyboard ? box.left : event.clientX, y: keyboard ? box.bottom + 4 : event.clientY });
  };
  const changeNode = async patch => {
    if (!nodeMenu || busy) return;
    try { await persist({ ...level, [nodeMenu.kind]: level[nodeMenu.kind].map(node => node.id === nodeMenu.id ? { ...node, ...patch } : node) }); closeNodeMenu(); }
    catch { /* Input and menu remain available for retry. */ }
  };
  const deleteNode = async () => {
    if (!nodeMenu || busy) return;
    try {
      await persist(nodeMenu.kind === 'anchors' ? removeAnchor(level, nodeMenu.id) : removeTrack(level, nodeMenu.id));
      setNodeMenu(null);
      requestAnimationFrame(() => boardRef.current?.querySelector('.axis-add-anchor, .axis-add-track')?.focus());
      announce(nodeMenu.kind === 'anchors' ? t("已删除锚点，出场时间保留；可撤销") : t("已删除场景，人物出场移到待安排；可撤销"));
    } catch { /* Error already announced. */ }
  };
  const saveAxisNode = async (next, locations, nodeId, base) => {
    await persist(next, true, locations, [], base);
    setModal(null);
    requestAnimationFrame(() => boardRef.current?.querySelector(`[data-axis-node="${nodeId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  };
  const startNameEdit = (kind, row) => {
    if (locked) return;
    setNodeMenu(null); setNameEdit({ kind, id: row.id, value: row.name, error: '' });
  };
  const saveName = async () => {
    if (!nameEdit || busy || nameSaveRef.current) return false;
    const name = nameEdit.value.trim();
    if (!name) { setNameEdit(v => ({ ...v, error: '名称不能为空' })); return false; }
    const rows = level[nameEdit.kind];
    const original = rows.find(row => row.id === nameEdit.id);
    if (name === original?.name) { setNameEdit(null); return true; }
    nameSaveRef.current = true;
    try {
      await persist({ ...level, [nameEdit.kind]: rows.map(row => row.id === nameEdit.id ? { ...row, name } : row) });
      setNameEdit(null);return true;
    } catch (error) { setNameEdit(v => ({ ...v, error: error.message }));return false; }
    finally { nameSaveRef.current = false; }
  };
  useNavigationEditor(onNavigationHandlers,{dirty:!!nameEdit,busy,name:'场景或时间锚点名称',save:saveName,discard:()=>{setNameEdit(null);return true;}});
  const nameEditor = kind => <AxisNameEditor edit={nameEdit} busy={busy} label={kind === 'anchors' ? t("时间锚点名称") : t("场景标题")} onChange={value => setNameEdit(v => ({ ...v, value, error: '' }))} onSave={saveName} onCancel={() => { if (!busy && !nameSaveRef.current) setNameEdit(null); }}/>;
  const controlWidth = (kind,id) => {
    const saved = local.project._document?.editor.level_control_widths?.[level?.id]?.[kind==='group'?'groups':'events']?.[id];
    const base = widthOverrides[`${kind}:${id}`] ?? saved ?? (kind==='group' ? (groupCollapsed(id)?320:(window.innerWidth<=760?460:620)) : 210);
    return drag?.kind==='control-width' && drag.row.id===id && drag.row.controlKind===kind ? resizedControlWidth(kind,drag.row.width,drag.dx) : base;
  };
  const saveControlWidth = async (kind,id,width) => {
    const key=`${kind}:${id}`;
    setWidthOverrides(v=>({...v,[key]:width}));setBusy(true);
    try {await local.transact([{type:'set_level_control_width',level_id:level.id,kind,control_id:id,width}]);}
    catch(error){announce(t("宽度保存失败：{0}", [error.message]));}
    finally{setWidthOverrides(v=>{const next={...v};delete next[key];return next;});setBusy(false);}
  };
  const resizeKey = (kind,id,delta) => {if(!locked)saveControlWidth(kind,id,resizedControlWidth(kind,controlWidth(kind,id),delta));};
  const cancelDrag = () => { if(dragRef.current)movedPlotRef.current=Date.now()+300; dragRef.current=null;setDrag(null); };
  useEffect(()=>{
    const escape=event=>{if(event.key==='Escape'&&dragRef.current){event.preventDefault();event.stopPropagation();cancelDrag();}};
    window.addEventListener('keydown',escape,true);
    return()=>window.removeEventListener('keydown',escape,true);
  },[]);
  useEffect(()=>{
    if(!drag)return;
    let frame;
    const scroll=()=>{
      const value=dragRef.current,board=boardRef.current;
      if(value && board && !['anchor','control-width'].includes(value.kind)){
        const speed=edgeScroll(value.point,board.getBoundingClientRect(),axes.x?84:0);
        const left=board.scrollLeft,top=board.scrollTop;
        board.scrollLeft+=axes.x?speed.x:0;board.scrollTop+=speed.y;
        if(left!==board.scrollLeft||top!==board.scrollTop)moveRef.current?.(value.point);
      }
      if(dragRef.current)frame=requestAnimationFrame(scroll);
    };
    frame=requestAnimationFrame(scroll);
    return()=>cancelAnimationFrame(frame);
  },[!!drag,axes.x]);
  useLayoutEffect(()=>{
    const board=boardRef.current;if(!board)return;
    const observer=new ResizeObserver(entries=>{
      setControlHeights(previous=>{
        let next=previous;
        for(const entry of entries){const key=entry.target.dataset.controlKey,height=Math.ceil(entry.target.getBoundingClientRect().height);
          if(key&&height>0&&previous[key]!==height){if(next===previous)next={...previous};next[key]=height;}}
        return next;
      });
    });
    board.querySelectorAll('[data-control-key]').forEach(el=>observer.observe(el));
    return()=>observer.disconnect();
  },[level,levelEventsKey(c,level),collapsedGroups,widthOverrides]);
  const landingAt = (value,point) => {
    if(value.edge||['anchor','control-width'].includes(value.kind))return null;
    const board=boardRef.current,rect=board.getBoundingClientRect();
    if(point.x<rect.left||point.x>rect.right||point.y<rect.top+(axes.x?84:0)||point.y>rect.bottom)return null;
    const track=[...board.querySelectorAll('[data-track-key]')].find(el=>{const box=el.getBoundingClientRect();return point.y>=box.top&&point.y<box.bottom;});
    if(!track)return null;
    const id=track.dataset.trackKey;
    if(value.kind!=='event'&&(id==='@level'||(value.kind==='npc-group'&&!id)))return null;
    if(value.kind==='event'&&!id)return null;
    const layout=layoutRef.current.get(id);
    return {trackId:id,...insertionPoint(layout?.rows||[],controlKey(value.kind,value.row.id),point.y-track.getBoundingClientRect().top)};
  };
  const beginDrag = (event, kind, row, edge) => {
    if (locked || (!axes.x && kind==='anchor') || event.button !== 0 || dragRef.current) return;
    event.preventDefault(); event.stopPropagation(); setNodeMenu(null);
    event.currentTarget.focus({preventScroll:true});
    event.currentTarget.setPointerCapture(event.pointerId);
    const board=boardRef.current;
    const value = { kind, row: clone(row), edge, revision:local.project._document.revision, x: event.clientX, y: event.clientY, point:{x:event.clientX,y:event.clientY},
      scrollLeft:board.scrollLeft,scrollTop:board.scrollTop, dx: 0, dy: 0,
      order:clone(local.project._document.editor.level_control_orders?.[level.id]||[]) };
    movedPlotRef.current=0;dragRef.current = value; setDrag(value);
  };
  const updateDrag = point => {
    const start=dragRef.current;if(!start)return;
    const board=boardRef.current;
    const value={...start,point,...dragDelta(start,point,{left:board.scrollLeft,top:board.scrollTop})};
    value.moved=Math.abs(value.dx)+Math.abs(value.dy)>=4;
    value.landing=value.moved?landingAt(value,point):null;
    const source=value.kind==='event'?(value.row.scope.track_id||'@level'):(value.row.track_id||'');
    const siblings=layoutRef.current.get(source)?.rows||[];
    const nextSibling=siblings[siblings.findIndex(r=>r.key===controlKey(value.kind,value.row.id))+1]?.key||null;
    value.layoutMove=!!value.landing&&(value.landing.trackId!==source||(Math.abs(value.dy)>=6&&value.landing.before!==nextSibling));
    dragRef.current=value;setDrag(value);
  };
  moveRef.current=updateDrag;
  const moveDrag = event => updateDrag({x:event.clientX,y:event.clientY});
  const endDrag = async event => {
    const value = dragRef.current;if(!value)return;
    // Pointer capture may release outside the board. Such a drop cancels the edit.
    value.landing=landingAt(value,{x:event.clientX,y:event.clientY});
    dragRef.current = null;
    if (!value.moved) {setDrag(null);return;}
    movedPlotRef.current=Date.now()+300;
    try {
      if(value.kind==='control-width'){await saveControlWidth(value.row.controlKind,value.row.id,resizedControlWidth(value.row.controlKind,value.row.width,value.dx));return;}
      if(value.kind==='anchor'){await persist(moveAnchor(level,value.row.id,value.row.tick+dragTimeDelta(value,scale,axes.x)));return;}
      if(!value.edge&&!value.landing)return;
      const row=value.row,key=controlKey(value.kind,row.id);
      const source=value.kind==='event'?(row.scope.track_id||'@level'):(row.track_id||'');
      const target=value.edge?source:value.landing.trackId;
      const trackId=target==='@level'?null:target;
      const sourceRows=layoutRef.current.get(source)?.rows||[];
      const nextSibling=sourceRows[sourceRows.findIndex(r=>r.key===key)+1]?.key||null;
      const reorderNeeded=!value.edge&&(target!==source || (Math.abs(value.dy)>=6&&value.landing.before!==nextSibling));
      const delta=dragTimeDelta({...value,layoutMove:reorderNeeded},scale,axes.x);
      const commands=[];
      let next=level;
      if(value.kind==='event'){
        if(delta||target!==source)commands.push({type:'patch_entity',target:{kind:'event',id:row.id},changes:movePlotEvent(row,level,row.scheduled_at+delta,trackId)});
      }else if(value.kind==='npc-group'){
        if(delta||target!==source)next=moveNpcGroup(level,row.id,delta,trackId);
      }else{
        const start=value.edge==='end'?row.start_tick:Math.max(0,row.start_tick+delta);
        const end=value.edge==='start'?row.end_tick:value.edge==='end'?Math.max(start,row.end_tick+delta):start+row.end_tick-row.start_tick;
        if(start>end)throw new Error(t("开始时间不能晚于结束时间"));
        if(start!==row.start_tick||end!==row.end_tick||target!==source)next=placeAppearance(level,row,start,end,trackId);
      }
      if(reorderNeeded){
        const order=reorderedControls(value.order,levelControlKeys(next,levelEvents),key,(layoutRef.current.get(target)?.rows||[]).map(r=>r.key),value.landing.before);
        commands.push({type:'set_level_control_order',level_id:level.id,order,expected_order:value.order});
      }
      if(next===level&&!commands.length)return;
      setBusy(true);
      await local.transact(latest=>{
        if(value.kind==='event'&&commands.some(cmd=>cmd.type==='patch_entity')){
          const current=latest.content.events.find(e=>e.id===row.id);
          if(!current||current.scheduled_at!==row.scheduled_at||current.anchor_id!==row.anchor_id||JSON.stringify(current.scope)!==JSON.stringify(row.scope))throw new Error(t("事件安排已变更，请重新拖动"));
        }
        return [...(next===level?[]:[{type:'put_level',level:editedLevel(level,next,latest)}]),...commands];
      });
    }catch(error){announce(error.message);}
    finally{setDrag(null);setBusy(false);}
  };
  if (!c) return <div className="empty-state">{t("正在载入工程…")}</div>;
  const row = level?.appearances.find(a => a.id === selected);
  const actor = c.characters.find(a => a.id === row?.character_id);
  const levelEvents=c.events.filter(e=>e.scope?.level_id===level?.id);
  const levelRules=c.rules.filter(r=>r.scope?.level_id===level?.id);
  const min = Math.min(c.initial_state.tick, ...(level?.anchors.map(a => a.tick) || []), ...(level?.appearances.map(a => a.start_tick) || []), ...levelEvents.map(e=>e.scheduled_at));
  const max = Math.max(min + 30, ...(level?.anchors.map(a => a.tick + 5) || []), ...(level?.appearances.map(a => a.end_tick + 5) || []), ...levelEvents.map(e=>e.scheduled_at+8));
  const width = Math.max(780, (max-min)*scale+220,
    ...(level?.npc_groups || []).map(g=>168+(npcGroupBounds(level,g).start-min)*scale+controlWidth('group',g.id)+24),
    ...levelEvents.map(e=>168+(e.scheduled_at-min)*scale+controlWidth('event',e.id)+24));
  const trackRows = level ? [...(levelEvents.some(e=>!e.scope.track_id) || levelRules.some(r=>!r.scope.track_id) ? [{id:'@level',name:'关卡剧情'}] : []), ...level.tracks, ...(level.appearances.some(a => !a.track_id) ? [{ id: '', name: '待安排场景' }] : [])] : [];
  const controlOrder=local.project._document?.editor.level_control_orders?.[level?.id]||[];
  const trackLayouts=new Map(trackRows.map(track=>{
    const events=levelEvents.filter(e=>e.scope.track_id===(track.id==='@level'?null:track.id));
    const appearances=level.appearances.filter(a=>(a.track_id||'')===track.id&&!a.npc_group_id);
    const groups=(level.npc_groups||[]).filter(g=>g.track_id===track.id);
    return [track.id,layoutControls([
      ...events.map(e=>({key:controlKey('event',e.id),height:74})),
      ...appearances.map(a=>({key:controlKey('appearance',a.id),height:67})),
      ...groups.map(g=>({key:controlKey('group',g.id),height:groupCollapsed(g.id)?64:118+level.appearances.filter(a=>a.npc_group_id===g.id).length*(controlWidth('group',g.id)<540?120:80)}))
    ],controlOrder,controlHeights)];
  }));
  layoutRef.current=trackLayouts;
  const step = Math.max(scale < 20 ? 10 : 5, Math.ceil((max - min) / 100 / 5) * 5);
  const tickLabel = tick => level?.axis_mode === 'phase' ? level.anchors.find(a => a.tick === tick)?.name || tick : `${tick}`;
  const reorder = (id, target) => { if (locked) return; const tracks = [...level.tracks]; const from = tracks.findIndex(t => t.id === id); const to = tracks.findIndex(t => t.id === target); if (from < 0 || to < 0 || from === to) return; tracks.splice(to, 0, ...tracks.splice(from, 1)); persist({ ...level, tracks }).catch(() => {}); };
  return <div className={`level-workspace ${plotRequest?'with-plot-panel':''}`}>
    <div className="planning-heading"><div><small>{t("关卡导演台 / 场景与剧情")}</small><h1>{level?.name || t("从一个关卡开始")}</h1><p>{level ? t("{0} 个场景 · {1} 次人物出场 · {2} 个事件", [level.tracks.length, level.appearances.length, levelEvents.length]) : t("把人物拖进场景轨道，安排出现时机，再点进卡片编排对白。")}</p></div><div className="planning-actions"><button className="secondary" disabled={locked} onClick={()=>showPlot({global:true})}><Flag size={14}/>{t("全局规则与资料")}</button><select aria-label={t("当前关卡")} disabled={locked} value={level?.id || ''} onChange={e => onLevel(e.target.value)}><option value="" disabled>{t("选择关卡")}</option>{levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select><button className="secondary" disabled={locked} onClick={() => setModal({ type: 'new' })}><Plus/>{t("新建关卡")}</button>{level && <button className="secondary" disabled={locked} onClick={() => setModal({ type: 'settings' })}><PencilSimple/>{t("场景与锚点")}</button>}</div></div>
    {!level ? <div className="planning-empty workspace-empty"><Flag size={40}/><h2>{t("先搭场景，再安排人物")}</h2><p className="new-project-guide">{t("先定义世界，再创建人物、安排出场，最后编写对白并试玩。")}</p><div className="new-project-actions"><button className="secondary" onClick={onWorld}>{t("编辑世界底稿")}</button><button className="secondary" onClick={onCharacters}>{t("创建与管理人物")}</button></div><p>{t("横轴使用故事时间或剧情阶段，纵轴组织场景。人物档案可以在多个关卡复用。")}</p><button className="primary" onClick={() => setModal({ type: 'new' })}><Plus/>{t("创建第一个关卡")}</button></div> : <>
      <div className="level-toolbar"><button className="secondary" disabled={locked} onClick={()=>setModal({type:'dialogue-check'})}>{t("对白联动检查")}{dialogueProblems.length?` · ${dialogueProblems.length}`:''}</button><label><input type="checkbox" disabled={locked} checked={axes.x} onChange={e => setAxes({ ...axes, x: e.target.checked })}/>{t("时间横轴")}</label><label><input type="checkbox" disabled={locked} checked={axes.y} onChange={e => setAxes({ ...axes, y: e.target.checked })}/>{t("场景纵轴")}</label><span className="toolbar-divider"/><button className="secondary" disabled={locked} onClick={()=>showPlot({})}><Flag size={14}/>{t("本关卡剧情 ")}{levelEvents.length + levelRules.length}</button><button className="secondary" disabled={locked} onClick={()=>showPlot({creating:true,kind:'event'})}><Plus size={14}/>{t("添加事件")}</button><button className="icon-button" aria-label={t("撤销上一步编辑（关卡工具栏）")} title={local.editHistory.undo || t("暂无可撤销编辑")} disabled={!local.editHistory.undo || locked || local.historyBusy} onClick={() => local.historyEdit("undo")}><ArrowCounterClockwise/></button><button className="icon-button" aria-label={t("重做编辑（关卡工具栏）")} disabled={!local.editHistory.redo || locked || local.historyBusy} onClick={() => local.historyEdit("redo")}><ArrowClockwise/></button><label className="level-zoom">{t("缩放")}<input aria-label={t("关卡时间缩放")} disabled={locked} type="range" min="1" max="60" step="0.1" value={scale} onChange={e => setScale(Number(e.target.value))}/></label><button className="subtle-button" disabled={locked} onClick={() => { setScale(Math.max(1, Math.min(60, (boardRef.current.clientWidth - 220) / (max - min)))); boardRef.current.scrollLeft = 0; }}>{t("适合画布")}</button><small>{busy ? t("保存安排…") : nameEdit ? t("Enter 保存名称 · Esc 取消") : t('上下拖动排列 · 左右调整时间 · Esc 取消')}</small><button className="primary" disabled={locked} onClick={() => onPlace([])}><Users/>{t("安排人物")}</button></div>
      {dialogueProblems.length>0&&<div className="linkage-notice" role="status"><span>{dialogueProblems.length}{t(" 项对白的场景或时间需要核对")}</span><button className="secondary" disabled={locked} onClick={()=>setModal({type:'dialogue-check'})}>{t("查看并调整")}</button></div>}
      <div className={`level-stage ${row ? 'with-selection' : ''}`}>
        <div className={`level-scroll ${axes.y ? '' : 'hide-scene-axis'}`} ref={boardRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={()=>{if(dragRef.current)cancelDrag();}}>
          <div className="level-grid" style={{ width }}>
            {axes.x && <div className="level-ruler"><div className="ruler-origin">{level.axis_mode === 'phase' ? t("剧情阶段") : { day:'故事天数', minute:'故事分钟', chapter:'故事章节' }[c.world.clock_unit]}</div>{Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step).map(t => <span className="ruler-tick" key={t} style={{ left: 168 + (t - min) * scale }}>{t}</span>)}{level.anchors.map(a => {
              const editing = nameEdit?.kind === 'anchors' && nameEdit.id === a.id;
              const position = { '--node-color': axisColor(a), left: 168 + (a.tick - min) * scale + (drag?.kind === 'anchor' && drag.row.id === a.id ? drag.dx : 0) };
              return editing ? <div key={a.id} className="time-anchor editing-axis-name" style={position}><i/>{nameEditor('anchors')}</div> : <button key={a.id} className={`time-anchor ${a.color && a.color !== 'default' ? 'marked-axis-node' : ''}`} data-axis-node={a.id} aria-haspopup="menu" aria-expanded={nodeMenu?.id === a.id} onContextMenu={e => openNodeMenu(e, 'anchors', a)} aria-label={t("时间锚点 {0}", [a.name])} disabled={locked} title={t("双击改名 · 右键更多操作 · 左右拖动调整时间")} style={position} onDoubleClick={() => startNameEdit('anchors', a)} onPointerDown={e => beginDrag(e, 'anchor', a)} onKeyDown={e => {
                if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) openNodeMenu(e, 'anchors', a, true);
                else if (['F2', 'Enter'].includes(e.key)) { e.preventDefault(); startNameEdit('anchors', a); }
                else if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); try { persist(moveAnchor(level, a.id, a.tick + (e.key === 'ArrowLeft' ? -1 : 1))).catch(() => {}); } catch (error) { announce(error.message); } }
              }}><i/><AxisIcon node={a}/>{a.name}</button>;
            })}<button className="axis-add-anchor" disabled={locked || level.anchors.length >= 1000} aria-label={t("追加时间锚点")} title={t("追加到最后一个锚点之后")} onClick={() => setModal({ type: 'axis-node', kind: 'anchors', creating: true })}><Plus size={14}/>{t("时间锚点")}</button></div>}
            {trackRows.map(track => { const plotTrackId=track.id==='@level'?null:track.id; const cues=levelEvents.filter(e=>e.scope.track_id===plotTrackId); const rules=levelRules.filter(r=>r.scope.track_id===plotTrackId); const realTrack=!!track.id && track.id!=='@level'; const appearances = level.appearances.filter(a => (a.track_id || '') === track.id); const groups=(level.npc_groups || []).filter(g=>g.track_id===track.id);const individual=appearances.filter(a=>!groups.some(g=>g.id===a.npc_group_id));const layout=trackLayouts.get(track.id); return <section key={track.id} className={`scene-track ${drag?.landing?.trackId===track.id?'control-drop-target':''} ${locatedTrack?.levelId===level.id&&locatedTrack?.trackId===track.id?'library-located-track':''} ${track.id==='@level'?'plot-level-track':track.id ? '' : 'unassigned-track'}`} data-scene-track={plotTrackId || ''} data-track-key={track.id} style={{ height: layout.height, backgroundSize: `${step * scale}px 100%` }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (locked || track.id==='@level') return; const moved = e.dataTransfer.getData('application/ludo-track'); if (moved) { reorder(moved, track.id); return; } const characterId = e.dataTransfer.getData('application/ludo-entity'); if (!c.characters.some(a => a.id === characterId)) return; const rect = e.currentTarget.getBoundingClientRect(); const start = axes.x ? Math.max(0, min + Math.round((e.clientX - rect.left - 168) / scale)) : min; persist(placeAppearance(level, newAppearance(characterId), start, start + 5, track.id)).catch(() => {}); onSelect(characterId); }}>
              <header className={`scene-track-label ${track.color && track.color !== 'default' ? 'marked-axis-node' : ''}`} style={{ '--node-color': axisColor(track) }} data-axis-node={realTrack?track.id:undefined} onContextMenu={e => { if (realTrack) openNodeMenu(e, 'tracks', track); }} draggable={!!realTrack && !locked} onDragStart={e => e.dataTransfer.setData('application/ludo-track', track.id)}><DotsSixVertical/>{nameEdit?.kind === 'tracks' && nameEdit.id === track.id ? nameEditor('tracks') : realTrack ? <button className="scene-name-button" aria-haspopup="menu" aria-expanded={nodeMenu?.id === track.id} aria-label={t("场景标题 {0}", [track.name])} disabled={locked} title={t("双击改名 · 右键更多操作")} onDoubleClick={() => startNameEdit('tracks', track)} onKeyDown={e => { if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) openNodeMenu(e, 'tracks', track, true); else if (['F2', 'Enter'].includes(e.key)) { e.preventDefault(); startNameEdit('tracks', track); } }}><AxisIcon node={track}/><strong>{track.name}</strong></button> : <strong>{track.name}</strong>}<small>{appearances.length}{t(" 次出场 · ")}{cues.length}{t(" 事件")}</small>{track.id && <button className="subtle-button" disabled={locked} onClick={()=>showPlot({creating:true,kind:'event',trackId:plotTrackId})}><Plus size={12}/>{t("剧情事件")}</button>}{rules.length>0 && <button className="subtle-button" disabled={locked} onClick={()=>showPlot({id:rules[0].id})}>{t("条件规则 ")}{rules.length}</button>}{realTrack && <button className="subtle-button" disabled={locked} onClick={() => onCrowd(level, track)}><Plus size={12}/>{t("添加 NPC 组")}</button>}{realTrack && <button className="subtle-button" disabled={locked} onClick={()=>onSceneContent(level,track)}>{t("场景内容 ")}{sceneContent(c,level,track,local.project._document.editor).texts.length + sceneContent(c,level,track,local.project._document.editor).dialogues.length}{sceneContent(c,level,track,local.project._document.editor).pending.length>0?t(" · 待审核 {0}", [sceneContent(c,level,track,local.project._document.editor).pending.length]):''}</button>}<div className="track-order">{realTrack && <><button aria-label={t("上移场景 {0}", [track.name])} disabled={level.tracks[0].id === track.id || locked} onClick={() => reorder(track.id, level.tracks[level.tracks.findIndex(t => t.id === track.id) - 1]?.id)}>↑</button><button aria-label={t("下移场景 {0}", [track.name])} disabled={level.tracks.at(-1).id === track.id || locked} onClick={() => reorder(track.id, level.tracks[level.tracks.findIndex(t => t.id === track.id) + 1]?.id)}>↓</button></>}</div></header>
              {axes.x && level.anchors.map(a => <i className={`anchor-guide ${a.color && a.color !== 'default' ? 'marked-anchor-guide' : ''}`} key={a.id} style={{ '--node-color': axisColor(a), left:168 + (a.tick - min) * scale }}/>) }
              {[...individual.map((a, i) => { const character = c.characters.find(r => r.id === a.character_id); const active = drag?.kind === 'appearance' && drag.row.id === a.id; const dx = active && !drag.layoutMove ? drag.dx : 0; const length = (a.end_tick - a.start_tick) * scale; return <article key={controlKey('appearance',a.id)} data-testid={`appearance-${a.id}`} data-control-key={controlKey('appearance',a.id)} className={`appearance-card ${selected === a.id ? 'selected' : ''}`} style={{ zIndex:active?10:undefined, top:layout.positions[controlKey('appearance',a.id)]+(active&&!drag.edge?drag.dy:0), left: axes.x ? 168 + (a.start_tick - min) * scale + (active && drag.edge !== 'end' ? dx : 0) : 168, width: axes.x ? Math.max(48, length + (active && drag.edge === 'end' ? dx : active && drag.edge === 'start' ? -dx : 0)) : 270 }}><button className="appearance-grip" aria-label={t("移动 {0} 的出场", [character?.name])} onPointerDown={e => beginDrag(e, 'appearance', a)} title={t('上下拖动排列 · 左右调整时间 · 拖到其他场景移动')} onClick={() => { if(Date.now()<movedPlotRef.current)return;setSelected(a.id); onSelect(a.character_id); }}><span className="appearance-avatar">{character?.name.slice(0, 1)}</span><span><strong>{character?.name}</strong><small>{tickLabel(a.start_tick)} → {tickLabel(a.end_tick)}{a.condition.op !== 'always' ? t(" · 有条件") : ''}</small></span><DotsSixVertical/></button><div className="appearance-actions"><button disabled={locked} onClick={() => { setSelected(a.id); setModal({ type: 'appearance', row: a }); }}>{t("配置出场")}</button><button disabled={locked} onClick={() => onWorkbench(level, a)}><ChatText size={12}/>{t("对白 / 预演")}</button></div>{axes.x && <><button className="resize-grip start" aria-label={t("调整 {0} 出场开始", [character?.name])} onPointerDown={e => beginDrag(e, 'appearance', a, 'start')}/><button className="resize-grip end" aria-label={t("调整 {0} 出场结束", [character?.name])} onPointerDown={e => beginDrag(e, 'appearance', a, 'end')}/></>}</article>; }),
              ...groups.map((group,i)=>{const bounds=npcGroupBounds(level,group),active=drag?.kind==='npc-group'&&drag.row.id===group.id;return <NpcGroupCard key={controlKey('group',group.id)} document={local.project._document} level={level} group={group} expanded={!groupCollapsed(group.id)} onToggle={()=>setCollapsedGroups(v=>({...v,[group.id]:!groupCollapsed(group.id)}))} dragging={active} style={{zIndex:active?10:undefined,width:controlWidth('group',group.id),top:layout.positions[controlKey('group',group.id)]+(active?drag.dy:0),left:axes.x?168+(bounds.start-min)*scale+(active&&!drag.layoutMove?drag.dx:0):168}} locked={locked} onDrag={e=>beginDrag(e,'npc-group',group)} onResize={e=>beginDrag(e,'control-width',{id:group.id,controlKind:'group',width:controlWidth('group',group.id)})} onResizeKey={delta=>resizeKey('group',group.id,delta)} onConfigure={()=>setModal({type:'npc-group',group})} onGenerate={memberId=>onCrowd(level,track,group,memberId)} onEdit={appearanceId=>setModal({type:'npc-member',appearanceId})} onReview={onNpcReview} onAppearance={row=>setModal({type:'appearance',row})} onWorkbench={appearance=>onWorkbench(level,appearance)}/>;}),
              ...cues.map((event,i)=>{const state=rehearsal.result?.events.find(e=>e.id===event.id);const active=drag?.kind==='event' && drag.row.id===event.id;return <PlotEventCard key={controlKey('event',event.id)} event={event} state={state} time={tickLabel(event.scheduled_at)} locked={locked} style={{zIndex:active?10:undefined,width:controlWidth('event',event.id),top:layout.positions[controlKey('event',event.id)]+(active?drag.dy:0),left:axes.x?168+(event.scheduled_at-min)*scale+(active&&!drag.layoutMove?drag.dx:0):168}} onDrag={e=>beginDrag(e,'event',event)} onResize={e=>beginDrag(e,'control-width',{id:event.id,controlKind:'event',width:controlWidth('event',event.id)})} onResizeKey={delta=>resizeKey('event',event.id,delta)} onOpen={()=>{if(Date.now()>=movedPlotRef.current)showPlot({id:event.id});}} onPreview={()=>showPlot({id:event.id,preview:true})}/>;})].sort((a,b)=>layout.positions[a.key]-layout.positions[b.key])}
              {drag?.landing?.trackId===track.id&&<div className="control-drop-line" style={{top:drag.landing.top}} aria-hidden="true"><span>{t('放到这里')}</span></div>}
              {!appearances.length && !cues.length && <div className="track-placeholder">{t("从左侧拖入人物，或点击“安排人物”")}</div>}
            </section>; })}
            <div className="axis-add-track-row"><button className="axis-add-track" disabled={locked || level.tracks.length >= 1000} onClick={() => setModal({ type: 'axis-node', kind: 'tracks', creating: true })}><Plus size={16}/>{t("追加场景")}</button></div>
            {!level.tracks.length && <div className="planning-empty"><p>{t("尚无场景轨道，先在“场景与锚点”中添加。")}</p></div>}
          </div>
        </div>
        {row && <aside className="placement-inspector"><header><span>{t("当前出场")}</span><button className="icon-button" aria-label={t("收起出场信息")} onClick={() => setSelected('')}><X/></button></header><h2>{actor?.name}</h2><p>{actor?.role || t("未填写身份")}</p><dl><dt>{t("场景")}</dt><dd>{level.tracks.find(t => t.id === row.track_id)?.name || t("待安排")}</dd><dt>{t("时间范围")}</dt><dd>{tickLabel(row.start_tick)} → {tickLabel(row.end_tick)}</dd><dt>{t("触发条件")}</dt><dd>{conditionLabel(row.condition, c)}</dd><dt>{t("计划行为")}</dt><dd>{row.behavior || t("未填写")}</dd><dt>{t("对白")}</dt><dd>{row.dialogue_ids.length ? t("{0} 个指定对白", [row.dialogue_ids.length]) : t("使用人物通用对白")}</dd></dl><button className="primary" onClick={() => onWorkbench(level, row)}><Play/>{t("编排与预演")}</button><button className="secondary" disabled={locked} onClick={() => setModal({ type: 'appearance', row })}><PencilSimple/>{t("编辑出场安排")}</button><button className="secondary" disabled={locked} onClick={()=>setModal({type:'dialogue-check',appearanceId:row.id})}>{t("检查这次出场的对白")}</button><p className="muted-text">{t("同一人物可多次出场。移除这次出场不会删除人物档案。")}</p><div className="plot-linked-events"><h3>{t("影响这个人物的剧情")}</h3>{plotsForActor(c,actor?.id).map(event=><button className="secondary" key={event.id} onClick={()=>onPlot(event.id)}>{event.name}</button>)}{!plotsForActor(c,actor?.id).length&&<p className="muted-text">{t("尚无关联事件或效果。")}</p>}</div></aside>}
      </div>
    </>}
    {plotRequest && <PlotDirector onNavigationHandlers={onNavigationHandlers} key={plotRequest.nonce} local={local} level={level} request={plotRequest} rehearsal={rehearsal} announce={announce} onDirtyChange={setPlotDirty} onClose={()=>setPlotRequest(null)} onSaved={()=>{}} onLocate={(id,eventId)=>{onLevel(id);onPlot(eventId);}} onWorkbench={onWorkbench}/>}
    {nodeMenu && level?.[nodeMenu.kind].find(n => n.id === nodeMenu.id) && <AxisNodeMenu context={nodeMenu} node={level[nodeMenu.kind].find(n => n.id === nodeMenu.id)} busy={busy} onClose={closeNodeMenu} onEdit={() => { const context = nodeMenu; closeNodeMenu(false); setModal({ type: 'axis-node', kind: context.kind, row: level[context.kind].find(n => n.id === context.id) }); }} onMark={changeNode} onRemove={deleteNode} first={level.tracks[0]?.id === nodeMenu.id} last={level.tracks.at(-1)?.id === nodeMenu.id} onOrder={direction => { const index = level.tracks.findIndex(t => t.id === nodeMenu.id); reorder(nodeMenu.id, level.tracks[index + direction]?.id); closeNodeMenu(); }}/>}
    {modal?.type==='dialogue-check'&&<AppearanceDialogueCheck local={local} levelId={level.id} appearanceId={modal.appearanceId} onClose={()=>setModal(null)} onWorkbench={onWorkbench} announce={announce}/>}
    {modal?.type==='npc-member'&&<NpcMemberEditor local={local} levelId={level.id} appearanceId={modal.appearanceId} announce={announce} onClose={()=>setModal(null)}/>}
    {modal?.type==='npc-group'&&<NpcGroupSettings level={level} group={modal.group} onSave={(next,base)=>persist(next,true,[],[],base)} onClose={()=>setModal(null)}/>}
    {modal?.type === 'axis-node' && <AxisNodeModal kind={modal.kind} node={modal.row} creating={modal.creating} level={level} content={c} onClose={() => setModal(null)} onSave={saveAxisNode}/>}
    {modal?.type === 'new' && <NewLevelModal content={c} onClose={() => setModal(null)} onSave={async (name, scene, region, description) => { const location = c.locations.find(l => l.name === scene); const locationId = location?.id || uid('location'); const start = c.initial_state.tick; const next = { id:uid('level'), name, region, description, tags:[], axis_mode:'phase', anchors:[{id:uid('anchor'),name:'进入场景',tick:start},{id:uid('anchor'),name:'自由交谈',tick:start+10},{id:uid('anchor'),name:'场景结束',tick:start+20}], tracks:[{id:uid('track'),name:scene,location_id:locationId}], appearances:[] }; await local.transact([...(location ? [] : [{type:'create_entity',entity:{kind:'location',id:locationId,name:scene}}]),{type:'put_level',level:next}]); onLevel(next.id); setModal(null); announce(t("关卡已创建，拖入人物开始安排")); }}/>}
    {modal?.type === 'settings' && <LevelSettings level={level} content={c} onClose={() => setModal(null)} onSave={async (next, locations, base, legacyRegion) => { await persist(next, true, locations, [], base, legacyRegion); setModal(null); }}/>}
    {modal?.type === 'appearance' && <AppearanceEditor level={level} row={modal.row} content={c} onClose={() => setModal(null)} onSave={async next => { await persist(next); setModal(null); }}/>}
  </div>;
}

function AxisNameEditor({ edit, busy, label, onChange, onSave, onCancel }) {
  useI18n();
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return <div className="axis-name-editor" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onDragStart={e => e.preventDefault()} onKeyDown={e => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && e.target === inputRef.current) { e.preventDefault(); onSave(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }}>
    <div className="axis-name-edit-controls"><input ref={inputRef} aria-label={label} aria-invalid={!!edit.error} maxLength={150} disabled={busy} value={edit.value} onChange={e => onChange(e.target.value)}/><button type="button" disabled={busy} aria-label={t("保存{0}", [label])} title={t("保存（Enter）")} onClick={onSave}><Check size={13}/></button><button type="button" disabled={busy} aria-label={t("取消{0}修改", [label])} title={t("取消（Esc）")} onClick={onCancel}><X size={13}/></button></div>
    {edit.error && <span className="axis-name-error" role="alert">{tm(edit.error)}</span>}
  </div>;
}

function NewLevelModal({ content, onClose, onSave }) {
  useI18n();
  const [region,setRegion]=useState(''); const [description,setDescription]=useState(''); const [name, setName] = useState('第一关'); const [scene, setScene] = useState(content.locations[0]?.name || '营地篝火'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Modal title={t("新建关卡画布")} subtitle={t("场景轨道关联世界地点；时间或剧情阶段组织人物出场。")} onClose={onClose}><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onSave(name.trim(), scene.trim(), region.trim(), description); } catch (reason) { setError(reason.message); setBusy(false); } }}><label className="form-field">{t("关卡名称")}<input required maxLength="150" aria-label={t("关卡名称")} value={name} onChange={e => setName(e.target.value)}/></label><LevelBrief region={region} description={description} onChange={patch=>{if('region' in patch)setRegion(patch.region);if('description' in patch)setDescription(patch.description);}}/><label className="form-field">{t("第一个场景")}<input required maxLength="150" list="level-locations" aria-label={t("关卡初始场景")} value={scene} onChange={e => setScene(e.target.value)}/><datalist id="level-locations">{content.locations.map(l => <option key={l.id} value={l.name}/>)}</datalist></label>{error && <p role="alert" className="danger">{tm(error)}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t("取消")}</button><button className="primary" disabled={busy}>{t("创建关卡")}</button></div></form></Modal>;
}
function LevelSettings({ level, content, onClose, onSave }) {
  useI18n();
  const [base]=useState(()=>clone(level)); const [legacyRegion]=useState(content.world.district || ''); const [moveLegacy,setMoveLegacy]=useState(false); const [value, setValue] = useState(base); const [locations, setLocations] = useState([]); const [scene, setScene] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save=async()=>{if(scene.trim()||!value.name.trim()){setError(t("请先添加已填写的场景，并填写关卡名称。"));guard.setClosing(false);return;}setBusy(true);try{await onSave(value,locations,base,moveLegacy?legacyRegion:null);onClose();}catch(reason){setError(reason.message);guard.setClosing(false);}finally{setBusy(false);}};
  const guard=useDraftClose(JSON.stringify(base)!==JSON.stringify(value)||moveLegacy||!!scene.trim(),busy,onClose);
  return <Modal title={t("关卡设置")} subtitle={t("移动绑定的时间锚点会同步出场端点；移除场景后，人物出场保留在待安排轨道。")} onClose={guard.close} wide><DraftCloseGuard guard={guard} busy={busy} onSave={save} onClose={onClose}/><form inert={guard.closing||busy?true:undefined} className="level-settings" onSubmit={e=>{e.preventDefault();save();}}><div className="form-columns"><label>{t("关卡名称")}<input required value={value.name} aria-label={t("编辑关卡名称")} onChange={e => setValue({ ...value, name:e.target.value })}/></label><label>{t("横轴模式")}<select aria-label={t("关卡横轴模式")} value={value.axis_mode} onChange={e => setValue({ ...value, axis_mode:e.target.value })}><option value="phase">{t("剧情阶段")}</option><option value="time">{t("故事时间")}</option></select></label></div><LevelBrief region={value.region || ''} description={value.description || ''} onChange={patch=>setValue({...value,...patch})}/>{legacyRegion&&<div className="level-legacy-region"><p>{t("旧项目保留的区域资料：{0}",[legacyRegion])}</p><small>{t("选择移入本关卡后保存，原资料才会从旧字段移除；不会改动其他关卡。")}</small><button type="button" className="secondary" disabled={moveLegacy || (!!value.region && value.region!==legacyRegion)} onClick={()=>{setValue({...value,region:legacyRegion});setMoveLegacy(true);}}>{moveLegacy?t("保存时移入本关卡"):t("移入本关卡")}</button></div>}<MoreDetails value={value} label={t("关卡")} description={false} disabled={busy} onChange={patch=>setValue({...value,...patch})}/><h3>{t("时间 / 阶段锚点")}</h3>{value.anchors.map(a => <div className="axis-settings-node" key={a.id}><div className="anchor-edit-row"><input required aria-label={t("锚点名称 {0}", [a.id])} value={a.name} onChange={e => setValue({ ...value, anchors:value.anchors.map(row => row.id === a.id ? { ...row, name:e.target.value } : row) })}/><input type="number" min="0" step="1" aria-label={t("锚点时间 {0}", [a.name])} value={a.tick} onChange={e => { try { setValue(moveAnchor(value, a.id, Number(e.target.value))); setError(''); } catch (reason) { setError(reason.message); } }}/><small>{value.appearances.filter(r => r.start_anchor_id === a.id || r.end_anchor_id === a.id).length}{t(" 个出场绑定")}</small><button type="button" className="subtle-button danger" onClick={() => setValue(removeAnchor(value, a.id))}>{t("移除锚点")}</button></div><AxisMarkerPicker node={a} label={t("锚点 {0}", [a.name])} onChange={patch => setValue({ ...value, anchors: value.anchors.map(row => row.id === a.id ? { ...row, ...patch } : row) })}/><MoreDetails value={a} label={a.name} disabled={busy} onChange={patch=>setValue({...value,anchors:value.anchors.map(row=>row.id===a.id?{...row,...patch}:row)})}/></div>)}<button type="button" className="secondary" onClick={() => setValue({ ...value, anchors:[...value.anchors,{ id:uid('anchor'),name:'新阶段',tick:Math.max(content.initial_state.tick, ...value.anchors.map(a => a.tick))+5 }] })}><Plus/>{t("添加锚点")}</button><p className="muted-text">{t("阶段使用故事时钟的位置进行预演；相同数值代表同时发生。移除锚点会解除绑定，保留原出场时间。")}</p><h3>{t("场景轨道")}</h3>{value.tracks.map(rowItem => <div className="axis-settings-node" key={rowItem.id}><div className="anchor-edit-row"><input required aria-label={t("场景名称 {0}", [rowItem.id])} value={rowItem.name} onChange={e => setValue({ ...value, tracks:value.tracks.map(row => row.id === rowItem.id ? { ...row, name:e.target.value } : row) })}/><select aria-label={t("场景地点 {0}", [rowItem.name])} value={rowItem.location_id} onChange={e => setValue({ ...value, tracks:value.tracks.map(row => row.id === rowItem.id ? { ...row, location_id:e.target.value } : row) })}>{[...content.locations,...locations].map(l => <option value={l.id} key={l.id}>{l.name}</option>)}</select><button type="button" className="subtle-button danger" onClick={() => setValue(removeTrack(value, rowItem.id))}>{t("移除轨道")}</button></div><AxisMarkerPicker node={rowItem} label={t("场景 {0}", [rowItem.name])} onChange={patch => setValue({ ...value, tracks: value.tracks.map(row => row.id === rowItem.id ? { ...row, ...patch } : row) })}/><MoreDetails value={rowItem} label={rowItem.name} disabled={busy} onChange={patch=>setValue({...value,tracks:value.tracks.map(row=>row.id===rowItem.id?{...row,...patch}:row)})}/></div>)}<div className="anchor-edit-row"><input aria-label={t("新增场景名称")} placeholder={t("例如：医帐、营地入口")} value={scene} onChange={e => setScene(e.target.value)}/><button type="button" className="secondary" disabled={!scene.trim()} onClick={() => { const name = scene.trim(); const existing = [...content.locations,...locations].find(l => l.name === name); const location = existing || { kind:'location',id:uid('location'),name }; if (!existing) setLocations(v => [...v,location]); setValue({ ...value, tracks:[...value.tracks,{ id:uid('track'),name,location_id:location.id }] }); setScene(''); }}>{t("添加场景")}</button></div>{error && <p role="alert" className="danger">{tm(error)}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={guard.close}>{t("取消")}</button><button className="primary" disabled={busy}>{t("保存关卡设置")}</button></div></form></Modal>;
}
export function PlaceCharactersModal({ local, levelId, characterIds, onClose, onPlaced }) {
  useI18n();
  const c = local.project._document.content; const [levelKey, setLevelKey] = useState(levelId || c.levels[0]?.id || ''); const level = c.levels.find(l => l.id === levelKey);
  const [trackId, setTrackId] = useState(level?.tracks[0]?.id || ''); const [ids, setIds] = useState(characterIds); const [start, setStart] = useState(level?.anchors[0]?.tick ?? c.initial_state.tick); const [end, setEnd] = useState(level?.anchors[1]?.tick ?? start+5); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Modal title={t("安排人物出场")} subtitle={t("引用已有的人物档案；每次出场可以配置自己的条件和对白。")} onClose={onClose} wide><form onSubmit={async e => { e.preventDefault(); if (!ids.length) { setError(t("至少选择一个人物")); return; } setBusy(true); try { let next = level; for (const id of ids) next = placeAppearance(next, newAppearance(id), start, end, trackId); await local.transact([{type:'put_level',level:next}]); onPlaced(levelKey); onClose(); } catch (reason) { setError(reason.message); setBusy(false); } }}><div className="form-columns"><label>{t("关卡")}<select aria-label={t("安排出场关卡")} required value={levelKey} onChange={e => { const next = c.levels.find(l => l.id === e.target.value); setLevelKey(next.id); setTrackId(next.tracks[0]?.id || ''); }}><option value="" disabled>{t("先创建关卡")}</option>{c.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>{t("场景")}<select aria-label={t("安排出场场景")} value={trackId} onChange={e => setTrackId(e.target.value)}><option value="">{t("待安排场景")}</option>{level?.tracks.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label>{t("开始时间")}<input aria-label={t("安排出场开始")} type="number" min="0" required value={start} onChange={e => setStart(Number(e.target.value))}/></label><label>{t("结束时间")}<input aria-label={t("安排出场结束")} type="number" min={start} required value={end} onChange={e => setEnd(Number(e.target.value))}/></label></div><div className="cast-picker">{c.characters.map(a => <label key={a.id}><input type="checkbox" checked={ids.includes(a.id)} onChange={e => setIds(e.target.checked ? [...ids,a.id] : ids.filter(id => id !== a.id))}/><strong>{a.name}</strong><small>{a.role}</small></label>)}</div>{!c.characters.length && <p>{t("先从资料库创建人物。")}</p>}{error && <p className="danger" role="alert">{tm(error)}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t("取消")}</button><button className="primary" disabled={busy || !level}>{t("安排 ")}{ids.length}{t(" 名人物")}</button></div></form></Modal>;
}
function AppearanceEditor({ level, row, content:c, onClose, onSave }) {
  useI18n();
  const [value, setValue] = useState(clone(row)); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Modal title={t("{0} · 出场配置", [c.characters.find(a => a.id === row.character_id)?.name])} onClose={onClose} wide><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onSave(placeAppearance(level, value, value.start_tick, value.end_tick, value.track_id)); } catch (reason) { setError(reason.message); setBusy(false); } }}><div className="form-columns"><label>{t("场景")}<select aria-label={t("人物出场场景")} value={value.track_id || ''} onChange={e => setValue({ ...value,track_id:e.target.value || null })}><option value="">{t("待安排")}</option>{level.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>{t("计划行为")}<input aria-label={t("人物计划行为")} value={value.behavior} onChange={e => setValue({ ...value,behavior:e.target.value })}/></label><label>{t("开始")}<input type="number" min="0" value={value.start_tick} onChange={e => setValue({ ...value,start_tick:Number(e.target.value) })}/></label><label>{t("结束")}<input type="number" min={value.start_tick} value={value.end_tick} onChange={e => setValue({ ...value,end_tick:Number(e.target.value) })}/></label></div><h3>{t("出场条件")}</h3><ConditionEditor allowAppearance={false} content={c} value={value.condition} onChange={condition => setValue({ ...value,condition })}/><h3>{t("本次出场的对白")}</h3><p className="muted-text">{t("未勾选时使用人物全部通用对白，仍受节点条件约束。")}</p>{c.dialogues.filter(d => d.character_id === value.character_id || !d.character_id).map(d => <label className="checkbox-label" key={d.id}><input type="checkbox" checked={value.dialogue_ids.includes(d.id)} onChange={e => setValue({ ...value,dialogue_ids:e.target.checked ? [...value.dialogue_ids,d.id] : value.dialogue_ids.filter(id => id !== d.id) })}/>{d.name}</label>)}<p className="muted-text">{t("计划行为用于安排说明；实际状态变化通过对白效果或剧情规则配置。")}</p>{error && <p role="alert" className="danger">{tm(error)}</p>}<div className="modal-actions"><button type="button" className="subtle-button danger" disabled={busy} onClick={async () => { setBusy(true); try { await onSave({ ...level,appearances:level.appearances.filter(a => a.id !== row.id) }); } catch (reason) { setError(reason.message); setBusy(false); } }}>{t("移除这次出场")}</button><button type="button" className="secondary" onClick={onClose}>{t("取消")}</button><button className="primary" disabled={busy}>{t("保存出场配置")}</button></div></form></Modal>;
}

function LevelBrief({region,description,onChange}) {
  useI18n();
  return <div className="level-brief-fields"><label className="form-field">{t("所属区域（可选）")}<input aria-label={t("关卡所属区域")} maxLength={30000} value={region} onChange={e=>onChange({region:e.target.value})}/></label><label className="form-field">{t("关卡描述")}<textarea rows={4} aria-label={t("关卡描述")} value={description} onChange={e=>onChange({description:e.target.value})}/><small>{t("填写本关的地域背景、剧情阶段和主要冲突；全局世界规则沿用世界底稿。")}</small></label></div>;
}
