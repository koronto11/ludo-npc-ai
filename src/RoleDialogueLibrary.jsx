import { t, tm, useI18n } from './i18n';
import { useEffect, useState } from 'react';
import { CaretDown, CaretRight, ChatText, MapPin, Plus, Link } from '@phosphor-icons/react';
import { appearanceLabel } from './planning';
import { roleDialogueTree, occurrenceKey, addAppearanceDialogues } from './roleDialogueTree';
import { Modal } from './Modal';

export function RoleDialogueLibrary({local,actor,level,appearance,draft,dirty,busy,onOpen,onCreate,onLocate,onNavigate,onGenerate,announce}) {
  useI18n();
  const content = local.project._document.content;
  const tree = roleDialogueTree(content,actor.id);
  const [expanded,setExpanded] = useState({});
  const [picker,setPicker] = useState(null);
  const [pendingOpen,setPendingOpen] = useState(null);
  useEffect(()=>{if(!pendingOpen)return;const scene=tree.scenes.find(row=>row.key===pendingOpen.key);const graph=scene?.dialogues.find(row=>row.id===pendingOpen.graphId);if(graph){setPendingOpen(null);onOpen(scene,graph);}},[content,pendingOpen]);
  const activeKey = appearance ? `${level.id}:${appearance.id}` : null;
  useEffect(()=>{if(activeKey)setExpanded(value=>({...value,[activeKey]:true}));},[activeKey]);
  const toggle = key => setExpanded(value=>({...value,[key]:value[key]===false}));
  const renderGraph = (graph,scene) => {
    const selected = draft?.id===graph.id && (scene ? activeKey===scene.key : !appearance);
    const displayed = selected ? draft : graph;
    return <button key={graph.id} className={`role-tree-dialogue ${selected?'active':''}`} aria-current={selected?'true':undefined} aria-label={t("编辑{0}对白 {1}", [scene ? ` ${scene.track?.name || '待安排场景'}` : t("通用或未关联"), displayed.name])} onClick={()=>onOpen(scene,graph)}>
      <ChatText size={14}/><span><strong>{displayed.name}</strong><small>{displayed.nodes.length}{t(" 张卡片")}{tree.uses.get(graph.id)>1?t(" · 复用 {0} 次出场", [tree.uses.get(graph.id)]):''}{selected&&dirty?t(" · 未保存"):''}</small></span>
    </button>;
  };
  const pending = draft && !content.dialogues.some(graph=>graph.id===draft.id) ? draft : null;
  const section = (key,label,rows) => {const open=expanded[key] ?? rows.some(graph=>!appearance&&draft?.id===graph.id);return <section className="role-tree-misc" key={key}><button className="role-tree-section" aria-expanded={open} onClick={()=>setExpanded(value=>({...value,[key]:!open}))}>{open?<CaretDown/>:<CaretRight/>}<strong>{t(label)}</strong><small>{rows.length}</small></button>{open&&<div>{rows.map(graph=>renderGraph(graph,null))}{!rows.length&&<p className="role-tree-empty">{key==='common'?t("尚无通用对白"):t("所有对白都已安排到出场")}</p>}</div>}</section>;};
  return <aside className="role-context role-dialogue-library" aria-label={t("出场与对白")}>
    <h3>{t("出场与对白 ")}<small>{tree.scenes.length}{t(" 次出场")}</small></h3>
    {tree.scenes.map(scene=>{
      const open = expanded[scene.key]!==false;
      const graphs = pending && activeKey===scene.key ? [...scene.dialogues,pending] : scene.dialogues;
      return <section className={`role-tree-scene ${activeKey===scene.key?'active-scene':''}`} key={scene.key} data-testid={`role-occurrence-${scene.appearance.id}`}>
        <div className="role-tree-scene-heading"><button className="role-tree-expander" aria-label={t("{0}出场 {1} {2}", [open?t("收起"):t("展开"), scene.track?.name || t("待安排场景"), scene.appearance.id])} aria-expanded={open} onClick={()=>toggle(scene.key)}>{open?<CaretDown/>:<CaretRight/>}</button><button className="role-tree-scene-title" aria-label={t("选择出场 {0}", [appearanceLabel(scene.level,scene.appearance)])} onClick={()=>onOpen(scene,scene.dialogues[0])}><MapPin size={14}/><strong>{scene.track?.name || t("待安排场景")}</strong><small>{graphs.length}{t(" 对白")}</small></button></div>
        <p className="role-tree-time">{appearanceLabel(scene.level,scene.appearance)}</p>
        {open&&<div className="role-tree-children">{scene.inherited&&<p className="role-tree-default">{t("使用人物默认对白")}</p>}{graphs.map(graph=>renderGraph(graph,scene))}{!graphs.length&&<p className="role-tree-empty">{t("还没有对白，可从下面新建或关联。")}</p>}
          <div className="role-tree-actions"><button disabled={busy} onClick={()=>onCreate(scene)}><Plus size={13}/>{t("新建对白")}</button><button disabled={busy} onClick={()=>onNavigate(()=>setPicker(scene),`${scene.track?.name || '这次出场'} / 关联已有对白`)}><Link size={13}/>{t("关联已有")}</button><button title={t("定位这次出场")} aria-label={t("定位出场 {0}", [scene.appearance.id])} onClick={()=>onLocate(scene.level.id,scene.appearance.id,actor.id)}><MapPin size={13}/></button></div>
        </div>}
      </section>;
    })}
    {!tree.scenes.length&&<p className="role-tree-empty">{t("尚未安排关卡出场，可先编写通用对白。")}</p>}
    {section('common','通用对白',tree.common)}{section('unlinked','未关联对白',tree.unlinked)}
    {pending&&!appearance&&<section className="role-tree-misc"><h3>{t("新建对白 · 未保存")}</h3>{renderGraph(pending,null)}</section>}
    <button className="secondary role-create-general" disabled={busy} onClick={()=>onCreate(null)}><Plus size={14}/>{t("新建对白（暂不关联）")}</button><button className="subtle-button" onClick={()=>onGenerate(actor.id)}>{t("生成人物故事")}</button>
    {picker&&<AssociateDialogueModal local={local} scene={picker} onClose={()=>setPicker(null)} onSaved={(_,graph)=>{setPendingOpen({key:picker.key,graphId:graph.id});setPicker(null);announce(t("对白已关联到这次出场"));}}/>}
  </aside>;
}

function AssociateDialogueModal({local,scene,onClose,onSaved}) {
  useI18n();
  const c = local.project._document.content;
  const [selected,setSelected] = useState([]);
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
