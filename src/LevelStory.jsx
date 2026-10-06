import {CharacterImportanceBadge} from './CharacterImportance';
import { useEffect,useRef,useState } from 'react';
import { ArrowRight,ArrowCounterClockwise,ChatText,Clock,DotsThree,FileText,Flag,Link,MapPin,Play,SlidersHorizontal,Trash,User,Users,X } from '@phosphor-icons/react';
import { t,tm,useI18n } from './i18n';
import { Modal } from './Modal';
import { Reason,clockLabel } from './Rehearsal';
import { LegacyPath } from './RolePreview';
import { shortBlockedReason } from './rolePreviewModel';
import { playRecordKey,playRecordLists } from './dialoguePlayModel';
import { hasFutureInputs } from './levelStoryModel';
import { useNavigationEditor } from './UnsavedNavigation';
import './levelStory.css';

function StoryAvatar({name}){
  return name?<span className="story-avatar" aria-hidden="true">{name.slice(0,1)}</span>:<User size={21}/>;
}

function StoryFrame({frame,content,onLocate}){
  useI18n();
  const kind=frame.presentation || frame.kind;
  const actor=content.characters.find(a=>a.id===frame.speaker_id);
  const label=kind==='scene'?t('进入场景'):kind==='environment'?t('环境文本'):kind==='event'?t('剧情事件'):kind==='rule'?t('剧情规则'):kind==='player'?t('玩家'):kind==='end'?t('对话结束'):frame.speaker || t('状态变化');
  const caption=kind==='player'?t('玩家选择'):kind==='end'?'':frame.label;
  const source=frame.dialogue_id || frame.source_id;
  return <article className={`story-frame story-${kind}`}><div className="story-frame-time">{clockLabel(frame.tick,content.world.clock_unit)}</div><div className="story-frame-body"><div className="story-frame-heading">{kind==='npc'?<StoryAvatar name={frame.speaker}/>:kind==='player'?<ChatText size={15}/>:kind==='scene'?<MapPin size={15}/>:kind==='environment'?<FileText size={15}/>:<Flag size={14}/>}<strong>{label}</strong>{caption&&<small>{caption}</small>}{actor?.role&&<small>{actor.role}</small>}{actor&&<CharacterImportanceBadge value={actor.importance}/>}{source&&<button className="icon-button" aria-label={t('定位故事来源 {0}',[frame.label || label])} title={t('定位编排')} onClick={()=>onLocate(source)}><Link size={14}/></button>}</div>{frame.text&&kind!=='end'&&<p>{frame.text}</p>}</div></article>;
}

