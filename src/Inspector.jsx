import { useState } from 'react';
import { User, X, LockKey, Link, CaretRight, PencilSimple, MapPin, CheckCircle, ArrowCounterClockwise, Trash, Flag } from '@phosphor-icons/react';
import { kindIcons, kindLabels } from './Graph';
import { RuntimeConversation, runtimeCharacterState } from './Rehearsal';
import { isSeed } from './projectBridge';

export function Inspector({ project, selectedId, onEdit, onSelect, onClose, tab, setTab, onGenerate, onRemove, rehearsal, onAuthoring }) {
  const [expandedRelations, setExpandedRelations] = useState(false);
  const item = project.entities.find(actor => actor.id === selectedId);
  if (!item) return <aside className="inspector"><div className="empty-state"><User size={30} /><p>选择一个角色或故事对象</p></div></aside>;
  const Icon = kindIcons[item.kind];
  const state = runtimeCharacterState(project._document, rehearsal?.result, item.id);
  const related = project.relations.filter(edge => edge.source === item.id || edge.target === item.id);
  const field = (name, key, multiline = false) => <label className={`property-row field-${key} ${multiline ? 'multiline' : ''}`} key={key}><span>{name}</span>{multiline ? <textarea value={item[key] || ''} onChange={event => onEdit(item.id, { [key]: event.target.value })} /> : <input aria-label={name} value={item[key] || ''} onChange={event => onEdit(item.id, { [key]: event.target.value })} />}</label>;
  return <aside className="inspector" data-testid="inspector">
    <header className="inspector-header"><Icon size={31} weight={item.kind === 'character' ? 'fill' : 'regular'} /><div><input className="inspector-name" aria-label="名称" value={item.name} onChange={event => onEdit(item.id, { name: event.target.value })} /><p>{item.role} · {item.tier || kindLabels[item.kind]}</p></div><button className="icon-button close-inspector" onClick={onClose} aria-label="收起属性面板"><X /></button></header>
    <div className="inspector-tabs">{['设定', '状态', '生成'].map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="inspector-scroll">
      {tab === '生成' ? <section className="generation-info"><h3>从世界底稿生成</h3><p>引用当前世界的规则、角色关系与当前剧情阶段，生成可审核的文本草稿。</p><div className="mode-label">候选经审核后写入工程</div><button className="primary" onClick={() => onGenerate(item)}>生成草稿</button></section> : <>
        {tab === '设定' ? <div className="property-fields">
          {['character', 'location', 'faction'].includes(item.kind) ? field(item.kind === 'character' ? '身份' : '类型描述', 'role') : <div className="property-row"><span>类型</span><strong>{kindLabels[item.kind]}</strong></div>}
          {item.kind === 'character' ? <>{field('长期目标', 'goal')}{field('行为底线', 'boundary')}
            <div className="section-label">认知边界<CaretRight size={12} /></div>
            <div className="property-row"><span>初始已知</span><span>{item.knows || '未设置'}</span></div><button className="subtle-button" onClick={() => onAuthoring('initial')}>编辑初始地点与认知</button>{field('不知道', 'unknown', true)}
          </> : field('内容', 'summary', true)}
          {item.kind === 'event' && <div className="event-rules"><div className="section-label">触发条件<Flag size={14} /></div>
            <label className="property-row"><span>计划时间</span><input aria-label="事件计划日期" type="number" min="0" step="1" value={item.day} onChange={event => onEdit(item.id, { day: Number(event.target.value) })} /></label>
            {isSeed(project) && <label className="checkbox-label"><input type="checkbox" checked={item.requiresEvidence} onChange={event => onEdit(item.id, { requiresEvidence: event.target.checked })} />仅在证据公开时触发</label>}
            <label className="checkbox-label"><input type="checkbox" checked={item.enabled !== false} onChange={event => onEdit(item.id, { enabled: event.target.checked })} />启用这个事件</label>
            <div className="event-state"><CheckCircle size={15} />{{ occurred:'当前分支：已发生',blocked:'当前分支：等待条件',scheduled:'当前分支：尚未到时',disabled:'已停用' }[rehearsal?.result?.events.find(e => e.id === item.id)?.status] || '计算中'}</div>
            <p className="muted-text">修改定义后，所有分支按新版本重新计算。</p>
          </div>}
          {item.kind === 'dialogue' && field('对话文本', 'text', true)}
        </div> : <div className="state-sheet"><div className="section-label">{`故事时间 ${rehearsal?.branch?.at_tick ?? 0} · 通用预演状态`}</div>{state ? <><p><MapPin />{state.location}</p><label>当前行为<strong>{state.behavior}</strong></label><label>当前认知<span>{state.knowledge}</span></label><label>变化来源{state.causes.map(cause => <span key={cause}><CheckCircle size={14} />{cause}</span>)}</label></> : <p>{item.kind === 'event' ? rehearsal?.result?.events.find(e => e.id === item.id)?.status === 'occurred' ? '这个事件已发生。' : '这个事件尚未触发。' : '该对象没有动态人物状态。'}</p>}</div>}
        <section className="related-section"><div className="section-label">关联对象<CaretRight size={12} /><span className="section-count">{related.length}</span></div>{(expandedRelations ? related : related.slice(0, 3)).map(edge => {
          const otherId = edge.source === item.id ? edge.target : edge.source;
          const other = project.entities.find(actor => actor.id === otherId);
          return <button key={edge.id} className="related-row" onClick={() => onSelect(otherId)}><Link size={15} /><span>{other?.name}</span><small>{edge.label}</small><CaretRight size={12} /></button>;
        })}{related.length > 3 && <button className="more-relations" onClick={() => setExpandedRelations(!expandedRelations)}>{expandedRelations ? '收起更多关系' : `另有 ${related.length - 3} 条关联`}<CaretRight size={12} /></button>}{!related.length && <p className="muted-text">拖拽卡片连接点，建立人物关系。</p>}</section>
        {item.kind === 'character' && <RuntimeConversation rehearsal={rehearsal} characterId={item.id} />}
        {item.kind === 'event' && <section className="affected-section"><div className="section-label">受影响角色</div>{(item.affects || []).map(id => { const actor = project.entities.find(e => e.id === id); const current = runtimeCharacterState(project._document, rehearsal?.result, id); return <button key={id} onClick={() => onSelect(id)}><User size={17} /><span>{actor?.name}<small>{current?.behavior}</small></span><CaretRight /></button>; })}</section>}
        {['event','dialogue','text'].includes(item.kind) && <button className="secondary" onClick={() => onAuthoring(item.id)}>编排条件与效果</button>}<div className="inspector-footer"><button className="subtle-button" onClick={() => onEdit(item.id, { locked: !item.locked })}><LockKey size={14} />{item.locked ? '设定已确认' : '标记为已确认'}</button>{!['eve', 'relic', 'retaliation'].includes(item.id) && <button className="icon-button danger" onClick={() => onRemove(item)} aria-label="删除对象"><Trash size={16} /></button>}</div>
      </>}
    </div>
  </aside>;
}
