import {MoreDetails} from './MoreDetails';
import {authorEntityCommands} from './moreDetailsModel';
import { t, tm, useI18n } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { X, Plus, Flag, Play, ArrowRight, CheckCircle } from '@phosphor-icons/react';
import { ConditionEditor, EffectsEditor, StoryAuthoring } from './StoryAuthoring';
import { RehearsalControls, Reason, RuntimeConversation, humanPath, humanValue } from './Rehearsal';
import { uid, clone, conditionLabel } from './planning';
import { plotRows, plotActors, plotScopeLabel } from './plotPlanning';
import './plot.css';
import { useNavigationEditor } from './UnsavedNavigation';

export function PlotDirector({ local, level, request, rehearsal, announce, onClose, onDirtyChange, onLocate, onWorkbench, onSaved, onNavigationHandlers }) {
  useI18n();
  const c = local.project._document.content;
  const [tab,setTab] = useState(request.resources ? 'resources' : request.id || request.creating ? 'edit' : 'list');
  const [row,setRow] = useState(() => request.id ? clone(plotRows(c).find(row => row.id === request.id)) : request.creating ? newPlot(request.kind || 'event',request.global?null:level,request.trackId,c) : null);
  const [base,setBase]=useState(null);
  const [dirty,setDirty] = useState(!!request.creating);
  const [resourceDirty,setResourceDirty] = useState(false);
  const [saving,setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(()=>{if(!dirty)setBase(row?structuredClone(row):null);},[row,dirty]);
  const [error,setError] = useState('');
  const [filter,setFilter] = useState(request.global ? 'global' : 'level');
  const [query,setQuery] = useState('');
  const [actorId,setActorId] = useState('');
  const [showVariables,setShowVariables] = useState(false);
  const [previewReady,setPreviewReady] = useState(false);
  const unsaved = dirty || resourceDirty || saving;
  useEffect(() => { onDirtyChange(unsaved); return () => onDirtyChange(false); },[unsaved,onDirtyChange]);
  useEffect(() => { if(!dirty) return; const warn=e=>{e.preventDefault();e.returnValue='';}; window.addEventListener('beforeunload',warn); return()=>window.removeEventListener('beforeunload',warn); },[dirty]);
  useEffect(()=>{if(!dirty && row){const current=plotRows(c).find(item=>item.id===row.id);if(current)setRow(clone(current));}},[local.project._document.content_revision]);
  const guard = () => { if(unsaved){announce(t("请先保存或放弃当前剧情编辑"));return false;} return true; };
  const update = changes => {setRow(row=>({...row,...changes}));setDirty(true);setError('');};
  const open = value => {if(!guard())return;setRow(clone(value));setTab('edit');setError('');setPreviewReady(false);};
  const create = kind => {if(!guard())return;setRow(newPlot(kind,filter==='global'?null:level,request.trackId,c));setDirty(true);setTab('edit');setPreviewReady(false);setError('');};
  const save = async e => {
    e?.preventDefault(); if(savingRef.current)return false;
    savingRef.current=true;setSaving(true);setError('');
    try {
      const {id}=row;
      const next=await local.transact(latest=>authorEntityCommands(base,row,latest));
      setRow(clone(plotRows(next.content).find(item=>item.id===id)));setDirty(false);setPreviewReady(false);onSaved?.();announce(t("剧情已保存，预演将按新内容重算"));return true;
    } catch(reason){setError(reason.message);return false;} finally{savingRef.current=false;setSaving(false);}
  };
  const discard = () => {setRow(clone(plotRows(c).find(item=>item.id===row?.id) || null));setDirty(false);setError('');if(!plotRows(c).some(item=>item.id===row?.id))setTab('list');};
  useNavigationEditor(onNavigationHandlers,{dirty,busy:saving,name:row?.name || '剧情编排',save:()=>save(),discard:()=>{discard();return true;}});
  const preview = () => {
    if(!guard())return;
    const target=c.levels.find(item=>item.id===row?.scope?.level_id) || level;
    const track=target?.tracks.find(item=>item.id===row?.scope?.track_id);
    if(!rehearsal.focusContext(target?.id,track?.location_id,row?.scheduled_at ?? c.initial_state.tick))return;
    setActorId(plotActors(row || {effects:[]})[0] || c.characters[0]?.id || '');setPreviewReady(true);setTab('preview');
  };
  useEffect(()=>{if(request.preview)preview();},[]);
  const scopeLevel=c.levels.find(item=>item.id===row?.scope?.level_id);
  const currentActors=row?plotActors(row):[];
  const shown=plotRows(c).filter(item=>(filter==='all' || (filter==='global'?!item.scope:item.scope?.level_id===level?.id)) && `${item.name} ${item.description || ''} ${plotScopeLabel(item,c)}`.includes(query.trim()));
  const status = row?.kind==='event'?rehearsal.result?.events.find(event=>event.id===row.id):null;
  const ruleStatus = rehearsal.result?.rules?.find(rule=>rule.id===row?.id);
  const ruleFired = rehearsal.result?.state.fired_rule_ids.includes(row?.id);
  return <aside className={`plot-drawer ${tab==='resources'?'plot-resources':''}`} aria-label={t("关卡剧情编排")}>
    <header className="plot-header"><div><small>{t("关卡导演台 / 剧情与规则")}</small><h2>{row && tab!=='list' && tab!=='resources'?row.name:t("剧情安排")}</h2></div><button className="icon-button" aria-label={t("关闭剧情面板")} disabled={unsaved} onClick={onClose}><X/></button></header>
    <nav className="plot-tabs">{[['list','事件与规则'],['edit','编排'],['preview','预演'],['resources','事实与变量']].map(([key,name])=><button key={key} className={tab===key?'active':''} disabled={(key==='edit'&&!row)||unsaved} onClick={()=>key==='preview'?preview():setTab(key)}>{t(name)}</button>)}</nav>
    {tab==='list'?<div className="plot-scroll"><div className="plot-list-controls"><input aria-label={t("搜索剧情")} placeholder={t("搜索事件、规则或场景")} value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label={t("剧情列表范围")} value={filter} onChange={e=>setFilter(e.target.value)}><option value="level">{t("本关卡")}</option><option value="global">{t("全局规则与事件")}</option><option value="all">{t("全部关卡")}</option></select></div><div className="plot-create"><button className="secondary" onClick={()=>create('event')}><Plus size={14}/>{t("新建事件")}</button><button className="secondary" onClick={()=>create('rule')}><Plus size={14}/>{t("新建规则")}</button></div>{shown.map(item=><button className="plot-list-card" key={item.id} onClick={()=>open(item)}><span><Flag size={14}/>{item.name}<small>{item.kind==='event'?t("时间 {0}", [item.scheduled_at]):t("条件规则")} · {item.enabled?t("已启用"):t("已停用")}</small></span><small>{plotScopeLabel(item,c)}</small><p>{conditionLabel(item.condition,c)} → {item.effects.length}{t(" 项效果")}</p></button>)}{!shown.length&&<div className="plot-empty"><Flag size={26}/><p>{filter==='global'?t("尚无全局规则或事件"):t("这个关卡尚未安排剧情")}</p><small>{t("先添加事件，再配置条件和人物变化。")}</small></div>}<p className="muted-text">{t("未绑定关卡的旧事件与规则保留在“全局”中。绑定关卡后只在该关卡预演中执行。")}</p></div>
    :tab==='resources'?<div className="plot-scroll"><StoryAuthoring onNavigationHandlers={onNavigationHandlers} local={local} announce={announce} initialId={request.resourcesId} initialKind={request.resourcesKind} allowedKinds={['fact','variable','initial','text','dialogue']} onDirtyChange={setResourceDirty} onPreview={preview}/></div>
    :tab==='edit'&&row?<form className="plot-editor" onSubmit={save}><div className="plot-scroll"><label>{t("名称")}<input aria-label={t("剧情名称")} required maxLength={200} value={row.name} onChange={e=>update({name:e.target.value})}/></label><label>{t("快速说明")}<textarea aria-label={t("剧情说明")} value={row.description || ''} onChange={e=>update({description:e.target.value})}/></label>
      <MoreDetails value={row} description={false} disabled={saving} onChange={update}/>
      <section className="plot-step"><h3><b>1</b>{row.kind==='event'?t("触发时机与场景"):t("规则作用范围")}</h3><div className="form-columns"><label>{t("所属关卡")}<select aria-label={t("剧情所属关卡")} value={row.scope?.level_id || ''} onChange={e=>update({scope:e.target.value?{level_id:e.target.value,track_id:null}:null,...(row.kind==='event'?{anchor_id:null}:{})})}><option value="">{t("全局 · 不限制关卡")}</option>{c.levels.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("场景")}<select aria-label={t("剧情场景")} disabled={!scopeLevel} value={row.scope?.track_id || ''} onChange={e=>update({scope:{...row.scope,track_id:e.target.value || null}})}><option value="">{t("整个关卡")}</option>{scopeLevel?.tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</select></label></div>
      {row.kind==='event'&&<><div className="form-columns"><label>{t("计划时间")}<input aria-label={t("剧情计划时间")} type="number" min="0" step="1" required disabled={!!row.anchor_id} value={row.scheduled_at} onChange={e=>update({scheduled_at:Number(e.target.value)})}/></label><label>{t("绑定时间锚点")}<select aria-label={t("剧情时间锚点")} disabled={!scopeLevel} value={row.anchor_id || ''} onChange={e=>update({anchor_id:e.target.value || null,...(e.target.value?{scheduled_at:scopeLevel.anchors.find(a=>a.id===e.target.value).tick}:{})})}><option value="">{t("独立时间")}</option>{scopeLevel?.anchors.map(anchor=><option key={anchor.id} value={anchor.id}>{anchor.name} · {anchor.tick}</option>)}</select></label></div><label>{t("同一时间的优先级")}<input aria-label={t("剧情优先级")} type="number" step="1" value={row.priority} onChange={e=>update({priority:Number(e.target.value)})}/></label></>}
      <label className="checkbox-label"><input type="checkbox" checked={row.enabled} onChange={e=>update({enabled:e.target.checked})}/>{t("启用")}{row.kind==='event'?t("事件"):t("规则")}</label><p className="muted-text">{row.kind==='event'?t("到达计划时间后等待条件满足。绑定锚点后，移动锚点会同步事件时间。"):t("持续检查条件，在每个预演分支内最多触发一次。")}</p></section>
      <div className="plot-step-arrow"><ArrowRight size={16}/></div><section className="plot-step"><h3><b>2</b>{t("满足哪些条件")}</h3><ConditionEditor value={row.condition} content={c} onChange={condition=>update({condition})}/></section>
      <div className="plot-step-arrow"><ArrowRight size={16}/></div><section className="plot-step"><h3><b>3</b>{t("发生哪些变化")}</h3><EffectsEditor content={c} value={row.effects} onChange={effects=>update({effects})}/>{row.kind==='rule'&&!row.effects.length&&<p className="muted-text">{t("规则至少需要一项效果。")}</p>}</section>
      {row.kind==='event'&&<details className="plot-affected"><summary>{t("标记相关人物（")}{row.affected_character_ids.length}）</summary><p className="muted-text">{t("用于关联查找；实际人物变化由执行效果决定。")}</p>{c.characters.map(actor=><label className="checkbox-label" key={actor.id}><input type="checkbox" checked={row.affected_character_ids.includes(actor.id)} onChange={e=>update({affected_character_ids:e.target.checked?[...row.affected_character_ids,actor.id]:row.affected_character_ids.filter(id=>id!==actor.id)})}/>{actor.name}</label>)}</details>}
      {!!currentActors.length&&<p className="muted-text">{t("关联人物：")}{currentActors.map(id=>c.characters.find(actor=>actor.id===id)?.name).join('、')}</p>}{error&&<p className="danger" role="alert">{tm(error)}</p>}</div><footer className="plot-footer"><span>{dirty?t("有未保存编辑"):t("已保存定义")}</span><button type="button" className="secondary" disabled={saving} onClick={discard}>{t("放弃编辑")}</button><button className="primary" disabled={!dirty||saving} type="submit">{saving?t("保存中…"):t("保存剧情")}</button></footer></form>
    :tab==='preview'?<div className="plot-scroll">{previewReady&&<><p className="muted-text">{t("预演只改变测试分支，不覆盖人物档案。当前关卡：")}{c.levels.find(item=>item.id===rehearsal.branch?.level_id)?.name || t("全局")}</p><RehearsalControls rehearsal={rehearsal}/><button className="secondary" onClick={()=>setShowVariables(v=>!v)}>{showVariables?t("收起测试变量"):t("调整测试变量")}</button>{showVariables&&<div className="plot-test-variables"><p className="muted-text">{t("覆盖分支初始变量，从起点重算。")}</p>{c.variables.map(variable=>{const value=rehearsal.branch.variable_overrides[variable.id] ?? c.initial_state.variables[variable.id] ?? variable.default;return <label key={variable.id}>{variable.name}{variable.value_type==='boolean'?<input aria-label={t("剧情测试变量 {0}", [variable.name])} type="checkbox" checked={value} onChange={e=>rehearsal.change({variable_overrides:{...rehearsal.branch.variable_overrides,[variable.id]:e.target.checked}})}/>:<input aria-label={t("剧情测试变量 {0}", [variable.name])} type={variable.value_type==='number'?'number':'text'} value={value} onChange={e=>rehearsal.change({variable_overrides:{...rehearsal.branch.variable_overrides,[variable.id]:variable.value_type==='number'?Number(e.target.value):e.target.value}})}/>}</label>;})}</div>}{rehearsal.error&&<p className="danger" role="alert">{tm(rehearsal.error)}</p>}{rehearsal.result&&!rehearsal.result.complete&&<p className="danger">{t("本轮结果不完整，请查看底部问题检查。")}</p>}{row&&<section className="plot-preview-status"><h3><CheckCircle size={16}/>{row.kind==='event'?({occurred:'事件已发生',blocked:'等待条件满足',scheduled:'尚未到计划时间',disabled:'事件已停用'}[status?.status] || t("计算中…")):ruleFired?t("规则已触发"):row.enabled?t("规则尚未触发"):t("规则已停用")}</h3>{(status || ruleStatus)&&<Reason value={(status || ruleStatus).reason}/>}<p>{plotScopeLabel(row,c)}</p></section>}<label>{t("查看人物")}<select aria-label={t("剧情预演人物")} value={actorId} onChange={e=>setActorId(e.target.value)}><option value="">{t("请选择人物")}</option>{c.characters.map(actor=><option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>{actorId&&<><section className="plot-preview-state"><h3>{t("人物当前状态")}</h3><p>{c.locations.find(location=>location.id===rehearsal.result?.state.characters[actorId]?.location_id)?.name || t("未设置地点")}</p><p>{rehearsal.result?.state.characters[actorId]?.behavior || t("未设置行为")}</p><button className="secondary" onClick={()=>{if(rehearsal.dirty){announce(t("请先保存或放弃预演分支"));return;}onWorkbench(null,null,actorId);}}>{t("打开人物对白工作台")}</button></section><RuntimeConversation rehearsal={rehearsal} characterId={actorId}/></>}</>}
      <section className="plot-preview-log"><h3>{t("本次变化")}</h3>{rehearsal.result?.log.filter(item=>!row || item.source_id===row.id).map((item,index)=><details key={index}><summary>{item.tick} · {item.name} · {item.changes.length}{t(" 项变化")}</summary><Reason value={item.reason}/>{item.changes.map((change,index)=><p key={index}>{humanPath(change.path,local.project._document)}：{humanValue(change.before,local.project._document)} → {humanValue(change.after,local.project._document)}</p>)}</details>)}{!rehearsal.result?.log.length&&<p className="muted-text">{t("当前没有已执行的变化。")}</p>}</section>{row?.scope&&<button className="secondary" disabled={rehearsal.dirty} onClick={()=>onLocate(row.scope.level_id,row.id)}>{t("定位事件所在关卡")}</button>}</div>:null}
  </aside>;
}
function newPlot(kind,level,trackId,c) {
  return {id:uid(kind),kind,name:kind==='event'?'新的剧情事件':'新的条件规则',description:'',tags:[],enabled:true,condition:{op:'always'},effects:[],scope:level?{level_id:level.id,track_id:trackId || null}:null,...(kind==='event'?{scheduled_at:level?.anchors[0]?.tick ?? c.initial_state.tick,anchor_id:level?.anchors[0]?.id || null,priority:0,affected_character_ids:[],trigger_policy:'once'}:{})};
}
