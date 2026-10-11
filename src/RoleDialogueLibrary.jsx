import { t, tm, useI18n } from './i18n';
import { useCallback, useEffect, useState } from 'react';
import { CaretDown, CaretRight, ChatText, MapPin, Plus, Link, LinkBreak, Trash, DotsThree } from '@phosphor-icons/react';
import { appearanceLabel } from './planning';
import { roleDialogueTree, occurrenceKey, addAppearanceDialogues } from './roleDialogueTree';
import { Modal } from './Modal';
import {LibraryActionMenu} from './LibraryActions';
import {dialogueAppearances,dialogueRemovalBlockers,roleDialogueRemovalCommands} from './roleDialogueRemoval';

export function RoleDialogueLibrary({local,actor,level,appearance,draft,dirty,busy,onOpen,onCreate,onLocate,onNavigate,onGenerate,announce}) {
  useI18n();
  const content = local.project._document.content;
  const tree = roleDialogueTree(content,actor.id);
  const [expanded,setExpanded] = useState({});
  const [picker,setPicker] = useState(null);
  const [destination,setDestination] = useState(null);
  const [pendingOpen,setPendingOpen] = useState(null);
  const [menu,setMenu] = useState(null);
  const [removal,setRemoval] = useState(null);
  const closeMenu=useCallback((restore=true)=>{setMenu(previous=>{if(restore)previous?.trigger?.focus();return null;});},[]);
  useEffect(()=>{setMenu(null);setRemoval(null);setDestination(null);setPicker(null);},[local.project._document.project_id]);
  useEffect(()=>{if(!pendingOpen)return;const scene=tree.scenes.find(row=>row.key===pendingOpen.key);const graph=scene?.dialogues.find(row=>row.id===pendingOpen.graphId);if(graph){setPendingOpen(null);onOpen(scene,graph);}},[content,pendingOpen]);
  const activeKey = appearance ? `${level.id}:${appearance.id}` : null;
  useEffect(()=>{if(activeKey)setExpanded(value=>({...value,[activeKey]:true}));},[activeKey]);
  const toggle = key => setExpanded(value=>({...value,[key]:value[key]===false}));
  const createSection = !tree.scenes.length || tree.scenes.some(scene=>scene.inherited) ? 'common' : 'unlinked';
  const renderGraph = (graph,scene,category) => {
    const selected = draft?.id===graph.id && (scene ? activeKey===scene.key : !appearance);
    const displayed = selected ? draft : graph;
    const more=event=>{event.preventDefault();event.stopPropagation();const trigger=event.currentTarget,rect=trigger.getBoundingClientRect();setMenu({target:{kind:'dialogue',id:graph.id,name:displayed.name},scene,trigger,x:rect.right,y:rect.bottom});};
    const saved=content.dialogues.some(row=>row.id===graph.id);
    return <div key={graph.id} className={`role-tree-dialogue-row ${category==='unlinked'?'awaiting-association':''}`}><button className={`role-tree-dialogue ${selected?'active':''}`} aria-current={selected?'true':undefined} aria-label={t("编辑{0}对白 {1}", [scene ? ` ${scene.track?.name || '待安排场景'}` : t(category==='common'?'人物默认':category==='unlinked'?'待关联':'人物'), displayed.name])} onClick={()=>onOpen(scene,graph)} onContextMenu={saved?more:undefined}>
      <ChatText size={14}/><span><strong>{displayed.name}</strong><small>{displayed.nodes.length}{t(" 张卡片")}{tree.uses.get(graph.id)>1?t(" · 复用 {0} 次出场", [tree.uses.get(graph.id)]):''}{selected&&dirty?t(" · 未保存"):''}</small></span>
    </button>{category==='unlinked'&&<button className="role-tree-link" disabled={busy||!tree.scenes.length} aria-label={t('关联到出场：{0}',[displayed.name])} onClick={()=>onNavigate(()=>setDestination(graph),'选择对白出场')}><Link size={13}/>{t('关联到出场')}</button>}<button className="role-tree-more icon-button" disabled={busy||!saved} title={!saved?t('请先保存新对白'):undefined} aria-label={t('对白操作：{0}',[displayed.name])} aria-haspopup="menu" aria-expanded={menu?.target.id===graph.id && menu?.scene?.key===scene?.key} onClick={more}><DotsThree size={18}/></button></div>;
  };
  const pending = draft && !content.dialogues.some(graph=>graph.id===draft.id) ? draft : null;
  const section = (key,label,rows) => {
    const open=expanded[key] ?? rows.length>0;
    return <section className="role-tree-misc role-tree-purpose" key={key} data-testid={`role-dialogues-${key}`}>
      <button className="role-tree-section" aria-expanded={open} onClick={()=>setExpanded(value=>({...value,[key]:!open}))}>{open?<CaretDown/>:<CaretRight/>}<strong>{t(label)}</strong><small>{rows.length}</small></button>
      <p className="role-tree-purpose-help">{key==='common'?t('此人物的默认对白，不是所有人物共用。启用默认对白的出场会自动使用。'):t('当前没有出场使用的对白。可先写作，再关联到具体出场。')}</p>
      {open&&<div>{rows.map(graph=>renderGraph(graph,null,key))}{!rows.length&&<p className="role-tree-empty">{key==='common'?t('尚无人物默认对白'):t('没有待关联的对白')}</p>}</div>}
      {createSection===key&&<div className="role-tree-create"><button className="secondary" disabled={busy} onClick={()=>onCreate(null)}><Plus size={14}/>{t(key==='common'?'新建人物默认对白':'新建待关联对白')}</button><small>{t(key==='common'?(tree.scenes.length?'保存后，使用默认对白的出场也会使用它。':'保存为人物默认对白，安排出场时可使用。'):'保存后进入此区，关联到出场后才会在该出场使用。')}</small></div>}
    </section>;
  };
  return <aside className="role-context role-dialogue-library" aria-label={t("出场与对白")}>
    <h3>{t("出场与对白 ")}<small>{tree.scenes.length}{t(" 次出场")}</small></h3>
    {tree.scenes.map(scene=>{
      const open = expanded[scene.key]!==false;
      const graphs = pending && activeKey===scene.key ? [...scene.dialogues,pending] : scene.dialogues;
      return <section className={`role-tree-scene ${activeKey===scene.key?'active-scene':''}`} key={scene.key} data-testid={`role-occurrence-${scene.appearance.id}`}>
        <div className="role-tree-scene-heading"><button className="role-tree-expander" aria-label={t("{0}出场 {1} {2}", [open?t("收起"):t("展开"), scene.track?.name || t("待安排场景"), scene.appearance.id])} aria-expanded={open} onClick={()=>toggle(scene.key)}>{open?<CaretDown/>:<CaretRight/>}</button><button className="role-tree-scene-title" aria-label={t("选择出场 {0}", [appearanceLabel(scene.level,scene.appearance)])} onClick={()=>onOpen(scene,scene.dialogues[0])}><MapPin size={14}/><strong>{scene.track?.name || t("待安排场景")}</strong><small>{graphs.length}{t(" 对白")}</small></button></div>
        <p className="role-tree-time">{appearanceLabel(scene.level,scene.appearance)}</p>
        {open&&<div className="role-tree-children">{scene.inherited&&<p className="role-tree-default">{t("使用人物默认对白")}</p>}{graphs.map(graph=>renderGraph(graph,scene))}{!graphs.length&&<p className="role-tree-empty">{t("还没有对白，可从下面新建或关联。")}</p>}
          <div className="role-tree-actions"><button disabled={busy} title={t('新建并仅关联到本次出场')} onClick={()=>onCreate(scene)}><Plus size={13}/>{t("新建场景对白")}</button><button disabled={busy} onClick={()=>onNavigate(()=>setPicker({scene}),`${scene.track?.name || '这次出场'} / 关联已有对白`)}><Link size={13}/>{t("关联已有")}</button><button title={t("定位这次出场")} aria-label={t("定位出场 {0}", [scene.appearance.id])} onClick={()=>onLocate(scene.level.id,scene.appearance.id,actor.id)}><MapPin size={13}/></button></div>
        </div>}
      </section>;
    })}
    {!tree.scenes.length&&<p className="role-tree-empty">{t('尚未安排关卡出场，可先编写人物默认对白。')}</p>}
    {section('common','人物默认对白',tree.common)}{section('unlinked','待关联对白',tree.unlinked)}
    {pending&&!appearance&&<section className="role-tree-misc"><h3>{t("新建对白 · 未保存")}</h3>{renderGraph(pending,null)}</section>}
    <button className="subtle-button" onClick={()=>onGenerate(actor.id)}>{t("生成人物故事")}</button>
    {destination&&<Modal title={t('选择对白出场')} subtitle={destination.name} onClose={()=>setDestination(null)}><div className="role-link-picker"><p>{t('选择具体出场，下一步确认关联。对白内容会被复用，不会复制。')}</p>{tree.scenes.map(scene=><button className="role-link-option role-destination-option" key={scene.key} onClick={()=>{setPicker({scene,graphId:destination.id});setDestination(null);}}><MapPin size={16}/><span><strong>{appearanceLabel(scene.level,scene.appearance)}</strong><small>{scene.inherited?t('正在使用人物默认对白'):t('使用本次出场指定的对白')}</small></span><CaretRight size={15}/></button>)}</div></Modal>}
    {picker&&<AssociateDialogueModal local={local} scene={picker.scene} initialGraphId={picker.graphId} onClose={()=>setPicker(null)} onSaved={(_,graph)=>{setPendingOpen({key:picker.scene.key,graphId:graph.id});setPicker(null);announce(t("对白已关联到这次出场"));}}/>}
    {menu&&<LibraryActionMenu context={menu} onClose={closeMenu} actions={[...(menu.scene?[{label:'移除本次出场关联',Icon:LinkBreak,run:()=>onNavigate(()=>setRemoval({graphId:menu.target.id,sceneKey:menu.scene.key,mode:'unlink'}),'移除对白关联')}]:[]),{label:'删除对白',Icon:Trash,danger:true,run:()=>onNavigate(()=>setRemoval({graphId:menu.target.id,mode:'delete'}),'确认删除对白')} ]}/>}
    {removal&&<DialogueRemovalDialog local={local} request={removal} onClose={()=>setRemoval(null)} onSaved={()=>{setRemoval(null);announce(t(removal.mode==='unlink'?'已移除本次出场关联，对白内容保留。':'对白已删除，可使用顶部撤销恢复。'));}}/>}
  </aside>;
}

