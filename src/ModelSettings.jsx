import { t, tm, useI18n } from './i18n';
import { useEffect, useState } from 'react';
import { Plus, Copy, Trash, ArrowCounterClockwise, Play, MagnifyingGlass } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { api } from './localApi';
import { enabledModels, modelPurposes, hasSavedKey } from './modelRouting';

const clone = value=>structuredClone(value);
const blank = ()=>({id:`profile-${crypto.randomUUID()}`,name:'',endpoint:'',model:'',mode:'remote',protocol:'chat_completions',stream:false,json_mode:false,timeout_seconds:90,max_tokens:2048,retry_limit:0,enabled:true,archived:false,last_test:null});
const signature = value=>JSON.stringify(value);
const connectionSignature = p=>signature(Object.fromEntries(Object.entries(p).filter(([k])=>!['id','name','enabled','archived','last_test'].includes(k))));
const testLabel = profile=>profile.last_test?.status==='success'?'上次文本测试成功':profile.last_test?.status==='failed'?'上次测试失败':'尚未测试';

function DefaultsPanel({info,local,announce,onDirty}) {
  useI18n();
  const saved={active_profile_id:info?.active_profile_id || null,purpose_defaults:info?.purpose_defaults || {}};
  const [value,setValue]=useState(clone(saved));
  const [baseline,setBaseline]=useState(signature(saved));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const dirty=signature(value)!==baseline;
  const enabled=enabledModels(info);
  const savedHash=signature(saved);
  useEffect(()=>{if(!dirty){setValue(clone(saved));setBaseline(savedHash);}},[savedHash]);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  const save=async()=>{setBusy(true);setError('');try{const result=await api('/api/workspace/model-defaults',{method:'PUT',body:value});setValue({active_profile_id:result.active_profile_id,purpose_defaults:result.purpose_defaults});setBaseline(signature({active_profile_id:result.active_profile_id,purpose_defaults:result.purpose_defaults}));await local.refresh();announce(t("默认模型与用途分配已保存"));}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <section className="model-defaults"><h3>{t("按创作用途选择模型")}</h3><p>{t("生成窗口会自动带入对应模型，也可以只为本次任务切换。")}</p>
    <label className="form-field">{t("通用默认模型")}<select aria-label={t("通用默认模型")} value={value.active_profile_id || ''} disabled={busy||!enabled.length} onChange={e=>setValue(v=>({...v,active_profile_id:e.target.value||null}))}>{!enabled.length&&<option value="">{t("先启用一个模型配置")}</option>}{enabled.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label>
    <div className="model-purpose-grid">{Object.entries(modelPurposes).map(([purpose,label])=><label className="form-field" key={purpose}>{label}<select aria-label={t("{0}默认模型", [label])} disabled={busy} value={value.purpose_defaults[purpose]||''} onChange={e=>setValue(v=>{const purposes={...v.purpose_defaults};if(e.target.value)purposes[purpose]=e.target.value;else delete purposes[purpose];return {...v,purpose_defaults:purposes};})}><option value="">{t("跟随通用默认模型")}</option>{enabled.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label>)}</div>
    <div className="model-policy-note">{t("停用或移除的配置会退出默认分配。运行中的任务继续使用提交时的配置，历史记录保留原模型。")}</div>
    {error&&<p role="alert" className="danger">{tm(error)}</p>}<div className="model-editor-actions"><button className="secondary" disabled={!dirty||busy} onClick={()=>{setValue(clone(saved));setBaseline(savedHash);setError('');}}>{t("放弃分配修改")}</button><button className="primary" disabled={!dirty||busy} onClick={save}>{t("保存用途分配")}</button></div>
  </section>;
}

export function ModelConnections({local,sessionKeys,setSessionKeys,onClose,announce}) {
  useI18n();
  const info=local.workspaceInfo;
  const rows=info?.model_profiles || [];
  const initial=rows.find(p=>p.id===info?.active_profile_id&&!p.archived)||rows.find(p=>!p.archived)||blank();
  const [profile,setProfile]=useState(()=>clone(initial));
  const [baseline,setBaseline]=useState(()=>signature(initial));
  const [key,setKey]=useState(sessionKeys[initial.id]||'');
  const canRemember=info?.credentials?.supported===true;
  const [remember,setRemember]=useState(canRemember),[rememberBaseline,setRememberBaseline]=useState(canRemember);
  const [tab,setTab]=useState('config'),[query,setQuery]=useState(''),[archived,setArchived]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[removing,setRemoving]=useState(false),[defaultsDirty,setDefaultsDirty]=useState(false);
  const dirty=signature(profile)!==baseline || key!==(sessionKeys[profile.id]||'') || remember!==rememberBaseline;
  const savedKey=hasSavedKey(info,profile);
  const saved=rows.find(p=>p.id===profile.id);
  const enabled=enabledModels(info);
  const visible=rows.filter(p=>!!p.archived===archived&&`${p.name} ${p.model} ${p.endpoint}`.toLowerCase().includes(query.toLowerCase()));
  const load=p=>{setProfile(clone(p));setBaseline(signature(p));setKey(sessionKeys[p.id]||'');setRemember(canRemember);setRememberBaseline(canRemember);setMessage('');setError('');setRemoving(false);};
  const guard=()=>{if(dirty||defaultsDirty){setError(t("请先保存或放弃当前修改"));return false;}return !busy;};
  const close=()=>{if(guard())onClose();};
  useEffect(()=>{const handler=e=>{if(dirty||defaultsDirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty,defaultsDirty]);
  const change=patch=>{if(['endpoint','mode','protocol'].some(field=>field in patch&&patch[field]!==profile[field]))setKey('');setProfile(p=>({...p,...patch}));setMessage('');setError('');};
  const save=async event=>{event.preventDefault();setBusy(true);setError('');let parametersSaved=false;try{let result=await api('/api/workspace/model-profiles',{method:'PUT',body:profile});parametersSaved=true;
    if(remember&&key)result=await api(`/api/workspace/model-profiles/${profile.id}/credential`,{method:'PUT',body:{api_key:key,endpoint:profile.endpoint}});
    else if(!remember&&result.credentials?.saved?.[profile.id])result=await api(`/api/workspace/model-profiles/${profile.id}/credential`,{method:'DELETE'});
    setSessionKeys(v=>{const next={...v};if(remember)delete next[profile.id];else next[profile.id]=key;return next;});
    if(remember)setKey('');setRememberBaseline(remember);const current=result.model_profiles.find(p=>p.id===profile.id);setProfile(clone(current));setBaseline(signature(current));await local.refresh();setMessage(remember?(result.credentials?.saved?.[profile.id]?'配置与本机加密密钥已保存，下次打开可直接使用。':'配置已保存；尚未填写密钥。'):'配置已保存；密钥仅用于本次页面会话。');announce(t("模型配置已保存"));
    }catch(e){setError(`${parametersSaved?'模型参数已保存，密钥操作未完成：':''}${e.message}`);await local.refresh().catch(()=>{});}finally{setBusy(false);}};
  const clearKey=async()=>{setBusy(true);setError('');try{await api(`/api/workspace/model-profiles/${profile.id}/credential`,{method:'DELETE'});setKey('');setSessionKeys(v=>{const next={...v};delete next[profile.id];return next;});await local.refresh();setMessage('已清除这套配置的本机密钥，需要使用时重新填写。');}catch(e){setError(e.message);}finally{setBusy(false);}};
  const toggle=async p=>{if(!guard())return;setBusy(true);setError('');try{const result=await api('/api/workspace/model-profiles',{method:'PUT',body:{...p,enabled:p.enabled===false}});await local.refresh();if(profile.id===p.id)load(result.model_profiles.find(r=>r.id===p.id));announce(p.enabled===false?t("模型配置已启用"):t("模型配置已停用，默认分配已更新"));}catch(e){setError(e.message);}finally{setBusy(false);}};
  const remove=async()=>{setBusy(true);setError('');try{const result=await api(`/api/workspace/model-profiles/${profile.id}`,{method:'DELETE'});setSessionKeys(v=>{const next={...v};delete next[profile.id];return next;});await local.refresh();load(result.model_profiles.find(p=>!p.archived)||blank());setArchived(false);announce(t("配置已移入已移除列表，可恢复；历史任务保持原记录"));}catch(e){setError(e.message);}finally{setBusy(false);}};
  const restore=async p=>{if(!guard())return;setBusy(true);setError('');try{const result=await api(`/api/workspace/model-profiles/${p.id}/restore`,{method:'POST'});await local.refresh();load(result.model_profiles.find(r=>r.id===p.id));setArchived(false);announce(t("模型配置已恢复并启用"));}catch(e){setError(e.message);}finally{setBusy(false);}};
  const test=async()=>{setBusy(true);setError('');setMessage('正在发送一次小文本请求…');const sameConnection=saved&&connectionSignature(saved)===connectionSignature(profile);try{const result=await api('/api/models/test',{method:'POST',body:{profile,api_key:key}});const refreshed=await local.refresh();if(saved&&!dirty){const updated=refreshed.model_profiles.find(p=>p.id===profile.id);setProfile(clone(updated));setBaseline(signature(updated));}setMessage(`${result.message}${result.usage.total_tokens!==undefined?` · 返回用量 ${result.usage.total_tokens} token`:' · 未返回用量'}${!sameConnection?'；新配置或未保存连接参数的结果不写入测试记录。':''}`);}catch(e){setMessage('');setError(e.message);await local.refresh().catch(()=>{});}finally{setBusy(false);}};
  const select=p=>{if(guard())load(p);};
  return <Modal title={t("模型配置管理")} subtitle={t("多套配置可同时启用。默认分配按创作用途生效，生成时可临时切换。")} onClose={close} className="model-manager">
    <div className="model-manager-tabs"><button className={tab==='config'?'active':''} onClick={()=>{if(guard())setTab('config');}}>{t("模型配置 ")}<small>{rows.filter(p=>!p.archived).length}</small></button><button className={tab==='defaults'?'active':''} onClick={()=>{if(guard())setTab('defaults');}}>{t("用途与默认模型")}</button><span>{enabled.length}{t(" 个已启用")}</span></div>
    {tab==='defaults'?<DefaultsPanel info={info} local={local} announce={announce} onDirty={setDefaultsDirty}/>:<div className="model-manager-layout">
      <aside className="model-config-list"><button className="primary" disabled={busy} onClick={()=>{if(guard()){load(blank());setArchived(false);}}}><Plus size={15}/>{t("添加模型配置")}</button><label className="model-search"><MagnifyingGlass size={15}/><input aria-label={t("搜索模型配置")} placeholder={t("名称、模型或接口")} value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="model-list-filter"><button className={!archived?'active':''} onClick={()=>{if(guard())setArchived(false);}}>{t("可用配置")}</button><button className={archived?'active':''} onClick={()=>{if(guard())setArchived(true);}}>{t("已移除 ")}{rows.filter(p=>p.archived).length}</button></div>
        <div className="model-config-rows">{visible.map(p=><article key={p.id} className={`model-config-row ${profile.id===p.id?'selected':''} ${p.enabled===false?'disabled':''}`}><button className="model-row-select" aria-label={t("编辑配置 {0}", [p.name])} onClick={()=>select(p)}><strong>{p.name}{info.active_profile_id===p.id&&<small>{t("通用默认")}</small>}</strong><span>{p.model}</span><small title={p.last_test?.message}>{tm(testLabel(p))}{p.last_test&&` · ${new Date(p.last_test.checked_at).toLocaleString()}`}</small></button>{p.archived?<button className="subtle-button" disabled={busy} onClick={()=>restore(p)}><ArrowCounterClockwise size={13}/>{t("恢复配置")}</button>:<label className="model-enabled"><input type="checkbox" aria-label={t("启用配置 {0}", [p.name])} checked={p.enabled!==false} disabled={busy} onChange={()=>toggle(p)}/>{p.enabled!==false?t("已启用"):t("已停用")}</label>}</article>)}{!visible.length&&<p className="muted-text">{query?t("没有匹配配置"):archived?t("没有已移除配置"):t("添加第一个模型配置，开始安排创作任务。")}</p>}</div><small className="model-list-footnote">{t("最多 30 套配置，含可恢复的已移除配置。")}</small>
      </aside>
      <section className="model-config-editor"><div className="model-editor-heading"><div><small>{saved?t("编辑模型配置"):t("新模型配置")}</small><h3>{profile.name||t("填写连接信息")}</h3></div>{saved&&!profile.archived&&<div className="model-editor-tools"><button aria-label={t("复制当前模型配置")} title={t("复制参数，新副本不复制密钥")} disabled={busy} onClick={()=>{if(guard())load({...clone(saved),id:blank().id,name:`${saved.name} · 副本`,enabled:true,archived:false,last_test:null});}}><Copy size={16}/>{t("复制")}</button><button aria-label={t("移除当前模型配置")} disabled={busy} onClick={()=>{if(guard())setRemoving(true);}}><Trash size={16}/>{t("移除")}</button></div>}</div>
      {removing&&<div className="model-remove-confirm"><p>{t("移除“")}{profile.name}{t("”？它会退出默认分配，可在“已移除”中恢复；本机加密密钥保留，移除期间不能用于请求。历史任务保留原记录。")}</p><button className="secondary" disabled={busy} onClick={()=>setRemoving(false)}>{t("保留配置")}</button><button className="secondary" disabled={busy} onClick={remove}>{t("确认移入已移除列表")}</button></div>}
      {profile.archived?<div className="model-policy-note">{t("此配置已移除。恢复后可以重新编辑和选用。")}<button className="secondary" onClick={()=>restore(profile)} disabled={busy}>{t("恢复此配置")}</button></div>:<form onSubmit={save}><fieldset disabled={busy}><div className="form-columns"><label className="form-field">{t("配置名称")}<input aria-label={t("模型配置名称")} required maxLength={120} placeholder={t("例如：角色初稿 / 对话精修")} value={profile.name} onChange={e=>change({name:e.target.value})}/></label><label className="form-field">{t("连接类型")}<select aria-label={t("模型连接类型")} value={profile.mode} onChange={e=>change({mode:e.target.value})}><option value="remote">{t("远程模型")}</option><option value="local">{t("本机模型")}</option></select></label></div>
      <label className="form-field">{t("接口地址")}<input aria-label={t("模型接口地址")} required placeholder="https://example.com/v1" value={profile.endpoint} onChange={e=>change({endpoint:e.target.value})}/></label><label className="form-field">{t("模型 ID")}<input aria-label={t("模型 ID")} required placeholder={t("填写接口提供的模型 ID")} value={profile.model} onChange={e=>change({model:e.target.value})}/></label><label className="form-field">API Key<input aria-label={t("模型 API Key")} type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={savedKey?t("已保存本机密钥；留空继续使用，输入可替换"):t("填写这套模型配置的 API Key")}/></label>
      <div className="model-policy-note" role="status">{savedKey?t("已保存本机加密密钥 · 不显示原文"):key?t("已输入新密钥 · 保存后生效"):t("尚未保存密钥")}{saved&&<button type="button" className="subtle-button" disabled={busy} onClick={clearKey}>{t("清除已保存密钥")}</button>}</div>
      <label className="checkbox-label"><input type="checkbox" checked={remember} disabled={!canRemember} onChange={e=>setRemember(e.target.checked)}/>{t("记住密钥，下次打开自动使用")}</label>
      <small className="muted-text">{canRemember?t("保存在本机应用数据目录，由当前 Windows 用户加密；不会进入项目、导出或 Skill。取消记住会清除已保存密钥，请填写仅本次使用的密钥。"):t("当前系统暂不支持本地加密保存；密钥仅用于本次页面会话。")}</small>
      {info?.credentials?.warning&&<p className="danger" role="alert">{info.credentials.warning}</p>}
      <label className="checkbox-label"><input type="checkbox" checked={profile.enabled!==false} onChange={e=>change({enabled:e.target.checked})}/>{t("启用此配置，允许生成任务选用")}</label>
      <details className="model-advanced"><summary>{t("请求参数与协议能力")}</summary><div className="form-columns"><label className="form-field">{t("单项输出上限")}<input aria-label={t("模型输出上限")} type="number" min="128" max="16384" value={profile.max_tokens} onChange={e=>change({max_tokens:Number(e.target.value)})}/></label><label className="form-field">{t("请求超时（秒）")}<input aria-label={t("模型请求超时")} type="number" min="5" max="300" value={profile.timeout_seconds} onChange={e=>change({timeout_seconds:Number(e.target.value)})}/></label></div><label className="form-field">{t("临时失败重试")}<select aria-label={t("模型重试次数")} value={profile.retry_limit} onChange={e=>change({retry_limit:Number(e.target.value)})}><option value="0">{t("不自动重试")}</option><option value="1">{t("最多 1 次")}</option><option value="2">{t("最多 2 次")}</option></select></label><label className="checkbox-label"><input type="checkbox" checked={profile.stream} onChange={e=>change({stream:e.target.checked})}/>{t("此接口支持流式文本")}</label><label className="checkbox-label"><input type="checkbox" checked={profile.json_mode} onChange={e=>change({json_mode:e.target.checked})}/>{t("此接口支持 JSON 输出模式")}</label></details>
      <p className="model-policy-note">{t("支持 chat/completions 文本接口。生成会将选定的世界与人物上下文发送到本次选用的接口；测试会发送一次小请求。最近测试结果不保证当前可用，重试可能产生额外用量。")}</p></fieldset>
      <div className="model-editor-actions">{dirty&&<button className="subtle-button" type="button" disabled={busy} onClick={()=>load(saved||blank())}>{t("放弃配置修改")}</button>}<button type="button" className="secondary" disabled={busy||!profile.endpoint||!profile.model} onClick={test}><Play size={14}/>{busy?t("请求中…"):t("测试连接")}</button><button className="primary" disabled={busy} type="submit">{t("保存配置")}</button></div></form>}
      </section>
    </div>}
    {message&&<p role="status" className="model-manager-feedback">{message}</p>}{error&&<p role="alert" className="model-manager-feedback danger">{tm(error)}</p>}
  </Modal>;
}
