import {localizeLabels} from './i18n.js';
import { t, tm, useI18n } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { Sparkle, ArrowCounterClockwise, User } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { api } from './localApi';
export { ModelConnections } from './ModelSettings';
import { enabledModels, generationModel, modelPurposes, hasModelKey } from './modelRouting';
import { retryGenerationItems, sceneTextLengths } from './sceneGeneration';
import './sceneGeneration.css';

const copy=v=>structuredClone(v);
const id=prefix=>`${prefix}-${crypto.randomUUID()}`;
const states=localizeLabels({queued:'排队中',running:'生成中',awaiting_review:'等待审核',applied:'已写入',completed:'已完成',draft:'草稿',failed:'失败',cancelled:'已取消',interrupted:'已中断'});
const labels=localizeLabels({name:'名称',role:'身份',goals:'长期目标',boundary:'行为底线',personality:'性格',voice:'口吻',story:'人物故事',description:'说明',uncertainties:'不确定信息',importance:'重要度',tags:'标签',nodes:'对话节点与选项',entry_node_id:'入口节点',entry_routes:'条件入口',character_id:'所属人物',body:'文本正文',text_type:'文本类型',author_id:'作者',condition:'出现条件'});
const fields={character:['name','role','goals','boundary','personality','voice','story','uncertainties','importance','tags'],dialogue:['name','description','character_id','entry_node_id','entry_routes','nodes'],text:['name','body','text_type','author_id','condition','description']};

export function useGenerationJobs(local,announce) {
  const [jobs,setJobs]=useState([]);
  const [error,setError]=useState('');
  const identifier=local.project._document?.project_id;
  const refresh=useRef(local.refresh); refresh.current=local.refresh;
  useEffect(()=>{
    if(!identifier)return;
    let active=true, timer, events;
    const load=async()=>{try {const value=await api(`/api/v2/projects/${identifier}/generation`);if(active){setJobs(value);setError('');await refresh.current();}}catch(reason){if(active){setError(reason.message);if([401,404].includes(reason.status)){active=false;events?.close();clearInterval(timer);}}}};
    setJobs([]);load();
    events=new EventSource(`/api/v2/projects/${identifier}/generation/events`);
    events.addEventListener('update',event=>{if(!active)return;try{setJobs(JSON.parse(event.data));setError('');refresh.current().catch(()=>{});}catch{setError(t("生成进度暂不可读"));}});
    events.onerror=()=>{if(active&&!timer)timer=setInterval(load,2500);};
    events.onopen=()=>{clearInterval(timer);timer=null;};
    return()=>{active=false;events.close();clearInterval(timer);};
  },[identifier]);
  const cancel=async job=>{try{await api(`/api/v2/projects/${identifier}/generation/${job.id}/cancel`,{method:'POST'});await local.refresh();announce(t("任务已取消，已完成的草稿仍保留"));}catch(reason){announce(reason.message);}};
  return {jobs,error,cancel,active:jobs.some(j=>['running','queued'].includes(j.status))};
}

