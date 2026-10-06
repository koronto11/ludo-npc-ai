import { t, tm, useI18n } from './i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cursor, Hand, Link, Plus, ArrowsOut, Target, ListBullets, MagnifyingGlass, X, Tag, MapPin, Play, EyeSlash, ArrowCounterClockwise, PencilSimple, BookOpen } from '@phosphor-icons/react';
import { Graph, kindLabels } from './Graph';
import { Modal } from './Modal';
import { appearancesFor, appearanceLabel } from './planning';
import { characterGroups, groupCommands, undoGroupCommands } from './characterGroupCommands';
import { MembershipModal, MoveGroupModal, GroupManagerModal } from './CharacterGroups';
import { directAssociates, relationCategories, visibleRelationshipEntities, visibleRelationshipEdges } from './relationshipView';

// Reserve room for the floating toolbar when fitting nodes into the canvas.
const canvasPadding = { top:'80px', bottom:'32px', left:'8%', right:'8%' };
const emptyFilters = { query:'', kind:'', group:'', levelId:'', trackId:'', category:'' };

function NodeMenu({ item, position, highlighted, onClose, onAction }) {
  useI18n();
  const ref = useRef(null);
  const [bounds,setBounds] = useState({left:position.left,top:position.bottom});
  useEffect(() => {
    const menu = ref.current, rect = menu.getBoundingClientRect();
    setBounds({left:Math.max(8,Math.min(position.left,innerWidth-rect.width-8)),top:Math.max(8,Math.min(position.bottom,innerHeight-rect.height-8))});
    menu.querySelector('button')?.focus({preventScroll:true});
    const outside = event => { if (!menu.contains(event.target)) onClose(false); };
    const resized = () => onClose(false);
    document.addEventListener('pointerdown',outside); window.addEventListener('wheel',outside,{capture:true,passive:true}); window.addEventListener('resize',resized);
    return () => { document.removeEventListener('pointerdown',outside); window.removeEventListener('wheel',outside,true); window.removeEventListener('resize',resized); };
  }, [position,onClose]);
  const actions = [
    ['edit',item.kind==='character'?'查看人物设定':'查看对象设定',PencilSimple],
    ...(item.kind === 'character' ? [['profile','编辑人物档案',PencilSimple],['highlight',highlighted ? '取消关联高亮' : '高亮关联',Target],['membership','管理分组',Tag],['move','移动分组',Tag],['appearances','查看出场安排',MapPin],['story','生成人物故事',BookOpen],['workbench','对白 / 预演',Play]] : []),
    ['relations','查看关系列表',ListBullets],['connect','建立新关系',Link],['hide','移出当前画布',EyeSlash],
  ];
  return createPortal(<div ref={ref} className="relationship-node-menu" role="menu" aria-label={t("{0} 的操作菜单", [item.name])} style={bounds} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{
    if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();onClose();}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...ref.current.querySelectorAll('button:not(:disabled)')];const i=buttons.indexOf(document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  }}><header>{item.name}</header>{actions.map(([id,label,Icon])=><button role="menuitem" key={id} disabled={id==='move'&&!item.tags?.length} onClick={()=>onAction(id,item)}><Icon size={15}/>{t(label)}</button>)}</div>,document.body);
}

function ReferencePicker({ project, onClose, onAdd, onCreate }) {
  useI18n();
  const [query,setQuery] = useState(''); const [ids,setIds] = useState([]);
  const rows = project.entities.filter(row=>row.hidden && `${row.name} ${row.role}`.includes(query.trim()));
  return <Modal title={t("添加画布节点")} subtitle={t("引用项目已有对象，或新建故事对象；不会复制人物档案。")} onClose={onClose}>
    <div className="reference-picker"><input aria-label={t("搜索已有对象")} placeholder={t("搜索尚未放入画布的对象")} value={query} onChange={e=>setQuery(e.target.value)}/><div className="reference-list">{rows.map(row=><label key={row.id}><input type="checkbox" aria-label={t("引用 {0}", [row.name])} checked={ids.includes(row.id)} onChange={e=>setIds(e.target.checked?[...ids,row.id]:ids.filter(id=>id!==row.id))}/><strong>{row.name}</strong><small>{t(kindLabels[row.kind])} · {row.role}</small></label>)}{!rows.length&&<p className="muted-text">{project.entities.some(row=>row.hidden)?t("没有匹配的对象"):t("全部对象已在画布中，可使用筛选查看。")}</p>}</div></div><div className="modal-actions"><button className="secondary" onClick={onCreate}>{t("新建故事对象")}</button><button className="primary" disabled={!ids.length} onClick={()=>onAdd(ids)}>{t("添加 ")}{ids.length || ''}{t(" 个引用")}</button></div>
  </Modal>;
}