export function LevelStoryWorkspace({ local,onReplayCard,onReload,story:s,onEdit,onLocate,onNavigationHandlers,castOpen,onOpenCast}){
  useI18n();
  const r=s.r, c=r.document?.content;
  const end=useRef(null);
  useEffect(()=>{end.current?.scrollIntoView({block:'nearest',behavior:'instant'});},[r.result?.story_flow?.length,s.dialogueId]);
  useNavigationEditor(onNavigationHandlers,{name:t('关卡试玩'),dirty:r.dirty,save:async()=>!!await s.saveRecord() || (!s.saveable&&s.saved),discard:r.discardForNavigation});
  if(!c||!r.branch)return <div className="empty-state">{t('正在载入本地工程…')}</div>;
  const level=c.levels.find(l=>l.id===r.branch.level_id);
  const scene=c.locations.find(l=>l.id===r.result?.state.scene_id);
  const active=s.active;
  const nextAnchor=level?.anchors.filter(a=>a.tick>r.branch.at_tick).sort((a,b)=>a.tick-b.tick)[0];
  const future=hasFutureInputs(r.branch);
  const canAct=!s.locked&&!future;
  const lastFrame=r.result?.story_flow?.at(-1);
  const mergeCurrent=active?.started&&!active.closed&&lastFrame?.kind==='npc'&&lastFrame.dialogue_id===active.id&&lastFrame.node_id===active.node_id;
  return <div className="level-story-workspace" aria-label={t('关卡试玩')}>
    <header className="story-workspace-header"><div><small>{t('关卡试玩 / 场景故事流')}</small><h1>{level?.name || t('尚无关卡')}</h1></div><div className="story-header-tools">{!castOpen&&<button className="icon-button" aria-label={t('场景人物')} title={t('场景人物')} onClick={onOpenCast}><Users size={21}/></button>}<button className="secondary" onClick={()=>s.setPanel('records')}><FileText size={15}/>{t('试玩记录')}</button><details className="story-more"><summary aria-label={t('关卡试玩更多操作')}><DotsThree size={22}/></summary><div><button onClick={e=>{e.currentTarget.closest('details').open=false;s.requestRestart();}}><ArrowCounterClockwise size={14}/>{t('重新开始')}</button><button onClick={e=>{e.currentTarget.closest('details').open=false;s.setPanel('debug');}}>{t('查看调试信息')}</button><button onClick={e=>{e.currentTarget.closest('details').open=false;onEdit();}}>{t('编排剧情规则')}</button><button disabled={!s.saveable} onClick={async e=>{e.currentTarget.closest('details').open=false;await s.saveRecord();}}>{t('保存本次试玩')}</button></div></details></div></header>
    <div className="story-scene-heading"><div><h2><MapPin size={24}/>{scene?.name || t('选择试玩场景')}</h2><p>{t('按关卡出场与正式对话入口规则运行')}</p></div><button className="story-state-chip" onClick={()=>s.setPanel('settings')}><SlidersHorizontal size={15}/>{t('玩家状态 · {0} 项',[c.variables.length])}<small>{clockLabel(r.branch.at_tick,c.world.clock_unit)}</small></button></div>
    {!level&&<div className="story-notice"><p>{t('先在关卡画布创建关卡与场景，再开始场景试玩。')}</p><button className="secondary" onClick={onEdit}>{t('返回关卡画布')}</button></div>}
    {r.error&&<div className="story-notice danger" role="alert">{tm(r.error)}{r.errorStatus===409&&<button className="secondary" disabled={r.busy} onClick={onReload}>{t("载入最新工程")}</button>}</div>}
    {future&&<div className="story-notice">{t('当前时间后仍有操作记录，可从这里复制一条新路线。')}<button disabled={r.busy} className="secondary" onClick={r.fork}>{t('复制并继续')}</button></div>}
    {!!r.result?.diagnostics.length&&<div className="story-notice danger" role="alert">{tm(r.result.diagnostics.at(-1).message)}<button className="primary" disabled={s.resetLocked} onClick={()=>s.requestRestart()}>{t('重新开始')}</button><button className="secondary" onClick={()=>s.setPanel('debug')}>{t('查看原因')}</button></div>}
    {r.result&&!r.result.complete&&<p className="story-notice danger" role="alert">{t('预演达到执行上限，请查看调试信息')}</p>}
    {r.result?.story_flow_truncated&&<p className="story-notice" role="status">{t('故事流已达 2048 条显示上限，请开始较短的试玩。')}</p>}
    <div className={`story-flow ${!r.result?.story_flow?.length&&!active&&!r.busy ? 'is-empty' : ''}`} tabIndex={0} aria-label={t('故事流')} aria-busy={r.busy}>
      {(r.result?.story_flow || []).map((frame,index)=>mergeCurrent&&index===r.result.story_flow.length-1?null:<StoryFrame frame={frame} content={c} onLocate={onLocate} key={`${r.branch.id}:${index}`}/>)}
      {!r.result?.story_flow?.length&&!active&&!r.busy&&<div className="story-empty workspace-empty"><ChatText size={26}/><h3>{t('从接触一个人物开始')}</h3><p>{t('右侧展示当前在场人物；点击交谈，故事会在这里继续。')}</p></div>}
      {active&&<section className="story-active-dialogue" aria-label={t('当前互动对白')}><header><StoryAvatar name={c.characters.find(a=>a.id===active.speaker_id)?.name || c.characters.find(a=>a.id===active.character_id)?.name}/><div><strong>{c.characters.find(a=>a.id===active.speaker_id)?.name || c.characters.find(a=>a.id===active.character_id)?.name || t('旁白')}</strong>{(active.speaker_id || active.character_id)&&<CharacterImportanceBadge value={c.characters.find(a=>a.id===(active.speaker_id || active.character_id))?.importance}/>}<small>{active.name} · {active.node_label}</small></div><button className="icon-button" title={t('定位编排')} aria-label={t('定位当前对白')} onClick={()=>onLocate(active.id)}><Link size={16}/></button><button className="icon-button" aria-label={t('收起当前交谈')} onClick={()=>s.setPanel('leave')}><X size={16}/></button></header>
        {active.closed?<div className="story-dialogue-end"><p>{t('本段对话已结束，可以继续接触其他人物。')}</p><button className="secondary" disabled={!canAct} onClick={()=>s.start(active)}><Play size={14}/>{t('再次交谈')}</button></div>:!active.available?<div className="story-notice"><p>{shortBlockedReason(active.reason)}</p><button className="secondary" onClick={()=>s.setPanel('debug')}>{t('查看原因')}</button></div>:<>
          {!active.started&&<><p className="story-dialogue-copy">{active.text}</p><button className="primary" disabled={!canAct} onClick={()=>s.start(active)}><Play size={15}/>{t('开始交谈')}</button></>}
          {active.started&&<>{mergeCurrent&&<p className="story-dialogue-copy">{active.text}</p>}<div className="story-choices"><small>{t('选择你的回答')}</small>{active.options.map((option,index)=><div key={option.id}><button disabled={!option.available||!canAct} onClick={()=>s.choose(option.id)}><span className="story-choice-number">{index+1}</span><span>{option.text}</span><ArrowRight size={16}/></button>{!option.available&&<small className="story-choice-reason">{shortBlockedReason(option.reason.passed?active.reason:option.reason)}</small>}</div>)}</div>{!active.options.length&&<p className="muted-text">{t('已到达末尾卡片，没有后续选项。')}</p>}</>}
        </>}
      </section>}
      <div ref={end}/>
    </div>
    <footer className="story-next-actions"><span>{r.busy?t('更新中'):t('接下来可以')}</span><label><MapPin size={15}/><select aria-label={t('前往场景')} value={r.result?.state.scene_id || ''} disabled={!canAct} onChange={e=>s.requestScene(e.target.value)}><option value="">{t('选择场景')}</option>{level?.tracks.filter(track=>track.location_id).map(track=><option key={track.id} value={track.location_id}>{track.name}</option>)}</select></label><button className="secondary" disabled={!canAct} onClick={()=>r.seek(r.branch.at_tick+1)}><Clock size={14}/>{t('等待一个时间单位')}</button>{nextAnchor&&<button className="secondary" disabled={!canAct} onClick={()=>r.seek(nextAnchor.tick)}>{t('推进到 {0}',[nextAnchor.name])}<ArrowRight size={14}/></button>}<small>{s.saved?t('本次试玩已保存'):r.dirty?t('试玩操作未保存'):t('只模拟已保存内容')}</small></footer>
    {s.panel==='settings'&&<StorySettings story={s}/>}
    {(s.panel==='records'||s.panel.startsWith('records:'))&&<StoryRecords initialCaseId={s.panel.startsWith('records:')?s.panel.slice(8):null} local={local} onReplayCard={onReplayCard} story={s}/>}
    {s.panel==='debug'&&<Modal title={t('调试信息')} subtitle={t('关卡试玩遵守正式入口与人物出场条件。')} onClose={()=>s.setPanel('')}><div className="story-modal-body">{active&&<><h3>{active.name}</h3><Reason value={active.reason}/><details><summary>{t('实际剧情入口：')}{active.entry_preview.node_label}</summary><Reason value={active.entry_preview.reason}/></details></>}{r.result?.diagnostics.map((d,i)=><p className="danger" key={i}>{tm(d.message)}</p>)}{r.result?.log.map((row,i)=><details key={i}><summary>{clockLabel(row.tick,c.world.clock_unit)} · {row.name}</summary><Reason value={row.reason}/>{row.changes.map((change,j)=><p key={j}>{change.path}：{String(change.before)} → {String(change.after)}</p>)}</details>)}</div></Modal>}
    {s.panel==='leave'&&<Modal title={t('收起这段交谈？')} subtitle={t('已发生的对白保留在故事流，再次点击人物可继续。')} onClose={()=>s.setPanel('')}><div className="story-modal-actions"><button className="secondary" onClick={()=>s.setPanel('')}>{t('取消')}</button><button className="primary" onClick={()=>{s.clearDialogue();s.setPanel('');}}>{t('收起交谈')}</button></div></Modal>}
    {s.pending&&<Modal title={s.pending.type==='scene'?t('离开当前交谈？'):t('开始一次新的试玩？')} subtitle={s.pending.type==='scene'?t('对白记录会保留，返回人物后可以继续。'):t('当前操作将重置，已保存的记录不会改变。')} onClose={()=>s.setPending(null)}><div className="story-modal-actions">{s.pending.type!=='scene'&&<button className="secondary" disabled={!s.saveable} onClick={async()=>{if(await s.saveRecord())s.confirmPending();}}>{t('保存记录后继续')}</button>}<button className="secondary" onClick={()=>s.setPending(null)}>{t('取消')}</button><button className="primary" disabled={s.pending.type==='scene'?s.locked:s.resetLocked} onClick={s.confirmPending}>{s.pending.type==='scene'?t('离开并前往'):t('直接重新开始')}</button></div></Modal>}
  </div>;
}

