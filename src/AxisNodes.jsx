import {MoreDetails,DraftCloseGuard,useDraftClose} from './MoreDetails';
import {localizeLabels} from './i18n.js';
import { t, tm, useI18n } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, ChatText, Sword, Moon, MapPin, Star, Warning, Minus, PencilSimple, Trash, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { clone, uid, moveAnchor } from './planning';

export const axisColors = localizeLabels([
  ['default', '默认', '#a98a69'], ['copper', '铜色', '#d2a275'], ['red', '红色', '#d5867e'],
  ['amber', '琥珀', '#d7bb6c'], ['green', '绿色', '#8cbb98'], ['blue', '蓝色', '#82aecb'], ['purple', '紫色', '#b19acb'],
]);
export const axisIcons = localizeLabels([
  ['none', '无图标', Minus], ['flag', '旗帜', Flag], ['chat', '交谈', ChatText], ['swords', '战斗', Sword],
  ['moon', '月亮', Moon], ['map', '地点', MapPin], ['star', '星标', Star], ['warning', '警示', Warning],
]);
export const axisColor = node => axisColors.find(([id]) => id === node.color)?.[2] || axisColors[0][2];
export function AxisIcon({ node }) {
  useI18n();
  if (!node.icon || node.icon === 'none') return null;
  const entry = axisIcons.find(([id]) => id === node.icon);
  if (!entry) return null;
  const Icon = entry[2];
  return <Icon className="axis-node-icon" size={14} aria-label={entry[1]}/>;
}
export function AxisMarkerPicker({ node, onChange, label, menu = false, disabled = false }) {
  useI18n();
  return <div className="axis-marker-picker">
    <div className="axis-marker-caption">{t("标记颜色")}</div>
    <div className="axis-color-options" role={menu ? 'group' : undefined} aria-label={t("{0}颜色", [label])}>
      {axisColors.map(([id, name, color]) => <button key={id} type="button" disabled={disabled} role={menu ? 'menuitemradio' : undefined} aria-checked={menu ? (node.color || 'default') === id : undefined} aria-pressed={!menu ? (node.color || 'default') === id : undefined} aria-label={t("{0}颜色：{1}", [label, name])} title={t(name)} className={(node.color || 'default') === id ? 'selected' : ''} style={{ '--node-color': color }} onClick={() => onChange({ color: id })}><span/>{(node.color || 'default') === id && <b>✓</b>}</button>)}
    </div>
    <div className="axis-marker-caption">{t("节点图标")}</div>
    <div className="axis-icon-options" role={menu ? 'group' : undefined} aria-label={t("{0}图标", [label])}>
      {axisIcons.map(([id, name, Icon]) => <button key={id} type="button" disabled={disabled} role={menu ? 'menuitemradio' : undefined} aria-checked={menu ? (node.icon || 'none') === id : undefined} aria-pressed={!menu ? (node.icon || 'none') === id : undefined} aria-label={t("{0}图标：{1}", [label, name])} title={t(name)} className={(node.icon || 'none') === id ? 'selected' : ''} onClick={() => onChange({ icon: id })}><Icon size={16}/><span>{t(name)}</span></button>)}
    </div>
  </div>;
}
export function AxisNodeMenu({ context, node, busy, onClose, onEdit, onMark, onRemove, onOrder, first, last }) {
  useI18n();
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: context.x, top: context.y });
  const label = context.kind === 'anchors' ? '时间锚点' : '场景';
  useLayoutEffect(() => {
    const box = ref.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(context.x, window.innerWidth - box.width - 8)), top: Math.max(8, Math.min(context.y, window.innerHeight - box.height - 8)) });
    ref.current.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [context]);
  useEffect(() => {
    const outside = event => { if (!ref.current?.contains(event.target)) onClose(false); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    const scrollIntent = event => { if (!ref.current?.contains(event.target)) onClose(false); };
    const resize = () => onClose(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    window.addEventListener('wheel', scrollIntent, { capture: true, passive: true });
    window.addEventListener('touchmove', scrollIntent, { capture: true, passive: true });
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', resize); window.removeEventListener('wheel', scrollIntent, true); window.removeEventListener('touchmove', scrollIntent, true); };
  }, [onClose]);
  return createPortal(<div ref={ref} role="menu" aria-label={t("{0}节点菜单", [label])} className="axis-context-menu" style={position} onContextMenu={e => e.preventDefault()} onKeyDown={e => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Tab') { onClose(); return; }
    const items = [...ref.current.querySelectorAll('button[role]:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }}>
    <header><AxisIcon node={node}/><strong>{node.name}</strong><small>{label}</small></header>
    <button role="menuitem" disabled={busy} className="axis-menu-action" onClick={onEdit}><PencilSimple/>{t("编辑")}{label}</button>
    <AxisMarkerPicker node={node} label={label} menu disabled={busy} onChange={onMark}/>
    {context.kind === 'tracks' && <div className="axis-menu-order"><button role="menuitem" disabled={busy || first} onClick={() => onOrder(-1)}><ArrowUp/>{t("上移场景")}</button><button role="menuitem" disabled={busy || last} onClick={() => onOrder(1)}><ArrowDown/>{t("下移场景")}</button></div>}
    <button role="menuitem" disabled={busy} className="axis-menu-action axis-menu-delete" onClick={onRemove}><Trash/>{t("删除")}{label}</button>
    <p>{context.kind === 'anchors' ? t("解除出场绑定，保留原有时间。") : t("人物出场移入“待安排场景”。")}{t("可撤销。")}</p>
  </div>, document.body);
}
export function AxisNodeModal({ kind, node, creating, level, content, onClose, onSave }) {
  useI18n();
  const [value, setValue] = useState(() => node ? clone(node) : kind === 'anchors'
    ? { id: uid('anchor'), name: '', tick: Math.max(content.initial_state.tick, ...level.anchors.map(a => a.tick)) + 5, color: 'default', icon: 'none' }
    : { id: uid('track'), name: '', location_id: content.locations[0]?.id || '', color: 'default', icon: 'none' });
  const [locationName, setLocationName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = useRef(null);
  const label = t(kind === 'anchors' ? '时间锚点' : '场景');
  useEffect(() => { field.current?.focus(); field.current?.select(); }, []);
  const [base]=useState(()=>clone(level));
  const [initial]=useState(value);
  const guard=useDraftClose(JSON.stringify(value)!==JSON.stringify(initial)||!!locationName.trim(),busy,onClose);
  const close=guard.close;
  const save=async()=>{
      const name = value.name.trim();
      if (!name) { setError(t("名称不能为空"));guard.setClosing(false);return; }
      setBusy(true); setError('');
      try {
        let row = { ...value, name }; let locations = []; let next = base;
        if (kind === 'anchors') {
          if (!Number.isSafeInteger(row.tick) || row.tick < 0) throw new Error(t("时间必须是非负整数"));
          next = creating ? { ...base, anchors: [...base.anchors, row] } : moveAnchor(base, row.id, row.tick);
        } else if (!row.location_id) {
          const name = locationName.trim() || row.name;
          const existing = content.locations.find(l => l.name === name);
          const location = existing || { kind: 'location', id: uid('location'), name };
          row.location_id = location.id;
          if (!existing) locations = [location];
        }
        next = { ...next, [kind]: creating ? (kind === 'anchors' ? next.anchors : [...next.tracks, row]) : next[kind].map(item => item.id === row.id ? row : item) };
        await onSave(next, locations, row.id, base);
      } catch (reason) { setError(reason.message);guard.setClosing(false);setBusy(false); }
  };
  return <Modal title={t(creating?'追加{0}':'编辑{0}',[t(label)])} subtitle={kind === 'anchors' ? t("修改时间会同步绑定的出场端点；颜色与图标可自由定义。") : t("场景轨道关联世界地点；颜色与图标帮助区分特殊节点。")} onClose={close}>
    <DraftCloseGuard guard={guard} busy={busy} onSave={save} onClose={onClose}/>
    <form className="axis-node-form" inert={guard.closing?true:undefined} onSubmit={e=>{e.preventDefault();save();}}>

      <fieldset disabled={busy}><label className="form-field">{label}{t("名称")}<input ref={field} required maxLength={150} aria-label={t("{0}名称", [label])} value={value.name} onChange={e => setValue({ ...value, name: e.target.value })}/></label>
        {kind === 'anchors' ? <label className="form-field">{t("时间位置")}<input type="number" required min={0} step={1} aria-label={t("锚点时间位置")} value={value.tick} onChange={e => setValue({ ...value, tick: e.target.value === '' ? '' : Number(e.target.value) })}/></label>
          : <><label className="form-field">{t("关联地点")}<select aria-label={t("场景关联地点")} value={value.location_id} onChange={e => setValue({ ...value, location_id: e.target.value })}>{content.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}<option value="">{t("新建世界地点…")}</option></select></label>{!value.location_id && <label className="form-field">{t("新地点名称")}<input maxLength={150} aria-label={t("新地点名称")} placeholder={t("留空时使用场景名称")} value={locationName} onChange={e => setLocationName(e.target.value)}/></label>}</>}
        <MoreDetails value={value} disabled={busy} onChange={patch=>setValue({...value,...patch})}/><AxisMarkerPicker node={value} label={label} onChange={patch => setValue({ ...value, ...patch })}/>
      </fieldset>
      {error && <p role="alert" className="danger">{tm(error)}</p>}
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={close}>{t("取消")}</button><button className="primary" disabled={busy}>{busy ? t("保存中…") : creating ? t("追加{0}", [label]) : t("保存节点")}</button></div>
    </form>
  </Modal>;
}