function RelationList({ project, anchorId, initialCategory, onClose, onEdit, onLocate }) {
  useI18n();
  const [query,setQuery] = useState(''); const [category,setCategory] = useState(initialCategory || ''); const [onlyActor,setOnlyActor] = useState(!!anchorId);
  const anchor = project.entities.find(row=>row.id===anchorId);
  const byId = new Map(project.entities.map(row=>[row.id,row]));
  const rows = project.relations.filter(edge=>(!onlyActor||edge.source===anchorId||edge.target===anchorId)&&(!category||edge.category===category)&&`${byId.get(edge.source)?.name} ${edge.label} ${byId.get(edge.target)?.name} ${edge.description || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Modal title={t("关系列表")} subtitle={t("集中查找、编辑和定位项目中的关系，包括未显示在画布的对象。")} onClose={onClose} wide className="relation-list-modal">
    <div className="relation-list-filters"><input aria-label={t("搜索关系")} placeholder={t("搜索人物、关系名称或说明")} value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label={t("列表关系类别")} value={category} onChange={e=>setCategory(e.target.value)}><option value="">{t("全部类别")}</option>{Object.entries(relationCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{anchor&&<label><input type="checkbox" checked={onlyActor} onChange={e=>setOnlyActor(e.target.checked)}/>{t("只看 ")}{anchor.name}</label>}</div>
    <div className="relation-table-scroll"><table className="relation-table"><thead><tr><th>{t("来源")}</th><th>{t("关系 / 说明")}</th><th>{t("目标")}</th><th>{t("类别")}</th><th>{t("操作")}</th></tr></thead><tbody>{rows.map(edge=><tr key={edge.id}><td>{byId.get(edge.source)?.name}</td><td><strong><span title={edge.direction==='both'?t("双向关系"):t("单向关系")}>{edge.direction==='both'?'↔':'→'}</span> {edge.label}</strong>{edge.description&&<small>{edge.description}</small>}</td><td>{byId.get(edge.target)?.name}</td><td>{relationCategories[edge.category] || relationCategories.social}</td><td><div><button aria-label={t("定位关系 {0}", [edge.label])} onClick={()=>onLocate(edge)}>{t("定位")}</button><button aria-label={t("编辑关系 {0}", [edge.label])} onClick={()=>onEdit(edge)}>{t("编辑")}</button></div></td></tr>)}</tbody></table>{!rows.length&&<div className="planning-empty"><Link size={26}/><p>{t("没有匹配的关系")}</p></div>}</div><div className="modal-actions"><small>{t("共 ")}{rows.length}{t(" 条关系")}</small><button className="primary" onClick={onClose}>{t("完成")}</button></div>
  </Modal>;
}

export function RelationshipCanvas({ local, selectedId, onSelect, onPositions, onConnect, onEdge, onReady, onDropEntity, rehearsal, onWorkbench, onLocate, onSceneWorkbench, onPlace, onCreate, onStory, onEditProfile, announce }) {
  useI18n();
  const project = local.project, content = project._document?.content;
  const [filters,setFilters] = useState(emptyFilters);
  const [tool,setTool] = useState('select'); const [highlight,setHighlight] = useState(false); const [flow,setFlow] = useState(null); const [zoom,setZoom] = useState(100);
  const [menu,setMenu] = useState(null); const [modal,setModal] = useState(null); const [busy,setBusy] = useState(false); const [history,setHistory] = useState([]);
  const saving = useRef(false);
  const selected = project.entities.find(row=>row.id===selectedId);
  const groups = characterGroups(content?.characters || []);
  const level = content?.levels.find(row=>row.id===filters.levelId);
  const visible = useMemo(()=>visibleRelationshipEntities(project,filters),[project,filters]);
  const ids = useMemo(()=>new Set(visible.map(row=>row.id)),[visible]);
  const edges = useMemo(()=>visibleRelationshipEdges(project,visible,filters.category),[project,visible,filters.category]);
  const highlighted = useMemo(()=>highlight && selected?.kind==='character' ? directAssociates(project.relations,selectedId) : null,[highlight,selected?.kind,selectedId,project.relations]);
  useEffect(()=>{setFilters(emptyFilters);setHighlight(false);setHistory([]);setMenu(null);setModal(null);},[project._document?.project_id]);
  useEffect(()=>{if(selected?.kind!=='character')setHighlight(false);},[selected?.kind]);
  useEffect(()=>{ if(filters.group&&!groups.includes(filters.group))setFilters(v=>({...v,group:''})); if(filters.levelId&&!level)setFilters(v=>({...v,levelId:'',trackId:''})); if(filters.trackId&&level&&!level.tracks.some(t=>t.id===filters.trackId))setFilters(v=>({...v,trackId:''})); },[content?.characters,content?.levels,filters.group,filters.levelId,filters.trackId,level]);
  const change = (key,value) => setFilters(v=>({...v,[key]:value,...(key==='levelId'?{trackId:''}:{})}));
  const closeMenu = useCallback((restore=true)=>{setMenu(null);if(restore)requestAnimationFrame(()=>document.querySelector(`[data-testid="card-${selectedId}"] .node-more`)?.focus({preventScroll:true}));},[selectedId]);
  const actions = (item,position) => { onSelect(item.id); setMenu({item,position}); };
  const fit = () => flow?.fitView({padding:canvasPadding,duration:200,maxZoom:1});
  const reveal = identifiers => { local.setProject(previous=>({...previous,entities:previous.entities.map(row=>identifiers.includes(row.id)?{...row,hidden:false}:row)})); };
  const focus = identifiers => { setFilters(emptyFilters); reveal(identifiers); setTimeout(()=>flow?.fitView({nodes:identifiers.map(id=>({id})),padding:{top:'80px',bottom:.35,x:.35},maxZoom:1,duration:200}),100); };
  const locateRelation = edge => { setModal(null);onSelect(edge.source);focus([edge.source,edge.target]); };
  const commitGroups = async operation => {
    if(saving.current)throw new Error(t("正在保存，请稍后重试"));
    const commands=groupCommands(content.characters,operation);if(!commands.length){announce(t("分组归属没有变化"));return;}
    const before=commands.map(cmd=>({id:cmd.target.id,tags:[...content.characters.find(row=>row.id===cmd.target.id).tags]})); const after=commands.map(cmd=>({id:cmd.target.id,tags:[...cmd.changes.tags]}));
    saving.current=true;setBusy(true);try{await local.transact(commands);setHistory(v=>[...v.slice(-19),{before,after}]);if(operation.type==='rename'&&filters.group===operation.source)change('group',operation.target.trim());announce(t("人物分组已保存；可撤销"));}finally{saving.current=false;setBusy(false);}
  };
  const undoGroups = async () => { if(!history.length)return;if(saving.current)throw new Error(t("正在保存，请稍后重试"));const commands=undoGroupCommands(content.characters,history.at(-1));saving.current=true;setBusy(true);try{await local.transact(commands);setHistory(v=>v.slice(0,-1));announce(t("已撤销人物分组修改"));}finally{saving.current=false;setBusy(false);} };
  const manage = id => setModal({type:'membership',ids:[id]});
  const act = (action,item) => {
    closeMenu(false);
    if(action==='edit')onSelect(item.id,true);
    if(action==='highlight')setHighlight(v=>!v);
    if(action==='membership'||action==='move')setModal({type:action,ids:[item.id]});
    if(action==='appearances')setModal({type:'appearances',id:item.id});
    if(action==='workbench')onWorkbench(item.id);
    if(action==='profile')onEditProfile(item.id);
    if(action==='story')onStory(item.id);
    if(action==='relations')setModal({type:'relations',id:item.id});
    if(action==='connect')onConnect({source:item.id,target:''});
    if(action==='hide'){local.setProject(previous=>({...previous,entities:previous.entities.map(row=>row.id===item.id?{...row,hidden:true}:row)}));announce(t("已移出当前画布，人物与关系保留；可从添加节点恢复"));}
  };
  const actor = content?.characters.find(row=>row.id===modal?.id);
  return <div className="relationship-shell">
    <header className="relationship-heading"><div><small>{t("关系规划 / 人物与故事")}</small><h1>{project.world.name || t("新世界")}</h1></div><div><button className="subtle-button" disabled={busy} onClick={()=>setModal({type:'directory'})}><Tag size={14}/>{t("管理分组")}</button><button className="icon-button" aria-label={t("撤销画布分组操作")} disabled={busy||!history.length} onClick={()=>undoGroups().catch(error=>announce(error.message))}><ArrowCounterClockwise size={15}/></button></div></header>
    <div className="relationship-filters"><label className="relationship-search"><MagnifyingGlass size={15}/><input aria-label={t("搜索画布对象")} placeholder={t("姓名、身份、分组或备注")} value={filters.query} onChange={e=>change('query',e.target.value)}/></label><select aria-label={t("画布对象类型")} value={filters.kind} onChange={e=>change('kind',e.target.value)}><option value="">{t("全部对象")}</option>{Object.entries(kindLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><select aria-label={t("画布人物分组")} value={filters.group} onChange={e=>change('group',e.target.value)}><option value="">{t("全部分组")}</option>{groups.map(g=><option key={g}>{g}</option>)}</select><select aria-label={t("画布关卡")} value={filters.levelId} onChange={e=>change('levelId',e.target.value)}><option value="">{t("全部关卡")}</option>{content?.levels.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select><select aria-label={t("画布场景")} disabled={!level} value={filters.trackId} onChange={e=>change('trackId',e.target.value)}><option value="">{t("全部场景")}</option>{level?.tracks.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select><select aria-label={t("画布关系类别")} value={filters.category} onChange={e=>change('category',e.target.value)}><option value="">{t("全部关系")}</option>{Object.entries(relationCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{Object.values(filters).some(Boolean)&&<button className="icon-button" aria-label={t("清除画布筛选")} onClick={()=>setFilters(emptyFilters)}><X size={15}/></button>}</div>
    <div className="relationship-status" aria-live="polite"><span>{visible.length}{t(" 个对象 · ")}{edges.length}{t(" 条连线")}{filters.levelId?t(" · 按出场安排筛选"):''}</span>{highlight&&selected&&<span>{t("高亮：")}{selected.name}{t(" 与直接关联对象 · 再次点击按钮取消")}</span>}{selected&&!ids.has(selected.id)&&<span>{t("所选对象不在当前视图")}</span>}<button className="subtle-button" onClick={fit}>{t("适合画布")}</button></div>
    <div className="relationship-graph relationship-surface">
    <div className="canvas-tools relationship-canvas-tools" role="toolbar" aria-label={t("关系画布工具")}>
      <button aria-label={t("选择")} aria-pressed={tool==='select'} className={tool==='select'?'active':''} onClick={()=>setTool('select')} title={t("选择和拖拽对象")}><Cursor size={16}/><span>{t("选择")}</span></button>
      <button aria-label={t("移动画布")} aria-pressed={tool==='pan'} className={tool==='pan'?'active':''} onClick={()=>setTool('pan')}><Hand size={16}/><span>{t("移动画布")}</span></button>
      <button aria-label={t("建立关联")} onClick={()=>onConnect({source:selectedId || '',target:''})}><Link size={16}/><span>{t("建立关联")}</span></button>
      <button aria-label={t("高亮关联")} aria-pressed={highlight} disabled={selected?.kind!=='character'} className={highlight?'active':''} title={highlight?t("再次点击恢复全部"):t("突出所选人物与直接关联对象")} onClick={()=>setHighlight(v=>!v)}><Target size={16}/><span>{highlight?t("取消高亮"):t("高亮关联")}</span></button>
      <button aria-label={t("关系列表")} onClick={()=>setModal({type:'relations'})}><ListBullets size={16}/><span>{t("关系列表")}</span></button>
      <button aria-label={t("添加节点")} onClick={()=>setModal({type:'references'})}><Plus size={17}/><span>{t("添加节点")}</span></button>
      <button aria-label={t("显示全部节点")} title={t("适合当前筛选的画布")} onClick={fit}><ArrowsOut size={16}/></button>
    </div>
      <Graph fitPadding={canvasPadding} project={project} selectedId={selectedId} onSelect={onSelect} onPatch={onPositions} onConnect={onConnect} onEdge={onEdge} onReady={instance=>{setFlow(instance);onReady(instance);}} tool={tool} onDropEntity={onDropEntity} onDragState={local.setDragging} rehearsal={rehearsal} onWorkbench={onWorkbench} local={local} visibleIds={ids} category={filters.category} highlightedIds={highlighted} onActions={actions} onGroups={manage} onAppearances={id=>setModal({type:'appearances',id})} onRelations={id=>setModal({type:'relations',id})} onViewport={viewport=>setZoom(Math.round(viewport.zoom*100))}/>
      {!visible.length&&<div className="relationship-empty"><p>{t("当前没有匹配的画布对象")}</p><button className="secondary" onClick={()=>setFilters(emptyFilters)}>{t("清除筛选")}</button><button className="secondary" onClick={()=>setModal({type:'references'})}>{t("添加已有对象")}</button></div>}
      <div className="canvas-zoom"><button aria-label={t("缩小画布")} onClick={()=>flow?.zoomOut({duration:150})}>−</button><button title={t("原始比例")} onClick={()=>flow?.zoomTo(1,{duration:150})}>{zoom}%</button><button aria-label={t("放大画布")} onClick={()=>flow?.zoomIn({duration:150})}>＋</button></div>
    </div>
    {menu&&<NodeMenu item={menu.item} position={menu.position} highlighted={highlight} onClose={closeMenu} onAction={act}/>}
    {modal?.type==='membership'&&<MembershipModal characters={content.characters} ids={modal.ids} onClose={()=>setModal(null)} onSave={commitGroups}/>}
    {modal?.type==='move'&&<MoveGroupModal characters={content.characters} ids={modal.ids} initialSource={filters.group} onClose={()=>setModal(null)} onSave={commitGroups}/>}
    {modal?.type==='directory'&&<GroupManagerModal characters={content.characters} initialGroup={filters.group} onClose={()=>setModal(null)} onSave={commitGroups} onUndo={undoGroups} canUndo={!!history.length}/>}
    {modal?.type==='references'&&<ReferencePicker project={project} onClose={()=>setModal(null)} onAdd={ids=>{reveal(ids);setModal(null);setFilters(emptyFilters);announce(t("已有对象已放回画布"));setTimeout(fit,100);}} onCreate={()=>{setModal(null);onCreate();}}/>}
    {modal?.type==='relations'&&<RelationList project={project} anchorId={modal.id} initialCategory={filters.category} onClose={()=>setModal(null)} onEdit={edge=>{setModal(null);onEdge(edge);}} onLocate={locateRelation}/>}
    {modal?.type==='appearances'&&actor&&<Modal title={t("{0} · 出场安排", [actor.name])} subtitle={t("定位对应关卡场景，或直接进入该次出场的对白与预演。")} onClose={()=>setModal(null)}><div className="relationship-appearances">{appearancesFor(content,actor.id).map(({level,appearance})=><article className="appearance-summary" key={`${level.id}-${appearance.id}`}><small>{appearanceLabel(level,appearance)}</small><div><button onClick={()=>{setModal(null);onLocate(level.id,appearance.id,actor.id);}}>{t("定位关卡")}</button><button onClick={()=>{setModal(null);onSceneWorkbench(level,appearance);}}>{t("对白 / 预演")}</button></div></article>)}{!appearancesFor(content,actor.id).length&&<p className="muted-text">{t("还没有安排出场。")}</p>}</div><div className="modal-actions"><button className="primary" onClick={()=>{setModal(null);onPlace([actor.id]);}}>{t("安排出场")}</button><button className="secondary" onClick={()=>setModal(null)}>{t("完成")}</button></div></Modal>}
  </div>;
}
