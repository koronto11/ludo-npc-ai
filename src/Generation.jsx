import { useEffect, useRef, useState } from 'react';
import { Sparkle, WarningCircle, Check, X, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { api } from './localApi';
export { ModelConnections } from './ModelSettings';
import { enabledModels, generationModel, modelPurposes } from './modelRouting';

const copy=v=>structuredClone(v);
const id=prefix=>`${prefix}-${crypto.randomUUID()}`;
const states={queued:'排队中',running:'生成中',awaiting_review:'等待审核',applied:'已写入',completed:'已完成',draft:'草稿',failed:'失败',cancelled:'已取消',interrupted:'已中断'};
const labels={name:'名称',role:'身份',goals:'长期目标',boundary:'行为底线',personality:'性格',voice:'口吻',story:'人物故事',description:'说明',uncertainties:'不确定信息',importance:'重要度',tags:'标签',nodes:'对话节点与选项',entry_node_id:'入口节点',entry_routes:'条件入口',character_id:'所属人物',body:'文本正文',text_type:'文本类型',author_id:'作者',condition:'出现条件'};
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
    events.addEventListener('update',event=>{if(!active)return;try{setJobs(JSON.parse(event.data));setError('');refresh.current().catch(()=>{});}catch{setError('生成进度暂不可读');}});
    events.onerror=()=>{if(active&&!timer)timer=setInterval(load,2500);};
    events.onopen=()=>{clearInterval(timer);timer=null;};
    return()=>{active=false;events.close();clearInterval(timer);};
  },[identifier]);
  const cancel=async job=>{try{await api(`/api/v2/projects/${identifier}/generation/${job.id}/cancel`,{method:'POST'});await local.refresh();announce('任务已取消，已完成的草稿仍保留');}catch(reason){announce(reason.message);}};
  return {jobs,error,cancel,active:jobs.some(j=>['running','queued'].includes(j.status))};
}

