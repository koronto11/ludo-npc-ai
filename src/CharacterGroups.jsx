import { t, tm, useI18n } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tag, ArrowRight, ArrowCounterClockwise, Plus, Trash, PencilSimple, Users, Sparkle } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { characterGroups, groupName } from './characterGroupCommands';

function useGroupDraft(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
function MixedCheck({ checked, mixed, label, onChange }) {
  useI18n();
  const ref = useRef(null);
  useEffect(() => { ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" aria-label={label} aria-checked={mixed ? 'mixed' : checked} checked={checked} onChange={e => onChange(e.target.checked)}/>;
}
export function CharacterGroupMenu({ context, onClose, onManage, onMove, onStory, onEdit }) {
  useI18n();
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: context.x, top: context.y });
  useLayoutEffect(() => {
    const box = ref.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(context.x, innerWidth - box.width - 8)), top: Math.max(8, Math.min(context.y, innerHeight - box.height - 8)) });
    ref.current.querySelector('button')?.focus({ preventScroll: true });
  }, [context]);
  useEffect(() => {
    const outside = e => { if (!ref.current?.contains(e.target)) onClose(false); };
    const resize = () => onClose(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('wheel', outside, { capture: true, passive: true });
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('wheel', outside, true); window.removeEventListener('resize', resize); };
  }, [onClose]);
  return createPortal(<div ref={ref} style={position} role="menu" aria-label={t("人物操作菜单")} className="character-group-menu" onContextMenu={e => e.preventDefault()} onKeyDown={e => {
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onClose(); }
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); const items = [...ref.current.querySelectorAll('button:not(:disabled)')]; const current = items.indexOf(document.activeElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}><header>{context.name}</header>{onEdit&&<button role="menuitem" onClick={onEdit}><PencilSimple/>{t("编辑人物档案")}</button>}{onStory&&<button role="menuitem" onClick={onStory}><Sparkle/>{t("生成人物故事")}</button>}<button role="menuitem" onClick={onManage}><Tag/>{t("管理分组")}</button><button role="menuitem" disabled={!context.hasGroups} title={context.hasGroups ? t("替换一个分组归属") : t("先加入分组")} onClick={onMove}><ArrowRight/>{t("移动分组")}</button></div>, document.body);
}
export function MembershipModal({ characters, ids, onClose, onSave }) {
  useI18n();
  const rows = characters.filter(row => ids.includes(row.id));
  const [changes, setChanges] = useState({}); const [created, setCreated] = useState([]); const [name, setName] = useState(''); const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useGroupDraft(Object.keys(changes).length > 0 || !!name.trim());
  const groups = [...new Set([...characterGroups(characters), ...created])];
  const close = () => { if (!busy) onClose(); };
  const add = () => { try { const next = groupName(name); setCreated(v => [...new Set([...v, next])]); setChanges(v => ({ ...v, [next]: true })); setName(''); setQuery(''); setError(''); } catch (reason) { setError(reason.message); } };
  return <Modal title={rows.length === 1 ? t("{0} · 管理分组", [rows[0].name]) : t("管理 {0} 人的分组", [rows.length])} subtitle={t("勾选加入，取消勾选移出；一个人物可以属于多个分组。")} onClose={close}>
    <form className="character-group-form" onSubmit={async e => { e.preventDefault(); if (name.trim()) { setError(t("请先点击“添加分组”或清空名称输入")); return; } setBusy(true); try { await onSave({ type: 'membership', ids, changes }); onClose(); } catch (reason) { setError(reason.message); setBusy(false); } }}>
      <fieldset disabled={busy}><div className="group-member-summary"><Users size={16}/>{rows.map(row => row.name).join('、')}</div>
        {rows.length > 1 && <p className="muted-text">{t("横线表示部分人物所属；保持不动会保留各自归属，勾选则全部加入，取消则全部移出。")}</p>}
        <input aria-label={t("搜索分组")} placeholder={t("搜索已有分组")} value={query} onChange={e => setQuery(e.target.value)}/>
        <div className="membership-list">{groups.filter(g => g.includes(query.trim())).map(g => {
          const count = rows.filter(row => row.tags.includes(g)).length;
          const touched = Object.hasOwn(changes, g); const checked = touched ? changes[g] : count === rows.length;
          const mixed = !touched && count > 0 && count < rows.length;
          return <label key={g}><MixedCheck label={t("所属分组 {0}", [g])} checked={checked} mixed={mixed} onChange={checked => { setChanges(v => ({ ...v, [g]: checked })); setError(''); }}/><span>{g}</span><small>{touched ? checked ? t("{0}/{1} 人", [rows.length, rows.length]) : t("0 人") : t("{0}/{1} 人", [count, rows.length])}</small></label>;
        })}{!groups.length && <p className="muted-text">{t("还没有分组，在下方添加第一个。")}</p>}{groups.length > 0 && !groups.some(g => g.includes(query.trim())) && <p className="muted-text">{t("没有匹配的分组。")}</p>}</div>
        <div className="group-add-row"><input aria-label={t("新分组名称")} maxLength={150} placeholder={t("新分组名称")} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.nativeEvent.isComposing && e.keyCode !== 229) add(); } }}/><button type="button" className="secondary" disabled={!name.trim()} onClick={add}><Plus/>{t("添加分组")}</button></div>
      </fieldset>{error && <p className="danger" role="alert">{tm(error)}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={close}>{t("取消")}</button><button className="primary" disabled={busy || !rows.length}>{busy ? t("保存中…") : t("保存分组")}</button></div>
    </form>
  </Modal>;
}
export function MoveGroupModal({ characters, ids, initialSource, onClose, onSave }) {
  useI18n();
  const rows = characters.filter(row => ids.includes(row.id));
  const sources = characterGroups(rows); const groups = characterGroups(characters);
  const [source, setSource] = useState(sources.includes(initialSource) ? initialSource : sources[0] || ''); const [target, setTarget] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useGroupDraft(!!target.trim());
  const count = rows.filter(row => row.tags.includes(source)).length;
  return <Modal title={t("移动人物分组")} subtitle={t("替换一个分组归属，保留人物的其他分组与出场安排。")} onClose={() => { if (!busy) onClose(); }}>
    <form className="character-group-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onSave({ type: 'move', ids, source, target }); onClose(); } catch (reason) { setError(reason.message); setBusy(false); } }}>
      <fieldset disabled={busy}><div className="group-member-summary">{t("已选 ")}{rows.length}{t(" 人；其中 ")}{count}{t(" 人属于原分组")}</div><label className="form-field">{t("原分组")}<select aria-label={t("移动原分组")} required value={source} onChange={e => setSource(e.target.value)}><option value="" disabled>{t("选择原分组")}</option>{sources.map(g => <option key={g}>{g}</option>)}</select></label><label className="form-field">{t("目标分组")}<input aria-label={t("移动目标分组")} required maxLength={150} list="move-character-groups" placeholder={t("选择已有名称，或输入新分组")} value={target} onChange={e => setTarget(e.target.value)}/><datalist id="move-character-groups">{groups.filter(g => g !== source).map(g => <option key={g} value={g}/>)}</datalist></label><p className="muted-text">{t("只有属于“")}{source || t("原分组")}{t("”的人物会移动，其余所选人物保留原样。")}</p></fieldset>
      {error && <p className="danger" role="alert">{tm(error)}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t("取消")}</button><button className="primary" disabled={busy || !count || !target.trim()}>{t("移动分组")}</button></div>
    </form>
  </Modal>;
}
export function GroupManagerModal({ characters, initialGroup, onClose, onSave, onUndo, canUndo }) {
  useI18n();
  const groups = characterGroups(characters);
  const [selected, setSelected] = useState(initialGroup || groups[0] || ''); const [name, setName] = useState(initialGroup || groups[0] || ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const current = groups.includes(selected) ? selected : groups[0] || '';
  const loaded = useRef(current);
  useEffect(() => { if (!busy && loaded.current !== current) { loaded.current = current; setSelected(current); setName(current); } }, [current, busy]);
  useGroupDraft(name !== current);
  const members = characters.filter(row => row.tags.includes(current));
  const run = async type => { setBusy(true); setError(''); try { if (type === 'undo') await onUndo(); else { await onSave({ type, source: current, target: name }); if (type === 'rename') setSelected(name.trim()); } } catch (reason) { setError(reason.message); } finally { setBusy(false); } };
  return <Modal title={t("管理全部分组")} subtitle={t("统一维护分组名称与成员归属；人物可属于多个分组。")} onClose={() => { if (!busy) onClose(); }} wide>
    <div className="group-manager"><div className="group-directory">{groups.map(g => <button disabled={busy} key={g} className={current === g ? 'selected' : ''} onClick={() => { setSelected(g); setError(''); }}><Tag size={15}/><span>{g}</span><small>{characters.filter(row => row.tags.includes(g)).length}{t(" 人")}</small></button>)}{!groups.length && <p>{t("还没有分组。勾选人物后，使用“管理分组”创建。")}</p>}</div>
      <div className="group-manager-detail">{current ? <><h3>{current} <small>{members.length}{t(" 人")}</small></h3><div className="group-member-chips">{members.map(row => <span key={row.id}>{row.name}</span>)}</div><form onSubmit={e => { e.preventDefault(); run('rename'); }}><label className="form-field">{t("分组名称")}<input aria-label={t("重命名分组")} required maxLength={150} disabled={busy} value={name} onChange={e => setName(e.target.value)}/></label>{groups.includes(name.trim()) && name.trim() !== current && <p className="muted-text">{t("已有同名分组，保存后合并成员；同一人物不会重复归组。")}</p>}<button className="secondary" disabled={busy || !name.trim() || name.trim() === current}><PencilSimple/>{t("保存分组名称")}</button></form><div className="group-dissolve"><p>{t("解散仅移除所有人物的这项分组归属，保留人物及其他分组，可撤销。")}</p><button className="subtle-button danger" disabled={busy} onClick={() => run('remove')}><Trash/>{t("解散当前分组")}</button></div></> : <p className="muted-text">{t("从人物卡片的“管理分组”中添加名称，并勾选成员。")}</p>}{error && <p className="danger" role="alert">{tm(error)}</p>}</div>
    </div><div className="modal-actions"><button className="secondary" disabled={busy || !canUndo} onClick={() => run('undo')}><ArrowCounterClockwise/>{t("撤销分组操作")}</button><button className="primary" disabled={busy} onClick={onClose}>{t("完成")}</button></div>
  </Modal>;
}