function DialogueRemovalDialog({local,request,onClose,onSaved}) {
  useI18n();
  const [base]=useState(()=>structuredClone(local.project._document));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const graph=base.content.dialogues.find(row=>row.id===request.graphId);
  const rows=dialogueAppearances(base,request.graphId).filter(row=>request.mode==='delete'||row.key===request.sceneKey);
  const blockers=request.mode==='delete'?dialogueRemovalBlockers(local.project._document,request.graphId):[];
  const save=async()=>{if(busy)return;setBusy(true);setError('');try{await local.transact(latest=>roleDialogueRemovalCommands(base,request,latest));onSaved();}catch(reason){setError(reason.message);}finally{setBusy(false);}};
  return <Modal title={t(request.mode==='unlink'?'确认移除出场关联？':'确认删除对白？')} subtitle={graph?.name} onClose={busy?()=>{}:onClose}><div className="role-dialogue-removal"><p>{request.mode==='unlink'?t('仅从本次出场移除这份对白，保留对白内容和其他出场的关联。'):t('删除整份对白及其卡片、分支和画布布局，同时移除所有出场对它的关联。')}</p><p>{t('影响 {0} 次出场；历史试玩记录保留。可使用顶部撤销恢复。',[rows.length])}</p>{rows.map(row=><p className="muted-text" key={row.key}>{appearanceLabel(row.level,row.appearance)}</p>)}{blockers.length>0&&<><p className="danger" role="status">{t('对白仍被草稿、生成记录或剧情资料引用，请先处理关联。')}</p>{blockers.map(row=><p className="muted-text" key={`${row.kind}:${row.id}`}>{row.name}</p>)}</>}{error&&<p className="danger" role="alert">{tm(error)}</p>}</div><div className="modal-actions"><button className="secondary" disabled={busy} onClick={onClose}>{t('取消')}</button><button className="secondary library-confirm-delete" disabled={busy||!graph||blockers.length>0} onClick={save}>{busy?t('处理中…'):t(request.mode==='unlink'?'确认移除关联':'确认删除')}</button></div></Modal>;
}

