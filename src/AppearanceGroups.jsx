import {useState} from 'react';
import {t, tm, useI18n} from './i18n';
import {Modal} from './Modal';
import {DraftCloseGuard, useDraftClose} from './MoreDetails';
import {appearanceGroupLevel, groupMemberIds} from './appearanceGroups';
import {uid} from './planning';

export function AppearanceGroupEditor({level, content, group, trackId, selectedIds = [], onSave, onClose}) {
  useI18n();
  const [base] = useState(() => structuredClone(level));
  const [groupId] = useState(() => group?.id || uid('appearance-group'));
  const original = base.npc_groups?.find(g => g.id === groupId);
  const [initial] = useState(() => ({name:original?.name || '', trackId:original?.track_id || trackId || base.appearances.find(a => a.id === selectedIds[0])?.track_id || base.tracks[0]?.id || '', memberIds:original ? groupMemberIds(base, groupId) : selectedIds}));
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmDissolve, setConfirmDissolve] = useState(false);
  const [search, setSearch] = useState('');
  const dirty = value.name !== initial.name || value.trackId !== initial.trackId || JSON.stringify([...value.memberIds].sort()) !== JSON.stringify([...initial.memberIds].sort());
  const guard = useDraftClose(dirty, busy, onClose);
  const save = async (dissolve = false) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const next = appearanceGroupLevel(base, {id:groupId, name:value.name, trackId:value.trackId, memberIds:value.memberIds, dissolve});
      await onSave(next, base, groupId, !original, dissolve); onClose();
    } catch(reason) {setError(reason.message); guard.setClosing(false);}
    finally {setBusy(false);}
  };
  const available = base.appearances.filter(a => a.track_id === value.trackId);
  const visible = available.filter(a => {
    const actor=content.characters.find(c=>c.id===a.character_id);
    return `${actor?.name || ''} ${actor?.role || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });
  return <Modal title={original ? t('管理出场组成员') : t('组成出场组')} subtitle={t('只整理当前场景的出场；人物档案、独立时间和对白保持原样。')} className="appearance-group-modal" onClose={guard.close}>
    <DraftCloseGuard guard={guard} busy={busy} onSave={() => save()} onClose={onClose}/>
    <form inert={guard.closing ? true : undefined} onSubmit={e => {e.preventDefault(); save();}}>
      <fieldset className="appearance-group-body" disabled={busy}>
        <label className="form-field">{t('出场组名称')}<input maxLength={150} required value={value.name} onChange={e => setValue(v => ({...v, name:e.target.value}))}/></label>
        <label className="form-field">{t('场景')}<select disabled={!!original} value={value.trackId} onChange={e => setValue(v => ({...v, trackId:e.target.value, memberIds:[]}))}>{base.tracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
        <div className="appearance-member-heading"><strong>{t('选择人物出场')}</strong><span>{t('已选 {0} 位', [value.memberIds.length])}</span></div>
        <input aria-label={t('搜索出场成员')} placeholder={t('搜索姓名或身份')} value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="appearance-member-heading"><button type="button" className="subtle-button" onClick={()=>setValue(v=>({...v,memberIds:[...new Set([...v.memberIds,...visible.filter(a=>!a.npc_group_id||a.npc_group_id===groupId).map(a=>a.id)])]}))}>{t('选中搜索结果')}</button><button type="button" className="subtle-button" onClick={()=>setValue(v=>({...v,memberIds:[]}))}>{t('清空选择')}</button></div>
        <div className="appearance-member-list">{visible.map(a => {
          const actor = content.characters.find(c => c.id === a.character_id), other = a.npc_group_id && a.npc_group_id !== groupId;
          return <label className={`appearance-member-choice ${other ? 'unavailable' : ''}`} key={a.id}><input type="checkbox" disabled={!!other} checked={value.memberIds.includes(a.id)} onChange={e => setValue(v => ({...v, memberIds:e.target.checked ? [...v.memberIds, a.id] : v.memberIds.filter(id => id !== a.id)}))}/><span><strong>{actor?.name}</strong><small>{actor?.role} · {a.start_tick}–{a.end_tick}{a.condition?.op !== 'always' ? t(' · 有条件') : ''}</small></span>{other && <small>{t('已在组：{0}', [base.npc_groups.find(g => g.id === a.npc_group_id)?.name])}</small>}</label>;
        })}{!visible.length && <p className="muted-text">{t(available.length?'没有匹配的成员。':'当前场景暂无人物出场。')}</p>}</div>
        <p className="muted-text">{t('取消勾选将人物移出本组，恢复独立卡片。不会删除人物或对白，也不会统一出场时间。')}</p>
        {confirmDissolve && <div role="alert" className="appearance-dissolve-confirm"><strong>{t('解散后，所有成员恢复为独立出场卡片。')}</strong><div><button type="button" className="secondary" onClick={() => save(true)}>{t('确认解散，保留人物')}</button><button type="button" className="subtle-button" onClick={() => setConfirmDissolve(false)}>{t('取消')}</button></div></div>}
        {error && <p role="alert" className="danger">{tm(error)}</p>}
      </fieldset>
      <div className="modal-actions">{original && <button type="button" className="subtle-button" disabled={busy || dirty} onClick={() => setConfirmDissolve(true)}>{t('解散组，保留人物')}</button>}<button type="button" className="secondary" disabled={busy} onClick={guard.close}>{t('取消')}</button><button className="primary" disabled={busy || value.memberIds.length < (original ? 1 : 2)}>{busy ? t('保存中…') : original ? t('保存成员') : t('组成出场组')}</button></div>
    </form>
  </Modal>;
}
