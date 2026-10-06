import { t, tm, useI18n } from './i18n';
import { useRef, useState } from 'react';
import { Sparkle, Users, ChatText } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { api } from './localApi';
import { enabledModels, generationModel, hasModelKey } from './modelRouting';
import { uid, conditionLabel } from './planning';
import { groupGenerationItems, npcGroupBounds } from './npcGroups';
import { crowdNames, crowdPlan, sceneContent, draftScopeLabel, sceneTextLengths, withSceneOutputLimits, sceneOutputTokenCap } from './sceneGeneration';
import './sceneGeneration.css';

export function hasSceneCondition(condition, locationId) {
  if (!condition) return false;
  if (condition.op === 'scene') return condition.location_id === locationId;
  return condition.op === 'all' && condition.conditions.some(child => hasSceneCondition(child, locationId));
}
export function SceneTextsModal({ content, editor, level, track, onClose, onGenerate, onReview, onOpenTarget }) {
  useI18n();
  const items=sceneContent(content,level,track,editor);
  const current=content.levels.find(l=>l.id===level.id)?.tracks.find(t=>t.id===track.id&&t.location_id===track.location_id);
  return <Modal title={t("{0} · 场景内容", [track.name])} subtitle={t("场景里的背景文本、人物对白与待审核候选集中在这里。")} onClose={onClose} wide className="scene-content-modal"><div className="scene-content-toolbar"><p>{level.name} · {items.texts.length}{t(" 项文本 · ")}{items.dialogues.length}{t(" 次出场对白 · ")}{items.pending.length}{t(" 份待审核")}</p><button className="primary" disabled={!current} onClick={onGenerate}><Sparkle size={14}/>{t("批量创作")}</button></div>
    <section className="scene-content-section"><h3>{t("待审核候选 · ")}{items.pending.length}</h3><div className="scene-content-grid">{items.pending.map(d=><article className="scene-content-card" key={d.id}><h4>{d.patch.name || d.name}</h4><small>{d.scene_context.group_name} · {draftScopeLabel(d,content)}</small><p>{d.patch.body || d.patch.nodes?.[0]?.text || t("候选等待审核")}</p><button className="secondary" onClick={()=>onReview(d.task_id,d.id)}>{t("审核本批内容")}</button></article>)}</div>{!items.pending.length&&<p className="muted-text">{t("没有待审核的场景候选。生成完成后会显示在这里。")}</p>}</section>
    <section className="scene-content-section"><h3>{t("环境文本 · ")}{items.texts.length}</h3><div className="scene-content-grid">{items.texts.map(rowItem=><article className="scene-content-card" key={rowItem.id}><h4>{rowItem.name}</h4><small>{conditionLabel(rowItem.condition,content)}</small><p>{rowItem.body}</p><button className="secondary" onClick={()=>onOpenTarget({target:{kind:'text',id:rowItem.id}})}>{t("编辑文本与条件")}</button></article>)}</div>{!items.texts.length&&<p className="muted-text">{t("还没有环境文本，可在高级功能中生成无指定人物的背景文本。")}</p>}</section>
    <section className="scene-content-section"><h3>{t("人物对白 · ")}{items.dialogues.length}</h3><div className="scene-content-grid">{items.dialogues.map(({graph,appearance,actor})=><article className="scene-content-card" key={`${appearance.id}:${graph.id}`}><h4>{actor?.name || t("旁白")} · {graph.name}</h4><small>{t("出场 ")}{appearance.start_tick}–{appearance.end_tick} · {graph.nodes.length}{t(" 张对白卡片")}</small><p>{graph.nodes.find(n=>n.id===graph.entry_node_id)?.text || t("尚无开场文本")}</p><button className="secondary" onClick={()=>onOpenTarget({target:{kind:'dialogue',id:graph.id},scene_context:{level_id:level.id,track_id:track.id,appearance_id:appearance.id}})}>{t("编辑与试玩")}</button></article>)}</div>{!items.dialogues.length&&<p className="muted-text">{t("这个场景还没有人物对白。")}</p>}</section>
  </Modal>;
}
export function SceneCrowdModal({ local, level, track, group, memberId, sessionKeys, onClose, onSubmitted, onCreated, onSettings }) {
  useI18n();
  const bounds=group?npcGroupBounds(level,group):null;
  const [mode,setMode]=useState('people'),[count,setCount]=useState(6),[cardCount,setCardCount]=useState(2),[textLength,setTextLength]=useState('short');
  const [groupName,setGroupName]=useState(group?.name || `${track.name}居民`),[roles,setRoles]=useState('旅客、商贩、守夜人');
  const [tone,setTone]=useState('轻松、生活化'),[topics,setTopics]=useState('食物、天气、旅途见闻；不涉及主线秘密');
  const [start,setStart]=useState(bounds?.start ?? level.anchors[0]?.tick ?? local.project._document.content.initial_state.tick);
  const [end,setEnd]=useState(bounds?.end ?? level.anchors.at(-1)?.tick ?? start+10);
  const [override,setOverride]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState(false);
  const prepared=useRef(null),payload=useRef(null);
  const purpose=mode==='pool'?'text':'dialogue',profile=generationModel(local.workspaceInfo,purpose,override);
  const run=async generate=>{
    if(busy)return;setBusy(true);setError('');
    try{
      if(generate){if(!profile)throw new Error(t("请先添加并启用模型配置"));if(profile.mode==='remote'&&!hasModelKey(local.workspaceInfo,profile,sessionKeys))throw new Error(t("请在模型配置里填写或保存 API Key"));if(!local.file.path)throw new Error(t("先保存本地项目，再生成台词"));}
      if(generate)withSceneOutputLimits([],cardCount,textLength);
      if(!prepared.current){
        const doc=await local.exportDocument(),current=doc.content.levels.find(l=>l.id===level.id);
        if(!current?.tracks.some(t=>t.id===track.id&&t.location_id===track.location_id))throw new Error(t("场景已修改，请重新打开窗口"));
        if(group){const currentGroup=current.npc_groups.find(g=>g.id===group.id);if(!currentGroup)throw new Error(t("NPC 组已不存在"));prepared.current=groupGenerationItems(doc.content,current,currentGroup).filter(i=>!memberId||i.scene_context.appearance_id===memberId);}
        else{const plan=crowdPlan(doc.content,current,track,{mode,count,groupName,roles,tone,start,end},uid);if(plan.commands.length){await local.transact(plan.commands);setCreated(true);}prepared.current=plan.items;}
      }
      if(!generate){onClose();onCreated?.(groupName);return;}
      const doc=await local.exportDocument();
      if(!payload.current)payload.current={request_id:uid('crowd'),expected_revision:doc.revision,profile_id:profile.id,purpose,api_key:sessionKeys[profile.id]||'',items:withSceneOutputLimits(prepared.current,cardCount,textLength),instructions:`为场景“${track.name}”设计短闲聊。氛围和口吻：${tone}；话题与边界：${topics}。数量与正文长度严格遵守本项 output_limits，各项避免重复，不加入重大剧情事实，不透露人物未知的秘密。${mode==='pool'?'输出一份 rumor 类型非对话文本 body，允许无指定人物的背景聊天。':'每个请求只为上下文中本项的唯一人物编写台词，禁止混入其他人物、旁白或多个身份的台词，禁止在正文添加其他说话者署名。所有节点的 speaker_id 必须是本项 character_id。卡片总数包含开场与分支，玩家选项用简短回应或结束，不额外增加对白卡片。'}场景和时间条件由工具追加，其他条件只能引用已有稳定 ID。`};
      const result=await api(`/api/v2/projects/${doc.project_id}/generate`,{method:'POST',body:payload.current});await local.refresh();onClose();onSubmitted(result,mode);
    }catch(reason){setError(reason.message);if(reason.status)payload.current=null;}finally{setBusy(false);}
  };
  let roster=[];try{roster=group?level.appearances.filter(a=>a.npc_group_id===group.id&&(!memberId||a.id===memberId)).map(a=>local.project._document.content.characters.find(c=>c.id===a.character_id)).filter(Boolean):crowdNames(groupName,roles,count);}catch{}
  return <Modal title={group?`${groupName} · ${memberId?t("生成单人台词"):t("批量生成台词")}`:t("{0} · 添加 NPC 组", [track.name])} subtitle={t("一人一份角色档案和台词，直接在关卡画布里管理。")} onClose={()=>{if(!busy)onClose();}} wide className="scene-crowd-modal"><form onSubmit={e=>{e.preventDefault();run(!!group||mode==='pool');}}><div className="crowd-form-scroll">
    <div className="crowd-context"><strong>{level.name} / {track.name}</strong><p>{group?t("生成台词 → 在组内逐人审核 → 修改或试玩；已有台词先保留，采用后更新"):t("创建 NPC 组 → 在画布里逐人写台词，或批量生成后审核")}</p></div>
    {!group&&<fieldset disabled={busy||created} className="crowd-fields"><div className="form-columns"><label>{t("组名")}<input required maxLength="120" aria-label={t("背景NPC组名")} value={groupName} onChange={e=>setGroupName(e.target.value)}/></label><label>{mode==='people'?t("NPC 人数"):t("背景文本份数")}<input required aria-label={t("背景NPC数量")} type="number" min="1" max="10" value={count} onChange={e=>setCount(Number(e.target.value))}/></label><label>{t("身份组合")}<input required aria-label={t("背景NPC身份组合")} value={roles} onChange={e=>setRoles(e.target.value)}/></label><label>{t("出现开始")}<input required aria-label={t("背景NPC开始时间")} type="number" min={local.project._document.content.initial_state.tick} value={start} onChange={e=>setStart(Number(e.target.value))}/></label><label>{t("出现结束")}<input required aria-label={t("背景NPC结束时间")} type="number" min={start} value={end} onChange={e=>setEnd(Number(e.target.value))}/></label></div></fieldset>}
    <div className="crowd-context"><strong>{mode==='people'?t("{0} 个 NPC · 每人独立台词", [roster.length]):t("{0} 份无指定人物的文本", [roster.length])}</strong><div className="crowd-roster">{roster.map(row=><div key={row.name}>{row.name}</div>)}</div><p>{mode==='people'?t("可先手工写台词，生成时再配置模型。角色和出场显示在关卡画布与人物总览；草稿采用后才成为正式台词。"):t("只保存场景背景文本，不创建 NPC，也不会显示 NPC 组控件。")}</p></div>
    <details className="crowd-extra" open><summary>{t("台词生成设置")}</summary><fieldset disabled={busy} className="crowd-fields"><div className="form-columns">{mode==='people'&&<label>{t("每人对白卡片数")}<input aria-label={t("每人对白卡片数")} required type="number" min="1" max="6" value={cardCount} onChange={e=>setCardCount(Number(e.target.value))}/></label>}<label>{mode==='people'?t("每张台词长度"):t("每份文本长度")}<select aria-label={mode==='people'?t("每张台词长度"):t("每份文本长度")} value={textLength} onChange={e=>setTextLength(e.target.value)}><option value="short">{t("简短 · 最多 120 字符")}</option><option value="medium">{t("适中 · 最多 240 字符")}</option><option value="long">{t("详细 · 最多 480 字符")}</option></select></label><label>{t("氛围与口吻")}<input aria-label={t("背景NPC氛围")} value={tone} onChange={e=>setTone(e.target.value)}/></label></div><div className="crowd-output-summary" role="status"><strong>{mode==='people'?t("{0} 人 × 每人 {1} 张 = 共 {2} 张对白卡片",[roster.length,cardCount,roster.length*cardCount]):t("共 {0} 份环境文本",[roster.length])}</strong><p>{mode==='people'?t("包含开场与分支卡片，玩家选项不计数。每张正文最多 {0} 字符（含标点和空格）。",[sceneTextLengths[textLength]]):t("每份正文最多 {0} 字符（含标点和空格）。",[sceneTextLengths[textLength]])}</p>{profile&&<p>{t("单项输出上限：{0} tokens（含正文、选项和结构；实际用量以服务商返回为准）。",[sceneOutputTokenCap(profile,mode==='people'?cardCount:1,textLength)])}</p>}<p>{t("数量或长度不符会提示失败，不自动补写重试；已成功的草稿保留。")}</p></div><label className="form-field">{t("话题与创作边界")}<textarea aria-label={t("背景NPC话题")} value={topics} onChange={e=>setTopics(e.target.value)}/></label><label className="form-field">{t("使用模型")}<select aria-label={t("背景NPC生成模型")} value={override} onChange={e=>setOverride(e.target.value)}><option value="">{t("按{0}默认分配",[mode==='pool'?t("文本"):t("对话")])}{profile?` · ${profile.name}`:t(" · 尚未配置")}</option>{enabledModels(local.workspaceInfo).map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label></fieldset><button type="button" className="secondary" disabled={busy} onClick={onSettings}>{t("模型配置")}</button><p className="muted-text">{t("每批 1–10 项，最多 2 项同时生成。请求失败保留 NPC，可以逐人重试。")}</p></details>
    {!group&&<details className="crowd-extra"><summary>{t("高级：无指定人物的背景文本")}</summary><label className="checkbox-label"><input type="checkbox" checked={mode==='pool'} disabled={busy||created} onChange={e=>setMode(e.target.checked?'pool':'people')}/>{t("只生成背景文本，不创建 NPC 组")}</label></details>}
    {created&&<p>{t("NPC 组已创建；再次生成会沿用这些人物，不重复创建。")}</p>}{error&&<p className="danger" role="alert">{tm(error)}</p>}
  </div><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t("关闭")}</button>{!group&&mode==='people'&&<button type="button" className="secondary" disabled={busy||!profile||!local.file.path} onClick={e=>{if(e.currentTarget.form.reportValidity())run(true);}}><Sparkle size={14}/>{t("创建并生成台词")}</button>}<button className="primary" disabled={busy||((!!group||mode==='pool')&&(!profile||!local.file.path))}>{busy?t("处理中…"):group?t("生成台词草稿"):mode==='pool'?t("生成背景文本"):t("创建 NPC 组")}</button></div></form></Modal>;
}