function ActorCard({row,story:s}){
  useI18n();
  const [show,setShow]=useState(false);
  const selected=row.dialogues.find(d=>d.id===s.dialogueId);
  const active=selected&&!selected.closed;
  const options=row.dialogues.filter(d=>d.available||d.closed);
  return <article className={`story-person ${active?'selected':''}`}><div className="story-person-identity"><StoryAvatar name={row.actor.name}/><div><strong>{row.actor.name}</strong><small>{row.actor.role}</small><CharacterImportanceBadge value={row.actor.importance}/></div><span className="story-person-status">{active?t('正在交谈'):options.length?t('可交谈'):t('在场')}</span></div>{row.appearances.find(a=>a.behavior)?.behavior&&<p>{row.appearances.find(a=>a.behavior).behavior}</p>}<div className="story-person-actions"><button className="secondary" disabled={s.locked||!options.length} onClick={()=>options.length===1?s.start(options[0]):setShow(!show)}><ChatText size={14}/>{active?t('继续交谈'):t('交谈')}{options.length>1&&` · ${options.length}`}</button>{!options.length&&<small>{row.dialogues.length?t('对白条件暂未满足'):t('尚未编排对白')}</small>}</div>{show&&options.map(d=><button key={d.id} className="story-dialogue-pick" disabled={s.locked} onClick={()=>{s.start(d);setShow(false);}}>{d.name}<ArrowRight size={13}/></button>)}</article>;
}
export function LevelStoryCast({story:s,onClose}){
  useI18n();
  const c=s.r.document?.content;
  const texts=s.r.result?.texts.filter(row=>row.available) || [];
  return <aside className="inspector story-cast" aria-label={t('场景人物')}><header><div><h2><Users size={21}/>{t('场景人物')}</h2><p>{t('随关卡、场景与出场条件显示')}</p></div><button className="icon-button" aria-label={t('关闭场景人物面板')} onClick={onClose}><X size={16}/></button></header><div className="story-cast-scroll">{s.cast.people.map(row=><ActorCard key={row.actor.id} row={row} story={s}/>)}{s.cast.groups.map(group=><details className="story-npc-group" key={group.id} open><summary><Users size={16}/>{group.name}<small>{t('{0} 人',[group.members.length])}</small></summary>{group.members.map(row=><ActorCard key={row.actor.id} row={row} story={s}/>)}</details>)}{!s.cast.people.length&&!s.cast.groups.length&&<p className="story-cast-empty">{s.r.busy?t('更新中'):t('当前场景和时间没有在场人物，可切换场景或推进时间。')}</p>}<details className="story-scene-texts"><summary><FileText size={16}/>{t('本场景可用文本 · {0}',[texts.length])}</summary>{texts.map(row=><article key={row.id}><strong>{row.name}</strong><p>{row.body}</p></article>)}{!texts.length&&<p>{t('当前没有可用文本。')}</p>}</details>{c&&<p className="story-cast-footnote">{t('文本首次满足条件时进入故事流；回访场景可再次阅读。')}</p>}</div></aside>;
}

