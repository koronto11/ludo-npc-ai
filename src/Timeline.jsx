import { useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Eye, LockKey, Flag, ChatText, User, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { eventHasOccurred, getCharacterState } from './project';
import { isSeed } from './projectBridge';

export function Timeline({ project, onScenario, tab, setTab, playing, onPlay, onSelect, issues }) {
  const rulerRef = useRef(null);
  if (!isSeed(project)) return <DefinitionTimeline project={project} onSelect={onSelect} tab={tab} setTab={setTab} issues={issues} />;
  const { scenario } = project;
  const retaliation = project.entities.find(item => item.id === 'retaliation');
  const relic = project.entities.find(item => item.id === 'relic');
  const branchAllowsRetaliation = !retaliation.requiresEvidence || scenario.evidence;
  const threatened = eventHasOccurred(retaliation, scenario);
  const day = scenario.day;
  const stateClips = [];
  for (let date = 1; date <= 5; date++) {
    const name = getCharacterState({ ...project, scenario: { ...scenario, day: date } }, 'eve').phase;
    const previous = stateClips.at(-1);
    if (previous?.name === name) previous.end = date + 1;
    else stateClips.push({ name, start: date, end: date + 1 });
  }
  const seek = event => {
    const rect = rulerRef.current.getBoundingClientRect();
    const fraction = Math.min(.999, Math.max(0, (event.clientX - rect.left) / rect.width));
    onScenario({ day: Math.floor(fraction * 5) + 1 });
  };
  const tracks = [
    { name: '世界事件', icon: Flag, type: 'event', clips: [{ name: '船员失踪', start: 1, end: 1.95 }, { name: '遗物出现', start: relic.day, end: Math.min(6, relic.day + .8), id: relic.id, disabled: relic.enabled === false }, { name: '公会报复', start: retaliation.day, end: Math.min(6, retaliation.day + .9), id: retaliation.id, disabled: !branchAllowsRetaliation || retaliation.enabled === false }] },
    { name: '伊芙 · 状态', icon: User, type: 'state', clips: stateClips },
    { name: '对话与文本', icon: ChatText, type: 'dialogue', clips: [{ name: '初次问诊', start: 1, end: 1.7 }, { name: '遗物对话', start: relic.day, end: Math.min(6, relic.day + .8) }, ...(branchAllowsRetaliation && retaliation.enabled !== false ? [{ name: '诊所信件', start: retaliation.day, end: Math.min(6, retaliation.day + .55) }, { name: '灯塔见面', start: Math.min(5.5, retaliation.day + .6), end: Math.min(6, retaliation.day + 1.25), id: 'lighthouse' }] : [])] },
  ];
  return <section className="timeline-dock" aria-label="故事时间线">
    <div className="timeline-toolbar">
      <div className="dock-tabs">
        {['故事时间线', '生成记录', '问题检查'].map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}{name === '问题检查' && issues.length > 0 && <span className="count">{issues.length}</span>}</button>)}
      </div>
      <div className="transport">
        <button className="icon-button transport-play" onClick={onPlay} aria-label={playing ? '暂停预演' : '播放时间线'}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</button>
        <button className="icon-button" onClick={() => onScenario({ day: Math.max(1, day - 1) })} aria-label="前一天"><SkipBack /></button>
        <button className="icon-button" onClick={() => onScenario({ day: Math.min(5, day + 1) })} aria-label="后一天"><SkipForward /></button>
        <select aria-label="剧情分支" value={scenario.evidence ? 'public' : 'hidden'} onChange={event => onScenario({ evidence: event.target.value === 'public' })}><option value="public">分支：证据公开</option><option value="hidden">分支：隐瞒证据</option></select>
        <span className="current-time"><span className="status-dot" />第{day}天 · 18:00</span>
      </div>
      <span className="timeline-summary">{getCharacterState(project, 'eve').phase}</span>
    </div>
    {tab === '故事时间线' ? <div className="tracks">
      <div className="track-ruler"><span className="ruler-name">故事时间</span><div ref={rulerRef} onPointerDown={seek} className="ruler" role="slider" aria-label="时间线定位" aria-valuemin={1} aria-valuemax={5} aria-valuenow={day} tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onScenario({ day: Math.min(5, Math.max(1, day + (event.key === 'ArrowLeft' ? -1 : 1))) }); } }}>
        {[1, 2, 3, 4, 5].map(value => <button className={day === value ? 'selected-day' : ''} key={value} onClick={event => { event.stopPropagation(); onScenario({ day: value }); }}>第{value}天</button>)}
      </div></div>
      {tracks.map(track => <div className={`track-row ${track.type}`} key={track.name}><div className="track-name"><track.icon size={16} /><span>{track.name}</span><Eye size={13} /><LockKey size={12} /></div><div className="track-lane">
        {track.clips.map((clip, index) => <button key={`${clip.name}-${index}`} className={`track-clip ${clip.disabled ? 'disabled-clip' : ''}`} style={{ left: `${(clip.start - 1) / 5 * 100}%`, width: `${Math.max(.3, clip.end - clip.start) / 5 * 100}%` }} title={`${clip.name} · 第${clip.start}天${clip.disabled ? ' · 当前分支不触发' : ''}`} onClick={() => { onScenario({ day: Math.min(5, Math.floor(clip.start)) }); if (clip.id) onSelect(clip.id); }}>{clip.name}</button>)}
      </div></div>)}
      <div className="playhead" style={{ left: `calc(var(--track-label-width) + (100% - var(--track-label-width)) * ${(day - .5) / 5})` }}><span /></div>
    </div> : tab === '生成记录' ? <div className="timeline-list">{project.tasks.map(task => <div key={task.id}><CheckCircle /><strong>{task.name}</strong><span>{task.detail}</span><small>{task.status === 'draft' ? '模拟生成 · 待审核' : '已写入项目'}</small></div>)}</div> : <div className="timeline-list">{issues.length ? issues.map((issue, i) => <button key={i} onClick={() => issue.entityId && onSelect(issue.entityId)}><WarningCircle /><span>{issue.text}</span><small>{issue.type === 'info' ? '情境说明' : '待完善'}</small></button>) : <div><CheckCircle /><span>当前引用和角色目标检查通过</span><small>规则检查</small></div>}</div>}
    <div className="timeline-footnote">{threatened ? '公会报复已发生 · 角色状态与文本已同步' : retaliation.enabled === false ? '公会报复已停用' : `第${retaliation.day}天计划触发公会报复${!branchAllowsRetaliation ? ' · 当前分支不触发' : ''}`}<span>点击轨道定位 · 方向键切换日期</span></div>
  </section>;
}