export function GenerateModal({local,rehearsal,actor,sessionKeys,onClose,onSubmitted,onSettings,announce,retry}) {
  const c=local.project._document.content;
  const validActor=actor&&['character','dialogue','text'].includes(actor.kind)?actor:null;
  const [kind,setKind]=useState(retry?.items?.find(i=>i.status==='failed')?.kind || validActor?.kind || 'character');
  const [purpose,setPurpose]=useState(retry?.purpose || (validActor?.kind==='character'?'story':validActor?.kind || 'character'));
  const [modelOverride,setModelOverride]=useState(retry?.profile_id && enabledModels(local.workspaceInfo).some(p=>p.id===retry.profile_id)?retry.profile_id:'');
  const profile=generationModel(local.workspaceInfo,purpose,modelOverride);
  const availableModels=enabledModels(local.workspaceInfo);
  const [existing,setExisting]=useState(!!validActor);
  const [target,setTarget]=useState(validActor?.id || '');
  const [owner,setOwner]=useState(actor?.kind==='character'?actor.id:c.characters[0]?.id || '');
  const [names,setNames]=useState(retry?.items?.filter(i=>i.status==='failed').map(i=>i.name).join('\n') || '');
  const [instructions,setInstructions]=useState(retry?.description || '按照世界规则补充人物设定和故事，使用明确的事实与条件，避免人物提前知道秘密。');
  const [scope,setScope]=useState(validActor?.kind==='character'?['story']:fields[kind]);
  const [useScenario,setUseScenario]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const rows=c[{character:'characters',dialogue:'dialogues',text:'texts'}[kind]];
  const selected=rows.find(r=>r.id===target);
  const locks=selected?.confirmed_fields || [];
  const submittedNames=names.split('\n').map(n=>n.trim()).filter(Boolean);
  const changeKind=value=>{const type=value==='story'?'character':value;setPurpose(value);setKind(type);setTarget('');setExisting(false);setScope(value==='story'?['name','story']:fields[type]);};
  const submit=async event=>{event.preventDefault();if(busy)return;setError('');setBusy(true);try{
    if(!profile)throw new Error(modelOverride?'所选模型已停用或移除，请重新选择':'先添加并启用一个模型配置');
    if(existing&&!selected)throw new Error('选择已有对象');
    if(!existing && (!submittedNames.length || submittedNames.length>10))throw new Error('填写 1–10 个名称，每行一个');
    const allowed=scope.filter(f=>!locks.includes(f));if(!allowed.length)throw new Error('至少选择一个未确认的生成字段');
    await local.flush();const doc=await local.exportDocument();
    const items=retry?retry.items.filter(i=>i.status==='failed').map(({kind,name,target_id,character_id,fields})=>({kind,name,target_id,character_id,fields})):existing?[{kind,name:selected.name,target_id:selected.id,character_id:kind==='character'?selected.id:owner||null,fields:allowed}]:submittedNames.map(name=>({kind,name,character_id:kind==='character'?null:owner||null,fields:allowed}));
    const body={request_id:id('generation'),expected_revision:doc.revision,profile_id:profile.id,purpose,api_key:sessionKeys[profile.id] || '',instructions,items};
    if(useScenario&&rehearsal.branch) {const b=rehearsal.branch;body.scenario={expected_content_revision:doc.content_revision,at_tick:b.at_tick,location_id:b.location_id,variable_overrides:b.variable_overrides,choices:b.choices,scene_changes:b.scene_changes||[]};}
    const result=await api(`/api/v2/projects/${doc.project_id}/generate`,{method:'POST',body});await local.refresh();onSubmitted(result);announce('生成任务已提交，完成后进入草稿审核');onClose();
  }catch(reason){setError(reason.message);}finally{setBusy(false);}};
  return <Modal title="生成文本草稿" subtitle="生成结果先保存为草稿，审核接受后才进入正式工程。" onClose={onClose} wide><form onSubmit={submit}>
    <div className="generation-connection"><Sparkle size={18}/><div><label className="generation-model-choice">本次使用的模型<select aria-label="本次生成模型" value={modelOverride} onChange={e=>setModelOverride(e.target.value)}><option value="">按{modelPurposes[purpose]}默认分配{generationModel(local.workspaceInfo,purpose,'')?` · ${generationModel(local.workspaceInfo,purpose,'').name}`:''}</option>{modelOverride&&!availableModels.some(p=>p.id===modelOverride)&&<option value={modelOverride}>原配置已停用或移除</option>}{availableModels.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label><small>{profile?.model || '先添加并启用模型配置'} · 每项输出上限 {profile?.max_tokens || '—'} · 最多 2 项并发</small>{profile&&<small className="generation-endpoint">{profile.endpoint} · {profile.mode==='local'?'本机':'远程'}{profile.mode==='remote'&&!sessionKeys[profile.id]?' · 本页尚未填写此配置密钥':''}</small>}</div><button type="button" className="secondary" onClick={onSettings}>管理配置</button></div>
    {!retry&&<><div className="form-columns"><label className="form-field">生成内容<select aria-label="生成内容类型" value={purpose} onChange={e=>changeKind(e.target.value)}><option value="character">角色设定</option><option value="story">人物故事</option><option value="dialogue">对话节点与玩家选项</option><option value="text">非对话文本</option></select></label><label className="form-field">写入目标<select aria-label="生成写入目标" value={existing?'update':'create'} onChange={e=>setExisting(e.target.value==='update')}><option value="create">生成新对象</option><option value="update">为已有对象生成候选修改</option></select></label></div>
    {existing?<label className="form-field">已有对象<select aria-label="生成目标对象" value={target} onChange={e=>setTarget(e.target.value)}><option value="">请选择</option>{rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>:<label className="form-field">新对象名称 · 每行一个，最多 10 项<textarea aria-label="批量生成名称" value={names} onChange={e=>setNames(e.target.value)} placeholder="例如：驿站账房\n商队领队" rows="3"/></label>}
    {kind!=='character'&&<label className="form-field">所属人物 / 认知上下文<select aria-label="生成人物上下文" value={owner} onChange={e=>setOwner(e.target.value)}><option value="">作者旁白 / 不指定人物</option>{c.characters.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
    <div className="generation-field-options"><span>允许生成的字段</span>{fields[kind].map(field=><label key={field} className={locks.includes(field)?'protected':''}><input type="checkbox" checked={scope.includes(field)&&!locks.includes(field)} disabled={locks.includes(field)||(!existing&&field==='name')} onChange={e=>setScope(v=>e.target.checked?[...v,field]:v.filter(f=>f!==field))}/>{labels[field] || field}{locks.includes(field)&&<small>已确认</small>}</label>)}</div></>}
    {retry&&<p>仅重试 {retry.items.filter(i=>i.status==='failed').map(i=>i.name).join('、')}，不重新生成已完成草稿。使用当前上下文。</p>}
    <label className="form-field">创作要求<textarea aria-label="生成创作要求" required value={instructions} onChange={e=>setInstructions(e.target.value)} rows="4"/></label><label className="checkbox-label"><input type="checkbox" checked={useScenario} onChange={e=>setUseScenario(e.target.checked)}/>使用当前预演的时间、场景和人物认知</label>
    <div className="world-reference"><strong>{c.world.name}</strong><p>{c.world.premise}</p>{c.world.rules.map((rule,i)=><small key={i}>{rule}</small>)}</div>
    {error&&<p role="alert" className="danger">{error}</p>}<div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>取消</button><button className="primary" disabled={busy||!local.file.path} type="submit">{busy?'提交任务…':retry?'重试失败项':'提交生成任务'}</button></div>{!local.file.path&&<p className="danger">先将工程保存到本地文件，再生成草稿。</p>}
  </form></Modal>;
}

export function DraftReviewWorkspace({local,generation,announce,onGenerate,onRetry,onDirtyChange}) {
  const document=local.project._document;
  const drafts=document?.content.drafts || [];
  const [selected,setSelected]=useState('');
  const [view,setView]=useState(null);
  const [values,setValues]=useState({});
  const [chosen,setChosen]=useState({});
  const [filter,setFilter]=useState('pending');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [edited,setEdited]=useState(false);
  const loaded=useRef('');
  useEffect(()=>{onDirtyChange?.(edited);return()=>onDirtyChange?.(false);},[edited,onDirtyChange]);
  useEffect(()=>{const handler=e=>{if(edited){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[edited]);
  const visible=drafts.filter(d=>filter==='all'||d.status===filter);
  useEffect(()=>{if(!visible.some(d=>d.id===selected)){setSelected(visible[0]?.id || '');}},[document?.revision,filter,selected]);
  useEffect(()=>{
    if(!selected){setView(null);return;}let active=true;
    api(`/api/v2/projects/${document.project_id}/drafts/${selected}/review`).then(result=>{if(!active)return;setView(result);if(loaded.current!==selected){loaded.current=selected;setValues(Object.fromEntries(result.fields.map(f=>[f.field,typeof f.candidate==='string'?f.candidate:JSON.stringify(f.candidate,null,2)])));setChosen(Object.fromEntries(result.fields.map(f=>[f.field,!f.protected])));setError('');}}).catch(reason=>{if(active)setError(reason.message);});return()=>{active=false;};
  },[document?.project_id,document?.revision,selected]);
  const command=async action=>{if(!view || busy)return;setBusy(true);setError('');try{
    let cmd={type:'review_draft',draft_id:selected,action,expected_author_hash:view.author_hash};
    if(action==='accept') {cmd.values=Object.fromEntries(view.fields.filter(f=>chosen[f.field]&&!f.protected).map(f=>[f.field,typeof f.candidate==='string'?values[f.field]:JSON.parse(values[f.field])]));if(!Object.keys(cmd.values).length)throw new Error('选择至少一个未确认字段');}
    await local.transact([cmd]);setEdited(false);loaded.current='';announce(action==='accept'?'已选择的字段写入正式工程，其余候选未应用':'草稿已拒绝，正式内容保持原样');
  }catch(reason){setError(reason instanceof SyntaxError?'数组或结构字段的 JSON 格式有误':reason.message);}finally{setBusy(false);}};
  const rebase=async()=>{setBusy(true);setError('');try{await local.transact([{type:'rebase_draft',draft_id:selected,expected_author_hash:view.author_hash}]);announce('已按当前设定更新审核基准，请再次核对候选字段');}catch(reason){setError(reason.message);}finally{setBusy(false);}};
  const bulk=async()=>{setBusy(true);setError('');try{const pending=drafts.filter(d=>d.status==='pending');if(!pending.length)throw new Error('没有待审核草稿');const reviews=await Promise.all(pending.map(d=>api(`/api/v2/projects/${document.project_id}/drafts/${d.id}/review`)));if(reviews.some(r=>r.stale))throw new Error('部分草稿依据已过期，请逐份重新比较后再接受');const commands=reviews.map(r=>({type:'review_draft',draft_id:r.draft.id,action:'accept',expected_author_hash:r.author_hash,values:Object.fromEntries(r.fields.filter(f=>!f.protected).map(f=>[f.field,f.candidate]))}));await local.transact(commands);loaded.current='';announce(`已审核并接受 ${commands.length} 份草稿`);}catch(reason){setError(reason.message);}finally{setBusy(false);}};
  const display=value=>value===null||value===undefined?'未设置':typeof value==='string'?value:JSON.stringify(value,null,2);
  const saveCandidate=async()=>{setBusy(true);setError('');try{const patch=Object.fromEntries(view.fields.map(f=>[f.field,typeof f.candidate==='string'?values[f.field]:JSON.parse(values[f.field])]));await local.transact([{type:'put_draft',draft:{...view.draft,patch}}]);setEdited(false);announce('候选修改已保存，正式工程尚未应用');}catch(reason){setError(reason instanceof SyntaxError?'结构字段的 JSON 格式有误':reason.message);}finally{setBusy(false);}};
  return <div className="draft-workspace"><div className="workspace-heading"><div><small>生成任务 / 字段差异</small><h1>草稿审核</h1><p>候选内容独立保存。已确认字段受保护，过期草稿先重新比较。</p></div><button className="primary" onClick={onGenerate}><Sparkle size={14}/>生成文本草稿</button></div>
    <div className="generation-task-strip">{generation.jobs.slice().reverse().map(job=><article className={`generation-job job-${job.status}`} key={job.id}><div><strong>{job.name}</strong><span>{states[job.status] || job.status} · {job.finished || 0}/{job.total || 0}</span></div><small title={job.model_endpoint}>{job.profile_name || job.model || "历史导入"}{job.profile_name && ` · ${job.model}`} {job.purpose && ` / ${modelPurposes[job.purpose]}`}</small><small>{job.detail}</small>{job.total>0&&<progress max={job.total} value={job.finished}/>}<div className="job-actions">{['queued','running'].includes(job.status)&&<button className="subtle-button" onClick={()=>generation.cancel(job)}>取消任务</button>}{job.items?.some(i=>i.status==='failed')&&<button className="subtle-button" onClick={()=>onRetry(job)}><ArrowCounterClockwise size={12}/>重试失败项</button>}{job.usage?.total_tokens!==undefined&&<small>返回用量 {job.usage.total_tokens} token</small>}</div>{job.failures?.map((message,i)=><p key={i} className="danger">{message}</p>)}{job.storage_error&&<p className="danger">{job.storage_error}</p>}</article>)}{!generation.jobs.length&&<p className="muted-text">尚无生成任务。生成前先确认世界底稿与模型连接。</p>}</div>
    <div className="draft-controls"><label>草稿范围<select aria-label="草稿范围" value={filter} disabled={edited} onChange={e=>setFilter(e.target.value)}><option value="pending">待审核</option><option value="accepted">已接受</option><option value="rejected">已拒绝</option><option value="all">全部草稿</option></select></label><button className="secondary" disabled={busy||edited} onClick={bulk}>接受全部待审核草稿</button><small>批量接受已保存候选；逐份编辑请在下方提交。</small></div>
    {error&&<p role="alert" className="danger">{error}</p>}{generation.error&&<p className="danger">{generation.error}</p>}
    <div className="draft-review-layout"><nav className="draft-list">{visible.map(d=><button className={selected===d.id?'active':''} key={d.id} onClick={()=>{if(edited){announce('先保存候选修改或放弃编辑');return;}loaded.current='';setSelected(d.id);}}><strong>{d.name}</strong><small>{d.operation==='create'?'新建对象':'修改已有对象'} · {states[d.status] || {pending:'待审核',accepted:'已接受',rejected:'已拒绝'}[d.status]}</small></button>)}</nav>
    {!view?<div className="empty-state">{selected?'正在读取审核差异…':'当前没有此类草稿'}</div>:<section className="draft-diff"><div className="draft-heading"><h2>{view.draft.name}</h2><small>{view.draft.model} · 依据内容 v{view.draft.base_content_revision}</small></div>
    {view.stale&&view.status==='pending'&&<div className="draft-stale"><WarningCircle size={16}/><div><strong>生成依据已变化</strong><p>先查看当前值与原始值，再更新基准；系统不会覆盖后来的人工修改。</p></div><button className="secondary" disabled={busy} onClick={rebase}>重新比较并更新基准</button></div>}
    <div className="draft-issues">{view.issues.map((issue,i)=><p key={i}><WarningCircle size={13}/>{issue}</p>)}</div>
    <div className="diff-header"><span>接受 / 字段</span><span>正式工程中的当前值</span><span>候选值 · 可修改</span></div>
    {view.fields.map(f=><div key={f.field} className={`diff-row ${f.protected?'protected':''} ${f.conflict?'conflict':''}`}><label><input type="checkbox" aria-label={`接受字段 ${labels[f.field] || f.field}`} disabled={f.protected||view.status!=='pending'} checked={!!chosen[f.field]&&!f.protected} onChange={e=>setChosen(v=>({...v,[f.field]:e.target.checked}))}/><strong>{labels[f.field] || f.field}</strong>{f.protected&&<small>已确认 · 保护</small>}{f.conflict&&<small>人工修改冲突</small>}</label><div><pre>{display(f.current)}</pre>{f.conflict&&<details><summary>生成时的值</summary><pre>{display(f.base)}</pre></details>}</div><textarea aria-label={`候选字段 ${labels[f.field] || f.field}`} value={values[f.field]??display(f.candidate)} disabled={f.protected||view.status!=='pending'} rows={['story','nodes','body'].includes(f.field)?6:3} onChange={e=>{setValues(v=>({...v,[f.field]:e.target.value}));setEdited(true);}}/></div>)}
    {edited&&<div className="draft-edit-status"><span>候选有未保存修改</span><button className="secondary" onClick={saveCandidate} disabled={busy}>保存候选修改</button><button className="subtle-button" onClick={()=>{setValues(Object.fromEntries(view.fields.map(f=>[f.field,typeof f.candidate==='string'?f.candidate:JSON.stringify(f.candidate,null,2)])));setEdited(false);}}>放弃候选编辑</button></div>}
    {view.status==='pending'?<div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>command('reject')}><X size={14}/>拒绝草稿</button><button className="primary" disabled={busy||view.stale} onClick={()=>command('accept')}><Check size={14}/>接受选中字段</button></div>:<p className="muted-text">这份草稿已经{view.status==='accepted'?'接受':'拒绝'}，保留作生成记录。</p>}
    </section>}</div>
  </div>;
}
