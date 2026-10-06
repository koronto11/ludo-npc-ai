import {LegacyRecordDetails} from './LegacyRecordDetails';
import { t, tm, useI18n } from './i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { Play, ArrowRight, ArrowCounterClockwise, DotsThree, SlidersHorizontal, Trash } from '@phosphor-icons/react';
import { Reason, clockLabel } from './Rehearsal';
import { shortBlockedReason } from './rolePreviewModel';
import { dialogueVariableIds, variableIds, characterPlayRecordLists, playRecordKey, recordDialogueId } from './dialoguePlayModel';
import './rolePreview.css';

function StateInput({variable,value,onChange,disabled}) {
  useI18n();
  const [text,setText]=useState(String(value ?? ''));
  const [error,setError]=useState('');
  useEffect(()=>{setText(String(value ?? ''));setError('');},[value,variable.id]);
  const commit=()=>{
    const next=variable.value_type==='number'?Number(text):text;
    if(variable.value_type==='number'&&(!text.trim()||!Number.isFinite(next))){setError(t("请输入有效数字"));return;}
    setError('');if(next!==value)onChange(variable.id,next);
  };
  return <label className="play-state-input"><span>{variable.name}</span>{variable.value_type==='boolean'?<span className="play-toggle"><input aria-label={t("试玩状态 {0}", [variable.name])} type="checkbox" checked={!!value} disabled={disabled} onChange={e=>onChange(variable.id,e.target.checked)}/><span>{value?t("是"):t("否")}</span></span>:<input aria-label={t("试玩状态 {0}", [variable.name])} type={variable.value_type==='number'?'number':'text'} value={text} disabled={disabled} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setText(String(value ?? ''));setError('');}}}/>} {error&&<small role="alert">{tm(error)}</small>}</label>;
}
function TimeInput({value,min,onChange,disabled}) {
  useI18n();
  const [text,setText]=useState(String(value));
  const [error,setError]=useState('');
  useEffect(()=>{setText(String(value));setError('');},[value]);
  const commit=()=>{const next=Number(text);if(!text.trim()||!Number.isInteger(next)||next<min){setError(t("填写不小于 {0} 的整数", [min]));return;}setError('');if(next!==value)onChange(next);};
  return <label>{t("故事时间")}<input aria-label={t("试玩时间")} type="number" step="1" min={min} value={text} disabled={disabled} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>{error&&<small role="alert">{tm(error)}</small>}</label>;
}
export function LegacyPath({record,content,local,readOnly}) {
  useI18n();
  return <><LegacyRecordDetails local={local} recordId={record.id} content={content} readOnly={readOnly}/><p className="preview-help">{t("旧记录保存了条件和操作路径，没有当时的对白快照。下面的名称来自当前剧情。")}</p>{record.inputs.choices.map((choice,index)=>{
    const graph=content.dialogues.find(g=>g.id===choice.dialogue_id);
    const option=graph?.nodes.flatMap(n=>n.options).find(o=>o.id===choice.option_id);
    return <article className="play-history-frame player" key={index}><small>{clockLabel(choice.tick,content.world.clock_unit)} · {graph?.name || t("已移除的对白")}</small><p>{choice.action==='start'?t("开始对话"):choice.action==='restart'?t("重新开始"):option?.text || t("已移除的选项")}</p></article>;
  })}{!record.inputs.choices.length&&<p className="preview-help">{t("该旧记录没有玩家选择。")}</p>}</>;
}
export function RolePreview({ local,onGlobalRecords,onReload,play:p, actor, draft, authorDirty, saving, onSave, onLocateNode, canLocate, onReplayRecord}) {
  useI18n();
  const [view,setView]=useState('play');
  const [selectedRecord,setSelectedRecord]=useState(null);
  const [saveForm,setSaveForm]=useState(false);
  const [recordName,setRecordName]=useState('');
  const [notice,setNotice]=useState('');
  const [showDeleted,setShowDeleted]=useState(false);
  const [lastDeleted,setLastDeleted]=useState(null);
  const [editedOptions,setEditedOptions]=useState(new Set());
  const moreRef=useRef(null);
  const id=useId();
  useEffect(()=>{setView('play');setSelectedRecord(null);setSaveForm(false);setNotice('');setShowDeleted(false);setLastDeleted(null);setEditedOptions(new Set());},[actor.id,draft?.id,p.document?.project_id]);
  useEffect(()=>{
    const close=e=>{if(!moreRef.current?.contains(e.target))moreRef.current?.removeAttribute('open');};
    const escape=e=>{if(e.key==='Escape'&&moreRef.current?.open){moreRef.current.removeAttribute('open');moreRef.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[]);
  const c=p.document?.content;
  const inputs=p.inputs;
  const active=p.result?.dialogues.find(d=>d.id===draft?.id);
  const node=draft?.nodes.find(n=>n.id===active?.node_id);
  const related=dialogueVariableIds(draft);
  const recordLists=characterPlayRecordLists(p.document,actor.id);
  const records=showDeleted?recordLists.deleted:recordLists.active;
  const selectedDeleted=selectedRecord&&recordLists.deleted.some(row=>playRecordKey(row)===playRecordKey(selectedRecord));
  const undoAvailable=lastDeleted&&recordLists.deleted.some(row=>playRecordKey(row)===playRecordKey(lastDeleted));
  const started=!!inputs?.card_trial?.started || !!inputs && !inputs.card_trial;
  const legacy=!!inputs && !inputs.card_trial;
  const mode=legacy?t('旧记录重放'):inputs?.card_trial?.use_entry_routes?t('剧情入口验证'):t('卡片试玩');
  const disabled=p.busy || p.saving || saving || authorDirty;
  const playable=!disabled && !!p.result?.complete && !p.error && !p.result.diagnostics.length;
  const currentValue=v=>p.result?.state.variables[v.id] ?? inputs?.variable_overrides[v.id] ?? c.initial_state.variables[v.id] ?? v.default;
  const states=(ids,optionId)=>c?.variables.filter(v=>ids.has(v.id)).map(v=><StateInput key={v.id} variable={v} value={currentValue(v)} disabled={disabled || legacy || inputs?.card_trial?.actions.length>=128} onChange={(identifier,value)=>{if(p.stateVariable(identifier,value)){setNotice("玩家状态已调整，保持当前对白。");if(optionId)setEditedOptions(previous=>new Set([...previous,optionId]));}}}/>);
  const startLabel=inputs?.card_trial?.use_entry_routes?'按剧情入口规则':draft?.nodes.find(n=>n.id===(inputs?.card_trial?.start_node_id || draft?.entry_node_id))?.label || '开场卡片';
  const scene=c?.locations.find(l=>l.id===inputs?.location_id)?.name || t('未指定场景');
  const saveable=playable && started && !!p.result?.transcript.length && !p.alreadySaved;
  const save=async()=>{
    if(!recordName.trim())return;
    const record=await p.saveRecord(recordName);
    if(record){setSelectedRecord(record);setSaveForm(false);setNotice("已保存到本地项目，旧记录保持不变。");}
  };
  const openSave=()=>{setRecordName(`${actor.name} · ${draft?.name || '试玩'} · ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`.slice(0,150));setSaveForm(true);setSelectedRecord(null);};
  const changeDeleted=async(record,deleted)=>{
    if(await p.setRecordDeleted(record,deleted)){
      setSelectedRecord(null);setSaveForm(false);
      if(deleted){setLastDeleted(record);setNotice("已移到已删除记录，可以撤销或稍后恢复。");}
      else{setNotice("记录已恢复。");if(playRecordKey(record)===playRecordKey(lastDeleted || {}))setLastDeleted(null);}
    }
  };
  const operate=fn=>{moreRef.current?.removeAttribute('open');fn();};
  return <aside className="role-preview role-preview-panel" aria-label={t("玩家预演")}>
    <header className="preview-header"><div className="preview-heading"><strong><Play size={14}/>{mode}</strong><span className={`preview-status ${active?.closed?'finished':started?'playing':'pending'}`} role="status">{p.busy?t("更新中"):active?.closed?t("已结束"):started?t("试玩中"):t("待试玩")}</span></div><p className="preview-context"><strong>{actor.name}</strong><span>{draft?.name || t("尚无对白")}</span></p>
      <div className="play-context-tools"><details className="play-scene"><summary>{scene} · {inputs?clockLabel(inputs.at_tick,c.world.clock_unit):t("载入中")}<SlidersHorizontal size={12}/></summary>{inputs&&<div className="play-context-form"><p className="preview-help">{t("修改场景或时间会准备一次新的试玩。")}</p><TimeInput value={inputs.at_tick} min={c.initial_state.tick} disabled={disabled} onChange={at_tick=>p.contextChange({at_tick})}/><label>{t("场景")}<select aria-label={t("试玩场景")} value={inputs.location_id || ''} disabled={disabled} onChange={e=>p.contextChange({location_id:e.target.value || null})}><option value="">{t("未指定场景")}</option>{c.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label></div>}</details>
        <details className="preview-more" ref={moreRef}><summary aria-label={t("试玩更多操作")}><DotsThree size={19}/></summary><div className="preview-more-menu"><button onClick={()=>operate(()=>setView('debug'))}>{t("查看调试信息")}</button><button disabled={!playable} onClick={()=>operate(()=>{p.restart(null,true);setView('play');setNotice("按实际剧情入口规则开始验证。");})}>{t("验证剧情入口")}</button><button disabled={!canLocate || !active?.node_id} onClick={()=>operate(()=>onLocateNode(active.node_id))}>{t("定位当前卡片")}</button></div></details>
      </div></header>
    <div className="preview-tabs" role="tablist" aria-label={t("试玩内容")}>{[['play','对白试玩'],['records','试玩记录 {0}']].map(([key,label])=><button key={key} role="tab" id={`${id}-${key}`} aria-selected={view===key} aria-controls={`${id}-body`} tabIndex={view===key?0:-1} onClick={()=>{setView(key);setNotice('');}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const target=e.key==='Home'?'play':e.key==='End'?'records':key==='play'?'records':'play';setView(target);e.currentTarget.parentElement.querySelector(`[id="${id}-${target}"]`)?.focus();}}}>{t(label,[recordLists.active.length])}</button>)}</div>
    <div className="preview-body" id={`${id}-body`} role="tabpanel" aria-labelledby={`${id}-${view==='records'?'records':'play'}`}>
      {authorDirty&&<div className="preview-notice">{t("编排有未保存的修改。")}<button disabled={saving} onClick={onSave}>{t("保存编排后试玩")}</button></div>}
      {p.error&&<div className="preview-notice danger" role="alert">{tm(p.error)}{p.errorStatus===409&&<button className="secondary" disabled={saving || p.busy} onClick={onReload}>{t("载入最新工程")}</button>}</div>}
      {notice&&view!=='play'&&<p className="play-feedback" role="status">{t(notice)}</p>}
      {view==='play'?<>
        <p className="play-origin">{legacy?t("按当前剧情重放旧操作路径"):t("从「{0}」{1}", [startLabel, started?t("试玩"):t("开始")])}</p>
        {!active?<p className="preview-help">{p.busy?t("正在载入对白…"):t("从左侧选择或创建对白。")}</p>:active.closed?<div className="preview-ending"><strong>{t("本段对话已结束")}</strong><p>{t("可以保存这次试玩，或重新尝试其他选项。")}</p><button className="play-text-button" disabled={!saveable} onClick={()=>{setView('records');openSave();}}>{t("保存本次试玩")}</button></div>:!active.available?<div className="preview-notice"><strong>{t("当前条件不满足")}</strong><p>{tm(shortBlockedReason(active.reason))}</p><button onClick={()=>setView('debug')}>{t("查看原因")}</button></div>:<>
          <article className="preview-speech"><div><strong>{c.characters.find(a=>a.id===active.speaker_id)?.name || t("旁白")}</strong><small>{active.node_label}</small></div><blockquote>{active.text || t("此卡片尚无对白文本。")}</blockquote></article>
          <div className="preview-option-label">{started?t("选择你的回答"):t("开始试玩后，可选择回答")}</div><div className="preview-options">{active.options.map((option,index)=>{
            const source=node?.options.find(o=>o.id===option.id);
            const keys=variableIds(source?.condition);
            return <div key={option.id} className={!option.available?'unavailable':''}><button disabled={!option.available || !playable || !started || legacy} onClick={()=>{p.choose(option.id);setNotice('');}}><span className="preview-option-number">{index+1}</span><span>{option.text}</span><ArrowRight size={14}/></button>{(!option.available || editedOptions.has(option.id))&&<div className="play-option-condition"><p>{option.available?t("条件已满足"):shortBlockedReason(option.reason.passed?active.reason:option.reason)}</p>{!legacy&&keys.size>0&&states(keys,option.id)}</div>}</div>;
          })}</div>{!active.options.length&&<p className="preview-help">{t("已到达末尾卡片，没有后续选项。")}</p>}
        </>}
        {!legacy&&related.size>0&&<details className="play-player-state"><summary>{t("玩家状态 ")}<small>{related.size}{t(" 项")}</small></summary><div>{states(related)}</div></details>}
        {inputs?.card_trial?.actions.length>=128&&<p className="preview-notice">{t("本轮已达到 128 次操作，请重新试玩。")}</p>}
        {!!p.result?.diagnostics.length&&<div className="preview-notice danger" role="alert">{tm(p.result.diagnostics.at(-1).message)}<button onClick={()=>setView('debug')}>{t("查看调试信息")}</button></div>}
      </>:view==='records'?<>
        {undoAvailable&&<div className="play-delete-feedback" role="status"><span>{t("已删除「")}{lastDeleted.name}」</span><button disabled={p.saving} onClick={()=>changeDeleted(lastDeleted,false)}>{t("撤销删除")}</button></div>}
        {!selectedRecord&&<div className="play-record-toolbar">{onGlobalRecords&&<button className="play-text-button" onClick={onGlobalRecords}>{t("查看全工程试玩记录")}</button>}<div className="play-record-scope"><strong>{showDeleted?t("已删除记录"):t("此人物的试玩记录")}</strong><button className="play-text-button" onClick={()=>{setShowDeleted(!showDeleted);setSaveForm(false);setNotice('');}}>{showDeleted?t("返回记录"):t("已删除 {0}", [recordLists.deleted.length])}</button></div><p className="preview-help">{showDeleted?t("保存在本地项目中，可以随时恢复。"):t("保存在本地项目中，点击记录查看。")}</p>{!showDeleted&&!saveForm&&<button className="secondary" disabled={!saveable} onClick={openSave}>{p.alreadySaved?t("本次试玩已保存"):t("保存本次试玩")}</button>}</div>}
        {saveForm&&<form className="play-save-form" onSubmit={e=>{e.preventDefault();save();}}><label>{t("记录名称")}<input autoFocus aria-label={t("试玩记录名称")} maxLength={150} value={recordName} disabled={p.saving} onChange={e=>setRecordName(e.target.value)}/></label><div><button className="primary" disabled={!recordName.trim() || !saveable}>{p.saving?t("保存中…"):t("保存新记录")}</button><button type="button" className="secondary" disabled={p.saving} onClick={()=>setSaveForm(false)}>{t("取消")}</button></div></form>}
        {selectedRecord?<section className="play-record-detail"><div className="play-record-detail-actions"><button className="play-text-button" onClick={()=>setSelectedRecord(null)}>{t("← 返回记录列表")}</button><button className="play-record-delete" disabled={p.saving} aria-label={t("{0}试玩记录 {1}", [selectedDeleted?t("恢复"):t("删除"), selectedRecord.name])} onClick={()=>changeDeleted(selectedRecord,!selectedDeleted)}>{selectedDeleted?t("恢复记录"):<><Trash size={13}/>{t("删除")}</>}</button></div><h3>{selectedRecord.name}</h3><p className="preview-help">{selectedRecord.character_name} · {selectedRecord.scene_name}<br/>{selectedRecord.created_at?new Date(selectedRecord.created_at).toLocaleString('zh-CN'):t("旧版保存记录")}{selectedRecord.content_revision?t(" · 剧情 v{0}", [selectedRecord.content_revision]):''}</p><details className="play-record-conditions"><summary>{t("当时的测试条件")}</summary><p>{clockLabel(selectedRecord.inputs.at_tick,c.world.clock_unit)} · {selectedRecord.scene_name}</p>{Object.entries(selectedRecord.initial_variables || selectedRecord.inputs.variable_overrides).map(([key,value])=><p key={key}>{selectedRecord.variable_labels?.[key] || c.variables.find(v=>v.id===key)?.name || key}：{value===true?t("是"):value===false?t("否"):String(value)}</p>)}</details>{selectedRecord.legacy?<LegacyPath local={local} readOnly={selectedDeleted} record={selectedRecord} content={c}/>:selectedRecord.transcript.map((frame,index)=><article className={`play-history-frame ${frame.kind}`} key={index}><small>{frame.speaker || frame.label || t("试玩")}{frame.kind==='npc'&&` · ${frame.label}`}</small><p>{frame.text}</p></article>)}<p className="preview-help">{t("沿用玩家设置，从开场重新试玩，旧记录保持不变。")}</p><button className="secondary" disabled={disabled || selectedDeleted || !c.dialogues.some(g=>g.id===(recordDialogueId(selectedRecord) || draft?.id))} onClick={()=>{onReplayRecord(selectedRecord);setView('play');setSelectedRecord(null);}}>{t("按当前剧情重新试玩")}</button>{!c.dialogues.some(g=>g.id===(recordDialogueId(selectedRecord) || draft?.id))&&<p className="preview-help">{t("原对白已移除，仍可查看已保存的文字。")}</p>}</section>:<div className="play-record-list">{records.map(record=><article className="play-record-row" key={playRecordKey(record)}><button className="play-record-open" onClick={()=>{setSelectedRecord(record);setSaveForm(false);}}><strong>{record.name}</strong><span>{record.character_name} · {record.scene_name}</span><small>{record.legacy?t("旧记录 · 操作路径"):t("{0} · {1} 次选择", [new Date(record.created_at).toLocaleString('zh-CN'), record.transcript.filter(f=>f.kind==='player').length])}</small><ArrowRight size={13}/></button><button className="play-record-delete" disabled={p.saving} aria-label={t("{0}试玩记录 {1}", [showDeleted?t("恢复"):t("删除"), record.name])} title={showDeleted?t("恢复记录"):t("删除记录（可恢复）")} onClick={()=>changeDeleted(record,!showDeleted)}>{showDeleted?t("恢复"):<Trash size={15}/>}</button></article>)}{!records.length&&<p className="preview-help">{showDeleted?t("没有已删除的记录。"):t("还没有保存的试玩记录。完成试玩后，在这里保存。")}</p>}</div>}
      </>:<div className="preview-debug"><button className="play-text-button" onClick={()=>setView('play')}>{t("← 返回对白试玩")}</button><h3>{t("调试信息")}</h3><p className="preview-help">{t("卡片试玩直接从指定卡片开始；“验证剧情入口”会执行条件开场。两者都检查人物出场、卡片和选项条件。")}</p><details><summary>{t("全部玩家变量")}</summary>{states(new Set(c?.variables.map(v=>v.id)))}</details>{p.result?.diagnostics.map((row,index)=><p className="preview-notice danger" key={index}>{tm(row.message)}</p>)}{active&&<section><h3>{t("当前卡片条件")}</h3><Reason value={active.reason}/>{active.entry_preview&&<details><summary>{t("实际剧情入口：")}{active.entry_preview.node_label}</summary><Reason value={active.entry_preview.reason}/></details>}</section>}<section><h3>{t("执行过程")}</h3>{p.result?.log.map((row,index)=><details key={index}><summary>{row.name}</summary><Reason value={row.reason}/>{row.changes.map((change,i)=><p key={i}>{change.path}：{String(change.before)} → {String(change.after)}</p>)}</details>)}</section></div>}
    </div>
    {view!=='records'&&<footer className="preview-footer play-main-footer"><button className="primary" disabled={disabled || !inputs || !draft || (!started&&!active?.available)} onClick={()=>{p.restart(inputs.card_trial?.start_node_id || null,inputs.card_trial?.use_entry_routes || false);setNotice('');setView('play');}}>{started?<ArrowCounterClockwise size={15}/>:<Play size={15}/>} {started?t("重新试玩"):t("开始试玩")}</button><small role="status">{t(notice || "本次调整仅用于试玩 · 随时切换页面")}</small></footer>}
  </aside>;
}