function DefinitionTimeline({ project, onSelect, tab, setTab, issues }) {
  return <section className="timeline-dock" aria-label="故事时间线"><div className="timeline-toolbar"><div className="dock-tabs">{['故事时间线', '生成记录', '问题检查'].map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</div><span className="timeline-summary">剧情定义 · 通用预演引擎尚未接入</span></div>
    {tab === '故事时间线' ? <div className="definition-tracks">{[['世界事件', Flag, project.entities.filter(e => e.kind === 'event')], ['人物设定', User, project.entities.filter(e => e.kind === 'character')], ['对话与文本', ChatText, project.entities.filter(e => ['dialogue', 'text'].includes(e.kind))]].map(([name, Icon, rows]) => <div className="definition-track" key={name}><span><Icon size={15} />{name}</span><div>{rows.map(row => <button key={row.id} onClick={() => onSelect(row.id)}>{row.name}{row.kind === 'event' && <small>计划时间 {row.day}</small>}</button>)}{!rows.length && <small>尚未编写</small>}</div></div>)}</div> : <div className="timeline-list">{tab === '生成记录' ? project.tasks.map(task => <div key={task.id}><CheckCircle /><strong>{task.name}</strong><span>{task.detail}</span><small>模拟记录</small></div>) : issues.map((issue, i) => <button key={i} onClick={() => issue.entityId && onSelect(issue.entityId)}><WarningCircle /><span>{issue.text}</span></button>)}</div>}
    <div className="timeline-footnote">作者定义与初始状态已接入本地项目；日期执行、条件联动和回放属于下一批。</div></section>;
}

