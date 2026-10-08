import { t, tm, useI18n } from './i18n';
import { useState } from 'react';
import { activeSimulationCases } from './dialoguePlayModel';
import { ArrowCounterClockwise, ArrowRight, CaretDoubleDown, CaretDoubleUp, CheckCircle, Flag, Play, WarningCircle, MapPin } from '@phosphor-icons/react';
export const clockLabel = (tick, unit) => unit === 'day' ? t('第 {0} 天',[tick]) : unit === 'chapter' ? t('第 {0} 章',[tick]) : t('{0} 分钟',[tick]);
export function Reason({ value }) {
  useI18n();
  if (!value) return null;
  return <div className={`reason-row ${value.passed ? 'passed' : 'blocked'}`}><span>{value.passed ? '✓' : '○'} {tm(value.reason)}</span>{value.children?.length > 0 && <div>{value.children.map((child, i) => <Reason key={i} value={child} />)}</div>}</div>;
}
export function RehearsalControls({ rehearsal: r, compact = false }) {
  useI18n();
  const b = r.branch;
  if (!b) return null;
  const c = r.document.content;
  return <div className={`rehearsal-controls ${compact ? 'compact' : ''}`}>
    <label>{t("故事时间")}<input aria-label={t("通用预演时间")} type="number" min={c.initial_state.tick} step="1" value={b.at_tick} onChange={e => r.seek(e.target.value)} /></label>
    <span className="clock-unit">{c.world.clock_unit === 'day' ? t("天") : c.world.clock_unit === 'chapter' ? t("章") : t("分钟")}</span>
    <label>{t("当前场景")}<select aria-label={t("当前预演场景")} value={r.result?.state.scene_id || ''} onChange={e => r.scene(e.target.value)} disabled={r.busy}><option value="">{t("未指定")}</option>{c.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    {!compact && <><label>{t("已保存分支")}<select aria-label={t("已保存预演分支")} value={activeSimulationCases(r.document).some(c => c.id === b.id) ? b.id : ''} onChange={e => r.select(e.target.value)}><option value="">{t("临时分支")}</option>{activeSimulationCases(r.document).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="secondary" onClick={r.fork}>{t("从这里分叉")}</button><button className="primary" onClick={r.save}>{t("保存当前分支")}</button>{r.dirty && <button className="subtle-button" onClick={r.discard}>{t("放弃分支修改")}</button>}</>}
    <small>{r.busy ? t("重新计算中…") : r.error ? t("预演失败") : t("内容 v{0} · {1}", [r.result?.content_revision || c.revision || r.document.content_revision, r.dirty ? t("分支输入未保存") : t("分支输入已载入")])}</small>
  </div>;
}
export function RuntimeConversation({ rehearsal: r, characterId, dialogueId, expanded = false }) {
  useI18n();
  const related = (r.result?.dialogues || []).filter(d => dialogueId ? d.id === dialogueId : !characterId || !d.character_id || d.character_id === characterId);
  const active = related.find(d => d.id === r.selectedDialogue) || related.find(d => d.started) || related.find(d => d.available && d.options.length) || related.find(d => d.available) || related[0];
  if (r.error) return <p className="danger">{tm(r.error)}</p>;
  return <div className={`conversation ${expanded ? 'expanded-conversation' : ''}`}>
    <div className="section-label">{t("通用对话预演")}{related.length > 0 && <select aria-label={t("预演对话图")} value={active?.id || ''} onChange={e => r.setSelectedDialogue(e.target.value)}>{related.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}</div>
    {r.busy && <p className="muted-text">{t("按当前设定重新计算…")}</p>}
    {!active ? <p className="muted-text">{t("这个人物还没有对话图，可以在对话编排中创建。")}</p> : <>
      <blockquote>{active.closed ? t("本段对话已结束。") : active.available ? active.text : t("当前条件下没有可用对白。")}</blockquote>
      <div className="conversation-options">{active.options.map(option => <div key={option.id}><button disabled={!option.available || r.busy} onClick={() => r.record(active.id, option.id)} title={option.reason.reason}><ArrowRight size={14} />{option.text}{!option.available && <small>{t("条件未满足")}</small>}</button>{!option.available && <Reason value={option.reason}/>}</div>)}</div>
      <div className="rehearsal-actions"><button className="secondary" disabled={r.busy || !r.result?.complete || !active.available} onClick={() => r.record(active.id, null, active.started ? 'restart' : 'start')}><Play size={13} />{active.started ? t("重开对话") : t("开始对话")}</button>{active.closed && <button className="secondary" disabled={r.busy || !r.result?.complete} onClick={() => r.record(active.id, null, 'restart')}><ArrowCounterClockwise size={13} />{t("重新开始")}</button>}</div>
      <div className="condition-label">{t("节点条件")}</div><Reason value={active.reason} />
      <p className="muted-text">{active.available && active.started && !active.options.length ? t("已到达结束节点，可以重开对话。") : t("节点效果在进入时执行；浏览预演不会自动执行选项。")}</p>
    </>}
  </div>;
}
export function RehearsalWorkspace({ rehearsal: r, characterId, onEdit }) {
  useI18n();
  const [showVariables, setShowVariables] = useState(false);
  if (!r.branch || !r.document) return <div className="empty-state">{t("正在载入本地工程…")}</div>;
  const c = r.document.content;
  const actor = c.characters.find(a => a.id === characterId) || c.characters[0];
  const state = r.result?.state.characters[actor?.id];
  return <div className="rehearsal-workspace">
    <div className="workspace-heading"><div><small>{t("情境预演 / 确定性重放")}</small><h1>{r.branch.name}</h1><p>{t("人物设定保持独立，状态由时间、场景和选择记录计算。")}</p></div><button className="secondary" onClick={onEdit}>{t("编排剧情规则")}</button></div>
    <RehearsalControls rehearsal={r} />
    <div className="branch-details"><label>{t("分支名称")}<input aria-label={t("预演分支名称")} value={r.branch.name} onChange={e => r.change({ name: e.target.value })} /></label><button className="subtle-button" onClick={() => setShowVariables(!showVariables)}>{t("初始变量 ")}{showVariables ? t("收起") : t("展开")}</button><small>{t("修改初始变量会从起点重算整个分支")}</small></div>
    {showVariables && <div className="branch-variables">{c.variables.map(v => { const value = r.branch.variable_overrides[v.id] ?? c.initial_state.variables[v.id] ?? v.default; return <label key={v.id}>{v.name}{v.value_type === 'boolean' ? <input aria-label={t("分支变量 {0}", [v.name])} type="checkbox" checked={value} onChange={e => r.change({ variable_overrides: { ...r.branch.variable_overrides, [v.id]: e.target.checked } })} /> : <input aria-label={t("分支变量 {0}", [v.name])} type={v.value_type === 'number' ? 'number' : 'text'} value={value} onChange={e => r.change({ variable_overrides: { ...r.branch.variable_overrides, [v.id]: v.value_type === 'number' ? Number(e.target.value) : e.target.value } })} />}</label>; })}{!c.variables.length && <p className="muted-text">{t("先在剧情资料中定义变量。")}</p>}</div>}
    {r.error && <p className="danger" role="alert">{tm(r.error)}</p>}
    {r.result && !r.result.complete && <p className="danger" role="alert">{t("本轮达到执行上限，结果不完整。查看变化记录中的诊断。")}</p>}
    <div className="scenario-stage"><div className="state-overview"><span className="eyebrow">{actor?.name || t("尚无角色")}{t(" · 当前状态")}</span><h2><MapPin size={18} />{c.locations.find(l => l.id === state?.location_id)?.name || t("尚未设置地点")}</h2><p>{state?.behavior || t("尚未设置行为")}</p><div className="section-label">{t("现在知道的事实")}</div>{(state?.known_fact_ids || []).map(id => <p key={id}>{c.facts.find(f => f.id === id)?.description || c.facts.find(f => f.id === id)?.name}</p>)}{!state?.known_fact_ids.length && <p className="muted-text">{t("没有已授予的事实")}</p>}<div className="section-label">{t("当前变量")}</div>{c.variables.map(v => <p key={v.id}>{v.name} <strong>{String(r.result?.state.variables[v.id] ?? '')}</strong></p>)}</div><div className="scenario-dialogue"><RuntimeConversation rehearsal={r} characterId={actor?.id} expanded /></div></div>
    <section className="available-texts"><h3>{t("当前可用的非对话文本")}</h3>{r.result?.texts.filter(t => t.available).map(rowItem => <article key={rowItem.id}><h4>{rowItem.name}</h4><p>{rowItem.body}</p><Reason value={rowItem.reason} />{rowItem.unlocked && <small>{t("已由事件或规则解锁")}</small>}</article>)}{!r.result?.texts.some(t => t.available) && <p className="muted-text">{t("当前没有可用文本。")}</p>}</section>
  </div>;
}
export function RuntimeTimeline({ rehearsal: r, onSelect, tab, setTab, project, collapsed=false, onToggleCollapsed }) {
  useI18n();
  const events = r.result?.events || [];
  return <section className={`timeline-dock runtime-timeline ${collapsed ? 'dock-collapsed' : ''}`} aria-label={t("故事时间线")}><div className="timeline-toolbar"><div className="dock-tabs">{['故事时间线', '变化记录', '生成记录', '问题检查'].map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{t(name)}</button>)}</div>{r.branch && <div className="transport"><button aria-label={t("前一个故事时间")} onClick={() => r.seek(r.branch.at_tick - 1)}>‹</button><span>{clockLabel(r.branch.at_tick, r.document.content.world.clock_unit)}</span><button aria-label={t("后一个故事时间")} onClick={() => r.seek(r.branch.at_tick + 1)}>›</button><button className="subtle-button" onClick={() => setTab('变化记录')}>{t("重放 ")}{r.result?.steps ?? 0}{t(" 步")}</button></div>}{onToggleCollapsed&&<button className="icon-button timeline-toggle" title={t(collapsed?'展开底部面板':'收起底部面板')} aria-label={t(collapsed?'展开底部面板':'收起底部面板')} aria-expanded={!collapsed} aria-controls="runtime-timeline-content" onClick={onToggleCollapsed}>{collapsed?<CaretDoubleUp size={16}/>:<CaretDoubleDown size={16}/>}</button>}</div>
    <div className="runtime-tracks" id="runtime-timeline-content" hidden={collapsed}>{tab === '故事时间线' ? <><div className="runtime-track"><span><Flag size={15} />{t("剧情事件")}</span><div>{events.map(e => <button className={`event-${e.status}`} key={e.id} onClick={() => { r.seek(e.scheduled_at); onSelect(e.id); }} title={e.effect_problem || e.reason.reason}>{e.name}<small>{clockLabel(e.scheduled_at, r.document.content.world.clock_unit)} · {t({ occurred: '已发生', blocked: '条件等待', scheduled: '尚未到时', disabled: '已停用' }[e.status])}</small></button>)}{!events.length && <small>{t("尚无剧情事件")}</small>}</div></div><div className="runtime-track"><span>{t("人物与场景")}</span><div>{r.document?.content.characters.map(c => <button key={c.id} onClick={() => onSelect(c.id)}>{c.name}<small>{r.result?.state.characters[c.id]?.behavior || t("初始状态")}</small></button>)}</div></div><div className="runtime-track"><span>{t("当前可用文本")}</span><div>{r.result?.dialogues.filter(d => d.available).map(d => <button key={d.id} onClick={() => { r.setSelectedDialogue(d.id); onSelect(d.character_id || d.id); }}>{d.name}<small>{d.node_label}</small></button>)}{r.result?.texts.filter(t => t.available).map(t => <button key={t.id} onClick={() => onSelect(t.id)}>{t.name}</button>)}</div></div></> : tab === '变化记录' ? <div className="runtime-log">{r.result?.log.map((item, i) => <details key={i}><summary><CheckCircle size={13} />{clockLabel(item.tick, r.document.content.world.clock_unit)} · {item.name} <small>{item.changes.length}{t(" 项变化")}</small></summary><Reason value={item.reason} />{item.changes.map((change, i) => <p key={i}>{humanPath(change.path, r.document)}：{humanValue(change.before, r.document)} → {humanValue(change.after, r.document)}</p>)}</details>)}{!r.result?.log.length && <p className="muted-text">{t("该时间前没有已执行的变化。")}</p>}{r.result?.diagnostics.map((d,i) => <p className="danger" key={i}><WarningCircle size={14} />{d.tick} · {tm(d.message)}（{d.source_id}）</p>)}</div> : tab === '生成记录' ? <div>{project.tasks.map(t => <p key={t.id}>{t.name} · {t.detail}</p>)}<p className="muted-text">{t("模型任务与草稿差异请在草稿审核查看。")}</p></div> : <div>{r.error && <p className="danger">{tm(r.error)}</p>}{r.result?.diagnostics.map((d,i) => <p className="danger" key={i}>{tm(d.message)}（{d.source_id}）</p>)}{events.filter(e => e.effect_problem).map(e => <p className="danger" key={e.id}>{e.name}：{e.effect_problem}</p>)}{!r.error && !r.result?.diagnostics.length && !events.some(e => e.effect_problem) && <p className="muted-text">{t("本轮未发现执行错误。条件等待的事件不视为错误。")}</p>}</div>}</div></section>;
}
export function humanPath(path, document) { const [type,id,field] = path.split('.'); const row = Object.values(document.content).filter(Array.isArray).flat().find(v => v.id === id); return `${row?.name || id || t('场景')} · ${t(({ location_id:'地点', behavior:'行为',known_fact_ids:'认知' })[field] || (type === 'variables' ? '数值' : field || ''))}`; }
export function humanValue(value, document) { const rows = Object.values(document.content).filter(Array.isArray).flat(); const one = v => rows.find(r => r.id === v)?.name || String(v ?? t('未设置')); return Array.isArray(value) ? value.map(one).join('、') || t('无') : one(value); }

export function runtimeCharacterState(document, result, id) {
  const state=result?.state.characters[id];
  if(!state || !document) return null;
  const c=document.content;
  return { location:c.locations.find(l=>l.id===state.location_id)?.name || t('尚未设置地点'), behavior:state.behavior || t('尚未设置行为'), phase:state.behavior || t('初始状态'), knowledge:state.known_fact_ids.map(id=>c.facts.find(f=>f.id===id)?.description || c.facts.find(f=>f.id===id)?.name).join('；') || t('没有已授予的事实'), causes:result.log.filter(r=>r.changes.some(ch=>ch.path.startsWith(`characters.${id}.`))).map(r=>`${r.tick} · ${r.name}`) };
}