function AssociateDialogueModal({local,scene,initialGraphId,onClose,onSaved}) {
  useI18n();
  const c = local.project._document.content;
  const [selected,setSelected] = useState(()=>initialGraphId?[initialGraphId]:[]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const level = c.levels.find(row=>row.id===scene.level.id);
  const appearance = level?.appearances.find(row=>row.id===scene.appearance.id);
  const tree = roleDialogueTree(c,scene.appearance.character_id);
  const current = tree.scenes.find(row=>row.key===occurrenceKey(scene))?.dialogues || [];
  const candidates = c.dialogues.filter(graph=>!graph.character_id || graph.character_id===scene.appearance.character_id);
  const save = async () => {
    if(busy)return;setBusy(true);setError('');
    try {if(!appearance)throw new Error(t("这次出场已不存在，请重新选择"));const next=addAppearanceDialogues(c,level,appearance,selected);await local.transact([{type:'put_level',level:next}]);onSaved(next,candidates.find(graph=>graph.id===selected[0]));}
    catch(reason){setError(reason.message);}finally{setBusy(false);}
  };
  return <Modal title={t("关联已有对白")} onClose={busy?()=>{}:onClose}><div className="role-link-picker"><p>{appearanceLabel(scene.level,scene.appearance)}</p><p className="muted-text">{t("复用已有对白，保留这次出场已经使用的对白。共享对白修改后，关联它的出场会一起更新。")}</p>{candidates.map(graph=>{const used=current.some(row=>row.id===graph.id);return <label className="role-link-option" key={graph.id}><input type="checkbox" aria-label={t("关联对白 {0}", [graph.name])} disabled={busy||used} checked={used||selected.includes(graph.id)} onChange={event=>setSelected(ids=>event.target.checked?[...ids,graph.id]:ids.filter(id=>id!==graph.id))}/><span><strong>{graph.name}</strong><small>{used?t("本次出场已使用"):t("{0} 张卡片", [graph.nodes.length])}</small></span></label>;})}{!candidates.length&&<p className="muted-text">{t("尚无可复用的对白，请先新建。")}</p>}{error&&<p className="danger" role="alert">{tm(error)}</p>}<div className="modal-actions"><button className="secondary" disabled={busy} onClick={onClose}>{t("取消")}</button><button className="primary" disabled={busy||!selected.length} onClick={save}>{busy?t("正在关联…"):t("关联到这次出场")}</button></div></div></Modal>;
}