function StorySettings({story:s}){
  useI18n();
  const r=s.r,c=r.document.content;
  const [levelId,setLevel]=useState(r.branch.level_id || c.levels[0]?.id || '');
  const [scene,setScene]=useState(r.result?.state.scene_id || '');
  const [tick,setTick]=useState(String(r.branch.at_tick));
  const [variables,setVariables]=useState({...r.branch.variable_overrides});
  const [error,setError]=useState('');
  const level=c.levels.find(l=>l.id===levelId);
  return <Modal title={t('试玩起点与玩家状态')} subtitle={t('调整后明确重新开始，当前对白不会悄悄跳转。')} onClose={()=>s.setPanel('')}><form onSubmit={e=>{e.preventDefault();const value=Number(tick);if(!tick.trim()||!Number.isInteger(value)||value<c.initial_state.tick){setError(t('填写不小于 {0} 的整数',[c.initial_state.tick]));return;}s.requestRestart({levelId,locationId:scene,tick:value,variables});}}><div className="form-columns"><label>{t('关卡')}<select value={levelId} aria-label={t('试玩关卡')} onChange={e=>{setLevel(e.target.value);setScene(c.levels.find(l=>l.id===e.target.value)?.tracks.find(track=>track.location_id)?.location_id || '');}}>{c.levels.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select></label><label>{t('场景')}<select value={scene} aria-label={t('关卡试玩起点场景')} onChange={e=>setScene(e.target.value)}>{level?.tracks.filter(track=>track.location_id).map(track=><option key={track.id} value={track.location_id}>{track.name}</option>)}</select></label></div><label className="form-field">{t('故事时间')}<input aria-label={t('关卡试玩起点时间')} type="number" min={c.initial_state.tick} step="1" value={tick} onChange={e=>setTick(e.target.value)}/></label><div className="story-settings-variables">{c.variables.map(v=><label key={v.id}><span>{v.name}</span>{v.value_type==='boolean'?<input aria-label={t('初始玩家状态 {0}',[v.name])} type="checkbox" checked={!!(variables[v.id]??c.initial_state.variables[v.id]??v.default)} onChange={e=>setVariables({...variables,[v.id]:e.target.checked})}/>:<input aria-label={t('初始玩家状态 {0}',[v.name])} type={v.value_type==='number'?'number':'text'} value={variables[v.id]??c.initial_state.variables[v.id]??v.default} onChange={e=>setVariables({...variables,[v.id]:v.value_type==='number'?Number(e.target.value):e.target.value})}/>}</label>)}</div>{error&&<p className="danger" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>s.setPanel('')}>{t('取消')}</button><button className="primary" disabled={s.resetLocked||!level||!scene}>{t('应用并重新开始')}</button></div></form></Modal>;
}

function StoryRecords({local,onReplayCard,story:s,initialCaseId}){
  useI18n();
  const initialLists=playRecordLists(s.r.document);
  const [deleted,setDeleted]=useState(()=>!!initialCaseId&&initialLists.deleted.some(row=>row.legacy&&row.id===initialCaseId));
  const [selected,setSelected]=useState(()=>initialCaseId?[...initialLists.active,...initialLists.deleted].find(row=>row.legacy&&row.id===initialCaseId)||null:null);
  const [name,setName]=useState(`${s.cast.level?.name || t('关卡试玩')} · ${new Date().toLocaleTimeString()}`.slice(0,150));
  const [saveForm,setSaveForm]=useState(false);
  const [scope,setScope]=useState(initialCaseId?'all':'level');
  const lists=playRecordLists(s.r.document);
  // Browse all frozen records; card inputs are replayed only by the role workbench.
  const matches=row=>scope==='all' || (scope==='card'?!!row.inputs.card_trial:!row.inputs.card_trial);
  const rows=(deleted?lists.deleted:lists.active).filter(matches);
  const remove=async(row)=>{if(await s.deleteRecord(row,!deleted))setSelected(null);};
  return <Modal title={t('工程试玩记录')} subtitle={t('冻结保存当时的对白、环境文本与操作条件。')} onClose={()=>s.setPanel('')} wide><div className="story-modal-body story-records"><div className="story-record-scopes" aria-label={t("记录来源")}>{[["level",t("关卡试玩")],["card",t("角色卡片试玩")],["all",t("全部记录")]].map(([key,label])=><button key={key} aria-pressed={scope===key} onClick={()=>{setScope(key);setSelected(null);setSaveForm(false);}}>{label}</button>)}</div><div className="story-record-tools"><button className="secondary" onClick={()=>{setDeleted(!deleted);setSelected(null);setSaveForm(false);}}>{deleted?t('返回记录'):t('已删除 {0}',[lists.deleted.filter(matches).length])}</button>{!deleted&&scope==='level'&&<button className="primary" disabled={!s.saveable} onClick={()=>setSaveForm(true)}>{s.saved?t('本次试玩已保存'):t('保存本次试玩')}</button>}</div>{saveForm&&<form className="story-record-save" onSubmit={async e=>{e.preventDefault();const row=await s.saveRecord(name);if(row){setSelected(row);setSaveForm(false);}}}><label>{t('记录名称')}<input autoFocus required maxLength={150} aria-label={t('关卡试玩记录名称')} value={name} onChange={e=>setName(e.target.value)}/></label><button className="primary" disabled={!name.trim()||!s.saveable}>{t('保存新记录')}</button><button type="button" className="secondary" onClick={()=>setSaveForm(false)}>{t('取消')}</button></form>}{s.frames.length>384&&<p className="danger">{t('本次故事超过 384 条记录，请缩短试玩后保存。')}</p>}{selected?<div><div className="story-record-detail-head"><button className="secondary" onClick={()=>setSelected(null)}>{t('← 返回记录列表')}</button><button className="secondary" disabled={s.saving} onClick={()=>remove(selected)}>{deleted?t('恢复记录'):t('删除记录（可恢复）')}</button></div><h3>{selected.name}</h3><p>{selected.scene_name} · {selected.created_at?new Date(selected.created_at).toLocaleString():t('旧版保存记录')}</p><details><summary>{t('当时的测试条件')}</summary>{Object.entries(selected.initial_variables || selected.inputs.variable_overrides).map(([id,value])=><p key={id}>{selected.variable_labels?.[id] || id}：{String(value)}</p>)}</details>{selected.legacy?<LegacyPath local={local} readOnly={deleted} record={selected} content={s.r.document.content}/>:selected.transcript.map((frame,i)=><article className={`story-record-frame ${frame.kind}`} key={i}><small>{frame.speaker || frame.label} · {clockLabel(frame.tick,s.r.document.content.world.clock_unit)}</small><p>{frame.text}</p></article>)}{!deleted&&<button className="secondary" disabled={selected.inputs.card_trial?!s.r.document.content.dialogues.some(g=>g.id===selected.inputs.card_trial.dialogue_id && g.character_id):s.locked} onClick={()=>{if(selected.inputs.card_trial)onReplayCard?.(selected);else s.replay(selected);}}>{selected.inputs.card_trial?t('在角色工作台重新试玩'):t('按当前内容重放操作')}</button>}</div>:<div className="story-record-list">{rows.map(row=><article key={playRecordKey(row)}><button onClick={()=>setSelected(row)}><strong>{row.name}</strong><small>{row.inputs.card_trial?t('角色卡片试玩'):t('关卡试玩')} · {row.character_name} · {row.legacy?t('旧记录 · 操作路径'):row.scene_name}</small></button><button className="icon-button" disabled={s.saving} aria-label={t('{0}试玩记录 {1}',[deleted?t('恢复'):t('删除'),row.name])} onClick={()=>remove(row)}>{deleted?<ArrowCounterClockwise size={16}/>:<Trash size={16}/>}</button></article>)}{!rows.length&&<p>{deleted?t('没有已删除的记录。'):t('还没有保存的试玩记录。完成试玩后，在这里保存。')}</p>}</div>}</div></Modal>;
}