export function GenerateModal({local,rehearsal,actor,sessionKeys,onClose,onSubmitted,onSettings,announce,retry,storyOnly=false}) {
  useI18n();
  const c=local.project._document.content;
  const validActor=actor&&(storyOnly?actor.kind==='character':['character','dialogue','text'].includes(actor.kind))?actor:null;
  const [kind,setKind]=useState(retry?.items?.find(i=>i.status==='failed')?.kind || validActor?.kind || 'character');
  const [purpose,setPurpose]=useState(retry?.purpose || (validActor?.kind==='character'?'story':validActor?.kind || 'character'));
  const [modelOverride,setModelOverride]=useState(retry?.profile_id && enabledModels(local.workspaceInfo).some(p=>p.id===retry.profile_id)?retry.profile_id:'');
  const profile=generationModel(local.workspaceInfo,purpose,modelOverride);
  const availableModels=enabledModels(local.workspaceInfo);
  const [existing,setExisting]=useState(!!validActor);
  const [target,setTarget]=useState(validActor?.id || '');
  const [owner,setOwner]=useState(actor?.kind==='character'?actor.id:c.characters[0]?.id || '');
  const [names,setNames]=useState(retry?.items?.filter(i=>i.status==='failed').map(i=>i.name).join('\n') || '');
  const [instructions,setInstructions]=useState(retry?.description || (storyOnly?'依据世界底稿和已有的人物设定，补充这个人物的过往经历、当前动机与故事线索，保持已知事实一致。':'按照世界规则补充人物设定和故事，使用明确的事实与条件，避免人物提前知道秘密。'));
  const [scope,setScope]=useState(validActor?.kind==='character'?['story']:fields[kind]);
  const [useScenario,setUseScenario]=useState(!storyOnly);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const rows=c[{character:'characters',dialogue:'dialogues',text:'texts'}[kind]];
  const selected=rows.find(r=>r.id===target);
  const locks=selected?.confirmed_fields || [];
  const submittedNames=names.split('\n').map(n=>n.trim()).filter(Boolean);
  const changeKind=value=>{const type=value==='story'?'character':value;setPurpose(value);setKind(type);setTarget('');setExisting(false);setScope(value==='story'?['name','story']:fields[type]);};
  const submit=async event=>{event.preventDefault();if(busy)return;setError('');setBusy(true);try{
    if(storyOnly && !validActor)throw new Error(t("请从具体人物的卡片或档案发起故事生成"));
    if(!profile)throw new Error(modelOverride?t("所选模型已停用或移除，请重新选择"):t("先添加并启用一个模型配置"));
    if(existing&&!selected)throw new Error(t("选择已有对象"));
    if(!existing && (!submittedNames.length || submittedNames.length>10))throw new Error(t("填写 1–10 个名称，每行一个"));
    const allowed=(storyOnly?['story']:scope).filter(f=>!locks.includes(f));if(!allowed.length)throw new Error(t("至少选择一个未确认的生成字段"));
    await local.flush();const doc=await local.exportDocument();
    const items=retry?retryGenerationItems(retry):existing?[{kind,name:selected.name,target_id:selected.id,character_id:kind==='character'?selected.id:owner||null,fields:allowed}]:submittedNames.map(name=>({kind,name,character_id:kind==='character'?null:owner||null,fields:allowed}));
    const body={request_id:id('generation'),expected_revision:doc.revision,profile_id:profile.id,purpose,api_key:sessionKeys[profile.id] || '',instructions,items};
    if(useScenario&&rehearsal.branch) {const b=rehearsal.branch;body.scenario={expected_content_revision:doc.content_revision,at_tick:b.at_tick,level_id:b.level_id || null,location_id:b.location_id,variable_overrides:b.variable_overrides,choices:b.choices,scene_changes:b.scene_changes||[]};}
    const result=await api(`/api/v2/projects/${doc.project_id}/generate`,{method:'POST',body});await local.refresh();onClose();onSubmitted(result);announce(t("生成任务已提交，完成后进入本批草稿审核"));
  }catch(reason){setError(reason.message);}finally{setBusy(false);}};
  return <Modal title={storyOnly?t("为 {0} 生成人物故事", [selected?.name || actor?.name || t("人物")]):t("生成文本草稿")} subtitle={storyOnly?t("填写创作要求，生成故事草稿；审核采用后更新这个人物的档案。"):t("生成结果先保存为草稿，审核接受后才进入正式工程。")} onClose={onClose} wide className={storyOnly?'story-generation-modal':''}><form onSubmit={submit}>
    <div className="generation-connection"><Sparkle size={18}/><div><label className="generation-model-choice">{t("本次使用的模型")}<select aria-label={t("本次生成模型")} value={modelOverride} onChange={e=>setModelOverride(e.target.value)}><option value="">{t("按")}{t(modelPurposes[purpose])}{t("默认分配")}{generationModel(local.workspaceInfo,purpose,'')?` · ${generationModel(local.workspaceInfo,purpose,'').name}`:''}</option>{modelOverride&&!availableModels.some(p=>p.id===modelOverride)&&<option value={modelOverride}>{t("原配置已停用或移除")}</option>}{availableModels.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label><small>{profile?.model || t("先添加并启用模型配置")}{t(" · 每项输出上限 ")}{profile?.max_tokens || '—'}{t(" · 最多 2 项并发")}</small>{profile&&<small className="generation-endpoint">{profile.endpoint} · {profile.mode==='local'?t("本机"):t("远程")}{profile.mode==='remote'&&!hasModelKey(local.workspaceInfo,profile,sessionKeys)?t(" · 尚未填写或保存此配置密钥"):''}</small>}</div><button type="button" className="secondary" onClick={onSettings}>{t("管理配置")}</button></div>
    {storyOnly&&<div className="story-generation-target"><User size={25}/><div><strong>{selected?.name || actor?.name}</strong><small>{selected?.role || t("未填写身份")}{t(" · 人物故事")}</small><small>{t("采用后更新这个人物的故事，世界规则与现有设定作为创作依据。")}</small></div></div>}
    {storyOnly&&locks.includes('story')&&<p className="story-generation-locked" role="status">{t("人物故事已确认并受保护，当前不能生成替换候选。")}</p>}
    {!retry&&!storyOnly&&<><div className="form-columns"><label className="form-field">{t("生成内容")}<select aria-label={t("生成内容类型")} value={purpose} onChange={e=>changeKind(e.target.value)}><option value="character">{t("角色设定")}</option><option value="story">{t("人物故事")}</option><option value="dialogue">{t("对话节点与玩家选项")}</option><option value="text">{t("非对话文本")}</option></select></label><label className="form-field">{t("写入目标")}<select aria-label={t("生成写入目标")} value={existing?'update':'create'} onChange={e=>setExisting(e.target.value==='update')}><option value="create">{t("生成新对象")}</option><option value="update">{t("为已有对象生成候选修改")}</option></select></label></div>
    {existing?<label className="form-field">{t("已有对象")}<select aria-label={t("生成目标对象")} value={target} onChange={e=>setTarget(e.target.value)}><option value="">{t("请选择")}</option>{rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>:<label className="form-field">{t("新对象名称 · 每行一个，最多 10 项")}<textarea aria-label={t("批量生成名称")} value={names} onChange={e=>setNames(e.target.value)} placeholder={t("例如：驿站账房\\n商队领队")} rows="3"/></label>}
    {kind!=='character'&&<label className="form-field">{t("所属人物 / 认知上下文")}<select aria-label={t("生成人物上下文")} value={owner} onChange={e=>setOwner(e.target.value)}><option value="">{t("作者旁白 / 不指定人物")}</option>{c.characters.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
    <div className="generation-field-options"><span>{t("允许生成的字段")}</span>{fields[kind].map(field=><label key={field} className={locks.includes(field)?'protected':''}><input type="checkbox" checked={scope.includes(field)&&!locks.includes(field)} disabled={locks.includes(field)||(!existing&&field==='name')} onChange={e=>setScope(v=>e.target.checked?[...v,field]:v.filter(f=>f!==field))}/>{labels[field] || field}{locks.includes(field)&&<small>{t("已确认")}</small>}</label>)}</div></>}
    {retry&&<p>{t("仅重试 ")}{retry.items.filter(i=>i.status==='failed').map(i=>i.name).join('、')}{t("，不重新生成已完成草稿。使用当前上下文。")}</p>}
    {retry&&retry.items.filter(i=>i.status==='failed'&&i.output_limits).map(item=><p className="crowd-output-summary" key={item.name}>{item.output_limits.card_count?t("{0}：{1} 张对白卡片，每张最多 {2} 字符；重试保留原设置。",[item.name,item.output_limits.card_count,sceneTextLengths[item.output_limits.text_length]]):t("{0}：一份文本，最多 {1} 字符；重试保留原设置。",[item.name,sceneTextLengths[item.output_limits.text_length]])}</p>)}
    <label className="form-field">{t("创作要求")}<textarea aria-label={t("生成创作要求")} required value={instructions} onChange={e=>setInstructions(e.target.value)} rows="4"/></label>
    {storyOnly?<details className="story-generation-context"><summary>{t("世界依据与更多设置")}</summary><div className="world-reference"><strong>{c.world.name}</strong><p>{c.world.premise}</p>{c.world.rules.map((rule,i)=><small key={i}>{rule}</small>)}</div><label className="checkbox-label"><input type="checkbox" checked={useScenario} onChange={e=>setUseScenario(e.target.checked)}/>{t("使用当前预演的时间、场景和人物认知")}</label></details>:<><label className="checkbox-label"><input type="checkbox" checked={useScenario} onChange={e=>setUseScenario(e.target.checked)}/>{t("使用当前预演的时间、场景和人物认知")}</label><div className="world-reference"><strong>{c.world.name}</strong><p>{c.world.premise}</p>{c.world.rules.map((rule,i)=><small key={i}>{rule}</small>)}</div></>}
    {error&&<p role="alert" className="danger">{tm(error)}</p>}<div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>{t("取消")}</button><button className="primary" disabled={busy||!local.file.path||(storyOnly&&locks.includes('story'))} type="submit">{busy?t("提交任务…"):retry?t("重试失败项"):storyOnly?t("生成人物故事草稿"):t("提交生成任务")}</button></div>{!local.file.path&&<p className="danger">{t("先将工程保存到本地文件，再生成草稿。")}</p>}
  </form></Modal>;
}

export { DraftReviewWorkspace } from './DraftReview';
