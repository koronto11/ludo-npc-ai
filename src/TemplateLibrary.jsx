import { t, tm, useI18n } from './i18n';
import {useEffect,useRef,useState} from 'react';
import {Modal} from './Modal';
import {api} from './localApi';
import {appearanceLabel} from './planning';
import './templatesExport.css';

export function TemplateLibrary({local,initialKind='all',initialSource,onClose,onApplied,announce}) {
  useI18n();
  const c=local.project._document.content;
  const [library,setLibrary]=useState(null),[kind,setKind]=useState(initialKind),[selected,setSelected]=useState(''),[archived,setArchived]=useState(false),[name,setName]=useState(''),[actorId,setActorId]=useState(''),[appearanceKey,setAppearanceKey]=useState('');
  const [captureOpen,setCaptureOpen]=useState(!!initialSource),[sourceKind,setSourceKind]=useState(initialSource?.kind||'character'),[sourceId,setSourceId]=useState(initialSource?.id||''),[templateName,setTemplateName]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const active=useRef(false);
  const refresh=()=>api('/api/templates').then(setLibrary).catch(e=>setError(e.message));
  useEffect(()=>{let alive=true;api('/api/templates').then(v=>{if(alive)setLibrary(v);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
  const row=library?.items.find(t=>t.id===selected);
  const entries=library?.items.filter(t=>(kind==='all'||t.payload.kind===kind)&&t.archived===archived)||[];
  const sourceRows=c[sourceKind==='character'?'characters':'dialogues'];
  const locations=c.levels.flatMap(l=>l.appearances.filter(a=>a.character_id===actorId).map(a=>({key:`${l.id}/${a.id}`,level:l,appearance:a})));
  const source=sourceRows.find(r=>r.id===sourceId);
  const run=async work=>{if(active.current)return;active.current=true;setBusy(true);setError('');try{await work();}catch(e){setError(e.message);}finally{active.current=false;setBusy(false);}};
  const choose=t=>{setSelected(t.id);setName(t.name);setCaptureOpen(false);setError('');setAppearanceKey('');};
  const capture=()=>run(async()=>{
    if(!sourceId)throw new Error(t("请选择已保存的人物或对白"));
    const doc=await local.exportDocument();
    const value=await api('/api/templates',{method:'POST',body:{project_id:doc.project_id,expected_revision:doc.revision,library_revision:library.revision,source_kind:sourceKind,source_id:sourceId,name:templateName.trim()||source.name}});
    setLibrary(value);setTemplateName('');setCaptureOpen(false);setArchived(false);setKind(sourceKind);setSelected(value.items.at(-1).id);setName(value.items.at(-1).name);announce(t("模板已保存到本机模板库，可在其他工程复用"));
  });
  const apply=()=>run(async()=>{
    if(!name.trim())throw new Error(t("请为新人物或对白填写名称"));
    const place=locations.find(v=>v.key===appearanceKey);
    const result=await local.instantiateTemplate({template_id:row.id,name:name.trim(),...(row.payload.kind==='dialogue'?{character_id:actorId,...(place?{level_id:place.level.id,appearance_id:place.appearance.id}:{})}:{})});
    onClose();onApplied(result,row.payload.kind,place);announce(result.saved?t("已从模板创建，原人物与对白保留"):result.saveError?t("对象已创建，但文件保存失败，请重试保存"):t("对象已创建，请将工程保存到本地文件"));
  });
  const archive=()=>run(async()=>{setLibrary(await api(`/api/templates/${row.id}/archive`,{method:'POST',body:{library_revision:library.revision,archived:!row.archived}}));setSelected('');announce(row.archived?t("模板已恢复"):t("模板已归档，可在已归档列表恢复"));});
  return <Modal title={t("本地模板库")} subtitle={t("从常用结构开始，也可以保存自己的设定。模板复用不调用模型。")} wide className="template-modal" onClose={()=>{if(!busy)onClose();}}>
    <div className="handoff-tabs"><select aria-label={t("筛选模板类型")} value={kind} onChange={e=>{setKind(e.target.value);setSelected('');setCaptureOpen(false);}}><option value="all">{t("全部模板")}</option><option value="character">{t("人物设定")}</option><option value="dialogue">{t("对白结构")}</option></select><button className="secondary" disabled={busy||!library} onClick={()=>{setCaptureOpen(true);setSelected('');}}>{t("保存现有内容为模板")}</button><label><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setSelected('');setCaptureOpen(false);}}/>{t("已归档")}</label></div>
    <div className="template-body"><aside className="template-cards">{entries.map(rowItem=><button key={rowItem.id} className={selected===rowItem.id?'active':''} disabled={busy} onClick={()=>choose(rowItem)}><strong>{rowItem.name}</strong><small>{rowItem.payload.kind==='character'?t("人物设定"):t("{0} 张对白卡片", [rowItem.payload.nodes.length])} · {rowItem.builtin?t("内置"):t("我的模板")}</small></button>)}{!entries.length&&library&&<p className="muted-text">{t("这里还没有模板。")}</p>}</aside><section className="template-detail">
    {captureOpen?<form onSubmit={e=>{e.preventDefault();capture();}}><h3>{t("保存现有内容为模板")}</h3><label className="form-field">{t("内容类型")}<select aria-label={t("模板来源类型")} value={sourceKind} onChange={e=>{setSourceKind(e.target.value);setSourceId('');}}><option value="character">{t("人物设定")}</option><option value="dialogue">{t("对白结构")}</option></select></label><label className="form-field">{t("已保存对象")}<select aria-label={t("模板来源对象")} required value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">{t("请选择")}</option>{sourceRows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="form-field">{t("模板名称")}<input aria-label={t("保存模板名称")} maxLength={150} value={templateName} placeholder={source?.name||t("为模板命名")} onChange={e=>setTemplateName(e.target.value)}/></label><div className="template-note">{sourceKind==='character'?t("保存人物设定；分组、认知、出场与保护标记不复制。"):t("保存正文、选项与跳转；原工程的条件、效果、条件开场和说话者不复制，使用时重新配置。")}<p>{t("只读取已保存内容，不修改来源对象。")}</p></div><button className="primary" disabled={busy||!library||!source}>{t("保存到模板库")}</button></form>:row?<>
      <h3>{row.name}</h3><div className="template-note">{row.note}</div><details><summary>{t("查看模板内容")}</summary>{row.payload.kind==='character'?<><p>{row.payload.description}</p><p>{row.payload.story}</p><p>{t("身份：")}{row.payload.role}{t(" · 口吻：")}{row.payload.voice}</p><p>{t("目标：")}{row.payload.goals.join('；')}</p></>:row.payload.nodes.map(n=><article key={n.id}><strong>{n.label||t("对白")}</strong><p>{n.text}</p>{n.options.map(o=><small key={o.id}>{o.text} → {row.payload.nodes.find(v=>v.id===o.target_node_id)?.label||t("结束")}</small>)}</article>)}</details>
      {!row.archived&&<form onSubmit={e=>{e.preventDefault();apply();}}><label className="form-field">{t("新")}{row.payload.kind==='character'?t("人物"):t("对白")}{t("名称")}<input aria-label={t("从模板创建的名称")} required maxLength={150} value={name} onChange={e=>setName(e.target.value)}/></label>{row.payload.kind==='dialogue'&&<><label className="form-field">{t("所属人物")}<select aria-label={t("模板对白所属人物")} required value={actorId} onChange={e=>{setActorId(e.target.value);setAppearanceKey('');}}><option value="">{t("请选择人物")}</option>{c.characters.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="form-field">{t("用于哪次出场")}<select aria-label={t("模板对白使用出场")} value={appearanceKey} onChange={e=>setAppearanceKey(e.target.value)}><option value="">{t("暂不关联出场")}</option>{locations.map(v=><option key={v.key} value={v.key}>{appearanceLabel(v.level,v.appearance)}</option>)}</select></label>{appearanceKey&&<small>{t("创建后自动跟随这次出场的时间、场景和条件。")}</small>}</>}<button className="primary" disabled={busy}>{busy?t("处理中…"):row.payload.kind==='character'?t("创建人物并编辑"):t("创建对白并编排")}</button></form>}
      {!row.builtin&&<button className="subtle-button" disabled={busy} onClick={archive}>{row.archived?t("恢复模板"):t("归档模板")}</button>}
    </>:<p className="muted-text">{t("选择模板查看内容，再创建新人物或对白。现有对象不会被覆盖。")}</p>}
    </section></div>{error&&<div className="handoff-error" role="alert">{tm(error)}<button className="secondary" disabled={busy} onClick={refresh}>{t("刷新模板库")}</button></div>}<div className="modal-actions"><small title={library?.path}>{t("我的模板保存在本机 templates.json，跨工程可复用。")}</small><button className="secondary" disabled={busy} onClick={onClose}>{t("关闭")}</button></div>
  </Modal>;
}
