import { t, tm, useI18n } from './i18n';
import { useState } from 'react';
import { User, X, LockKey, Link, CaretRight, PencilSimple, MapPin, CheckCircle, ArrowCounterClockwise, Trash, Flag } from '@phosphor-icons/react';
import { kindIcons, kindLabels } from './Graph';
import { runtimeCharacterState } from './Rehearsal';
import { appearancesFor, appearanceLabel } from './planning';
import { QuickNote } from './QuickNote';
import { plotsForActor } from './plotPlanning';

export function Inspector({ local, project, selectedId, onEdit, onSelect, onClose, tab, setTab, onGenerate, onRemove, rehearsal, onAuthoring, onLocate, onWorkbench, onEditProfile, onEditAsset }) {
  useI18n();
  const [expandedRelations, setExpandedRelations] = useState(false);
  const item = project.entities.find(actor => actor.id === selectedId);
  if (!item) return <aside className="inspector"><div className="empty-state"><User size={30} /><p>{t("选择一个角色或故事对象")}</p></div></aside>;
  const Icon = kindIcons[item.kind];
  const state = runtimeCharacterState(project._document, rehearsal?.result, item.id);
  const related = project.relations.filter(edge => edge.source === item.id || edge.target === item.id);
  const field = (name, key, multiline = false) => <label className={`property-row field-${key} ${multiline ? 'multiline' : ''}`} key={key}><span>{t(name)}</span>{multiline ? <textarea value={item[key] || ''} onChange={event => onEdit(item.id, { [key]: event.target.value })} /> : <input aria-label={t(name)} value={item[key] || ''} onChange={event => onEdit(item.id, { [key]: event.target.value })} />}</label>;
  return <aside className="inspector" data-testid="inspector">
    <header className="inspector-header"><Icon size={31} weight={item.kind === 'character' ? 'fill' : 'regular'} /><div><input className="inspector-name" aria-label={t("名称")} value={item.name} onChange={event => onEdit(item.id, { name: event.target.value })} /><p>{item.role || kindLabels[item.kind]}</p></div><button className="icon-button close-inspector" onClick={onClose} aria-label={t("收起属性面板")}><X /></button></header>
    <div className="inspector-tabs">{['关系', '设定', '状态', '生成'].map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{t(name)}</button>)}</div>
    <div className="inspector-scroll">
      {tab === '生成' ? <section className="generation-info"><h3>{t("从世界底稿生成")}</h3><p>{t("引用当前世界的规则、角色关系与当前剧情阶段，生成可审核的文本草稿。")}</p><div className="mode-label">{t("候选经审核后写入工程")}</div><button className="primary" onClick={() => onGenerate(item)}>{t("生成草稿")}</button></section> : <>
        {tab === '关系' && item.kind === 'character' && <div className="inspector-note"><QuickNote local={local} characterId={item.id} name={item.name} value={item.quickNote}/><p className="muted-text">{(item.tags || []).join(' · ') || t("尚未分组")}</p></div>}{tab === '设定' ? <div className="property-fields">
          {['character', 'location', 'faction'].includes(item.kind) ? field(item.kind === 'character' ? '身份' : '类型描述', 'role') : <div className="property-row"><span>{t("类型")}</span><strong>{t(kindLabels[item.kind])}</strong></div>}
          {item.kind === 'character' ? <><button className="secondary" onClick={()=>onEditProfile(item.id)}><PencilSimple/>{t("编辑完整人物档案")}</button>{field('长期目标', 'goal')}{field('行为底线', 'boundary')}
            <div className="section-label">{t("认知边界")}<CaretRight size={12} /></div>
            <div className="property-row"><span>{t("初始已知")}</span><span>{item.knows || t("未设置")}</span></div><button className="subtle-button" onClick={() => onAuthoring('initial')}>{t("编辑初始地点与认知")}</button>{field('不知道', 'unknown', true)}
          </> : <>{field('内容', 'summary', true)}{['location','faction'].includes(item.kind)&&<button className="secondary" onClick={()=>onEditAsset(item)}><PencilSimple/>{t('查看与编辑完整资料')}</button>}</>}
          {item.kind === 'event' && <div className="event-rules"><div className="section-label">{t("触发条件")}<Flag size={14} /></div>
            <label className="property-row"><span>{t("计划时间")}</span><input aria-label={t("事件计划日期")} type="number" min="0" step="1" value={item.day} onChange={event => onEdit(item.id, { day: Number(event.target.value) })} /></label>
            <label className="checkbox-label"><input type="checkbox" checked={item.enabled !== false} onChange={event => onEdit(item.id, { enabled: event.target.checked })} />{t("启用这个事件")}</label>
            <div className="event-state"><CheckCircle size={15} />{t({ occurred:'当前分支：已发生',blocked:'当前分支：等待条件',scheduled:'当前分支：尚未到时',disabled:'已停用' }[rehearsal?.result?.events.find(e => e.id === item.id)?.status] || '计算中')}</div>
            <p className="muted-text">{t("修改定义后，所有分支按新版本重新计算。")}</p>
          </div>}
          {item.kind === 'dialogue' && field('对话文本', 'text', true)}
        </div> : tab === '状态' ? <div className="state-sheet"><div className="section-label">{t("故事时间 {0} · 通用预演状态", [rehearsal?.branch?.at_tick ?? 0])}</div>{state ? <><p><MapPin />{state.location}</p><label>{t("当前行为")}<strong>{state.behavior}</strong></label><label>{t("当前认知")}<span>{state.knowledge}</span></label><label>{t("变化来源")}{state.causes.map(cause => <span key={cause}><CheckCircle size={14} />{cause}</span>)}</label></> : <p>{item.kind === 'event' ? rehearsal?.result?.events.find(e => e.id === item.id)?.status === 'occurred' ? t("这个事件已发生。") : t("这个事件尚未触发。") : t("该对象没有动态人物状态。")}</p>}</div> : null}
        <section className="related-section"><div className="section-label">{t("关联对象")}<CaretRight size={12} /><span className="section-count">{related.length}</span></div>{(expandedRelations ? related : related.slice(0, 3)).map(edge => {
          const otherId = edge.source === item.id ? edge.target : edge.source;
          const other = project.entities.find(actor => actor.id === otherId);
          return <button key={edge.id} className="related-row" onClick={() => onSelect(otherId)}><Link size={15} /><span>{other?.name}</span><small>{edge.label}</small><CaretRight size={12} /></button>;
        })}{related.length > 3 && <button className="more-relations" onClick={() => setExpandedRelations(!expandedRelations)}>{expandedRelations ? t("收起更多关系") : t("另有 {0} 条关联", [related.length - 3])}<CaretRight size={12} /></button>}{!related.length && <p className="muted-text">{t("拖拽卡片连接点，建立人物关系。")}</p>}</section>
        {item.kind === 'character' && <section className="inspector-appearances"><div className="section-label">{t("全部关卡出场")}</div>{appearancesFor(project._document.content,item.id).map(({level,appearance})=><article className="appearance-summary" key={`${level.id}-${appearance.id}`}><small>{appearanceLabel(level,appearance)}</small><div><button onClick={()=>onLocate(level.id,appearance.id,item.id)}>{t("定位关卡")}</button><button onClick={()=>onWorkbench(level,appearance)}>{t("对白 / 预演")}</button></div></article>)}<button className="secondary" onClick={()=>onWorkbench(null,null,item.id)}>{t("打开角色工作台")}</button></section>}
        {item.kind === 'character' && <section className="plot-linked-events"><h3>{t("关联剧情与规则")}</h3>{plotsForActor(project._document.content,item.id).map(event=><button className="secondary" key={event.id} onClick={()=>onAuthoring(event.id)}>{event.name}</button>)}{!plotsForActor(project._document.content,item.id).length&&<p className="muted-text">{t("尚无关联剧情。")}</p>}</section>}

        {item.kind === 'event' && <section className="affected-section"><div className="section-label">{t("受影响角色")}</div>{(item.affects || []).map(id => { const actor = project.entities.find(e => e.id === id); const current = runtimeCharacterState(project._document, rehearsal?.result, id); return <button key={id} onClick={() => onSelect(id)}><User size={17} /><span>{actor?.name}<small>{current?.behavior}</small></span><CaretRight /></button>; })}</section>}
        {['event','dialogue','text'].includes(item.kind) && <button className="secondary" onClick={() => onAuthoring(item.id)}>{t("编排条件与效果")}</button>}<div className="inspector-footer"><button className="subtle-button" onClick={() => onEdit(item.id, { locked: !item.locked })}><LockKey size={14} />{item.locked ? t("设定已确认") : t("标记为已确认")}</button><button className="icon-button danger" onClick={() => onRemove(item)} aria-label={t("删除对象")}><Trash size={16} /></button></div>
      </>}
    </div>
  </aside>;
}
