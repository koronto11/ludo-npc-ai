import {CharacterImportanceBadge} from './CharacterImportance';
import { t, tm, useI18n } from './i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, MagnifyingGlass, MapPin, ChatText, Link, Plus, Play, Tag, X, ArrowRight, ArrowCounterClockwise, Sparkle, PencilSimple } from '@phosphor-icons/react';
import { appearanceLabel } from './planning';
import {castIndex,castPage} from './castIndex';
import { QuickNote } from './QuickNote';
import { characterGroups, groupCommands, undoGroupCommands } from './characterGroupCommands';
import { CharacterGroupMenu, MembershipModal, MoveGroupModal, GroupManagerModal } from './CharacterGroups';

export function CharacterOverview({ local, selectedId, onSelect, onLocate, onWorkbench, onRelation, onPlace, onCreate, onStory, onEditProfile, announce }) {
  useI18n();
  const c = local.project._document?.content;
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all'); const [group, setGroup] = useState(''); const [checked, setChecked] = useState([]); const [groupName, setGroupName] = useState(''); const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null); const [menu, setMenu] = useState(null); const [history, setHistory] = useState([]);
  const menuTarget = useRef(null); const saving = useRef(false);
  const [page,setPage]=useState(1);const gridRef=useRef(null);
  const index=useMemo(()=>castIndex(c||{}),[c]);
  useEffect(()=>setPage(1),[query,filter,group,local.project._document?.project_id]);
  useEffect(()=>{if(gridRef.current)gridRef.current.scrollTop=0;},[page,query,filter,group]);
  const groups = characterGroups(c?.characters || []);
  const chosen = checked.filter(id => c?.characters.some(row => row.id === id));
  useEffect(() => { setChecked([]); setGroup(''); setHistory([]); setModal(null); setMenu(null); setGroupName(''); }, [local.project._document?.project_id]);
  useEffect(() => { if (group && !groups.includes(group)) setGroup(''); }, [c?.characters, group]);
  const closeMenu = useCallback((restoreFocus = true) => { setMenu(null); if (restoreFocus) requestAnimationFrame(() => menuTarget.current?.focus({ preventScroll: true })); }, []);
  const openMenu = (event, actor, keyboard = false) => {
    event.preventDefault(); event.stopPropagation(); if (busy) return;
    const target = event.currentTarget.closest('.cast-card')?.querySelector('.cast-card-main') || event.currentTarget;
    const rect = target.getBoundingClientRect(); menuTarget.current = target;
    setMenu({ id: actor.id, name: actor.name, hasGroups: actor.tags.length > 0, x: keyboard ? rect.left : event.clientX, y: keyboard ? rect.top + 35 : event.clientY });
  };
  const manage = (ids, type = 'membership') => { closeMenu(false); setModal({ type, ids }); };
  const commitGroups = async operation => {
    if (saving.current) throw new Error(t("正在保存分组，请稍后重试"));
    const commands = groupCommands(c.characters, operation);
    if (!commands.length) { announce(t("分组归属没有变化")); return; }
    const before = commands.map(cmd => ({ id: cmd.target.id, tags: [...c.characters.find(row => row.id === cmd.target.id).tags] }));
    const after = commands.map(cmd => ({ id: cmd.target.id, tags: [...cmd.changes.tags] }));
    const filterBefore = group;
    const filterAfter = operation.source === group ? operation.type === 'rename' ? operation.target.trim() : operation.type === 'remove' ? '' : group : group;
    saving.current = true; setBusy(true);
    try { await local.transact(commands); setHistory(v => [...v.slice(-19), { before, after, filterBefore }]); setGroup(filterAfter); announce({membership:'人物分组已保存',rename:'分组名称已更新',remove:'分组已解散，人物保留',move:'人物已移动分组'}[operation.type] + '；可撤销'); }
    finally { saving.current = false; setBusy(false); }
  };
  const undoGroups = async () => {
    if (!history.length) return;
    if (saving.current) throw new Error(t("正在保存分组，请稍后重试"));
    const entry = history.at(-1); const commands = undoGroupCommands(c.characters, entry);
    saving.current = true; setBusy(true);
    try { await local.transact(commands); setHistory(v => v.slice(0, -1)); setGroup(entry.filterBefore); announce(t("已撤销上一次分组操作")); }
    finally { saving.current = false; setBusy(false); }
  };
  if (!c) return <div className="empty-state">{t("正在载入人物…")}</div>;
  const visible = c.characters.filter(a => `${a.name} ${a.role} ${a.tags.join(' ')} ${local.project._document.editor.character_notes?.[a.id] || ''}`.includes(query.trim()) && (!group || a.tags.includes(group)) && (filter === 'all' || filter === 'unplaced' ? filter !== 'unplaced' || !index.appearances.get(a.id)?.length : filter === 'silent' ? !index.dialogues.get(a.id)?.length : a.importance === filter));
  const paging=castPage(visible,page);
  const actor = c.characters.find(a => a.id === selectedId);
  const appearances = actor ? index.appearances.get(actor.id)||[] : [];
  const relations = c.relations.filter(r => r.source.id === actor?.id || r.target.id === actor?.id);
  const addGroup = async () => { try { await commitGroups({ type: 'membership', ids: chosen, changes: { [groupName.trim()]: true } }); setGroupName(''); } catch (error) { announce(error.message); } };
  return <div className="cast-workspace"><div className="planning-heading"><div><small>{t("人物资产 / 全部角色")}</small><h1>{t("人物总览 ")}<span>{c.characters.length}</span></h1><p>{t("集中管理人物，查看每次出场、对白场景和关系。")}</p></div><div className="planning-actions"><button className="secondary" disabled={busy} onClick={() => setModal({ type: 'directory' })}><Tag/>{t("管理全部分组")}</button><button className="primary" onClick={onCreate}><Plus/>{t("创建人物")}</button></div></div><div className="cast-toolbar"><label className="cast-search"><MagnifyingGlass/><input aria-label={t("搜索全部人物")} placeholder={t("搜索姓名、身份、分组或备注")} value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label={t("筛选人物")} value={filter} onChange={e => setFilter(e.target.value)}>{Object.entries({all:'全部人物',key:'关键角色',supporting:'支线角色',background:'背景角色',unplaced:'尚未安排出场',silent:'尚无对白'}).map(([id,name]) => <option value={id} key={id}>{t(name)}</option>)}</select><select aria-label={t("筛选人物分组")} value={group} onChange={e => setGroup(e.target.value)}><option value="">{t("全部分组")}</option>{groups.map(g => <option key={g}>{g}</option>)}</select><button className="secondary" disabled={busy} title={t("选择全部筛选结果，包括其他页的人物")} onClick={() => setChecked(visible.map(a => a.id))}>{t("选中筛选结果")}</button>{chosen.length > 0 && <button className="subtle-button" disabled={busy} onClick={() => setChecked([])}>{t("清空选择")}</button>}<button className="icon-button" aria-label={t("撤销人物分组操作")} title={t("撤销上一次分组操作")} disabled={busy || !history.length} onClick={() => undoGroups().catch(error => announce(error.message))}><ArrowCounterClockwise/></button></div>
    {chosen.length > 0 && <div className="cast-bulk"><strong>{t("已选 ")}{chosen.length}{t(" 人")}</strong><button className="secondary" disabled={busy} onClick={() => manage(chosen)}><Tag/>{t("管理分组")}</button><button className="secondary" disabled={busy || !chosen.some(id => c.characters.find(a => a.id === id).tags.length)} onClick={() => manage(chosen, 'move')}><ArrowRight/>{t("移动分组")}</button><input disabled={busy} aria-label={t("批量人物分组名称")} maxLength="150" placeholder={t("分组名称，例如：篝火居民")} value={groupName} onChange={e => setGroupName(e.target.value)}/><button className="secondary" disabled={busy || !groupName.trim() || !chosen.length} onClick={addGroup}><Tag/>{t("加入分组")}</button><button className="primary" disabled={busy} onClick={() => onPlace(chosen)}><MapPin/>{t("批量安排出场")}</button></div>}
    <div className={`cast-stage ${actor ? 'has-detail' : ''}`}><div className="cast-collection">{paging.pages>1&&<nav className="cast-pagination" aria-label={t("人物卡片分页")}><span>{t("第 ")}{paging.start}–{paging.end}{t(" 人 / 共 ")}{visible.length}{t(" 人")}</span><button className="secondary" disabled={paging.page===1} onClick={()=>setPage(paging.page-1)}>{t("上一页")}</button><span>{paging.page} / {paging.pages}</span><button className="secondary" disabled={paging.page===paging.pages} onClick={()=>setPage(paging.page+1)}>{t("下一页")}</button></nav>}<div className={`cast-grid ${!visible.length ? 'is-empty' : ''}`} ref={gridRef}>{paging.rows.map(a => { const placed = index.appearances.get(a.id)||[]; const dialogues = index.dialogues.get(a.id)||[]; return <article key={a.id} className={`cast-card ${selectedId === a.id ? 'selected' : ''}`} data-testid={`cast-${a.id}`} onContextMenu={e => openMenu(e, a)} draggable={!busy} onDragStart={e => e.dataTransfer.setData('application/ludo-entity',a.id)}><label className="cast-check"><input type="checkbox" disabled={busy} aria-label={t("选中人物 {0}", [a.name])} checked={checked.includes(a.id)} onChange={e => setChecked(e.target.checked ? [...checked,a.id] : checked.filter(id => id !== a.id))}/></label><button className="cast-group-button" disabled={busy} aria-label={t("管理 {0} 的分组", [a.name])} title={t("管理分组 · 右键更多操作")} onClick={() => manage([a.id])}><Tag size={15}/></button><button className="cast-card-main" onKeyDown={e => { if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) openMenu(e, a, true); }} onClick={() => onSelect(a.id)}><span className="cast-avatar">{a.name.slice(0,1)}</span><strong>{a.name}</strong><small>{a.role || t("待补充身份")}</small><CharacterImportanceBadge value={a.importance}/><span className="cast-counts"><span><MapPin size={13}/>{placed.length}{t(" 次出场")}</span><span><ChatText size={13}/>{dialogues.length}{t(" 个对白")}</span></span><span className="cast-tags" title={a.tags.join('、')}>{a.tags.slice(0,2).join(' · ') + (a.tags.length > 2 ? ` +${a.tags.length - 2}` : '') || (!placed.length ? t("待安排出场") : t("已进入关卡"))}</span></button><QuickNote local={local} characterId={a.id} name={a.name} value={local.project._document.editor.character_notes?.[a.id] || ''}/><footer><button onClick={() => onPlace([a.id])}>{t("安排出场")}</button><button onClick={() => onWorkbench(null,null,a.id)}>{t("对白 / 预演")}</button></footer></article>; })}{!visible.length && <div className="planning-empty workspace-empty"><Users size={36}/><h2>{c.characters.length ? t("没有匹配的人物") : t("建立你的角色库")}</h2><p>{c.characters.length ? t("试试其他筛选条件。") : t("从左侧创建人物，或者在场景中添加背景 NPC 组。")}</p></div>}</div></div>
      {actor && <aside className="cast-detail"><header><span>{t("人物档案")}</span><button className="icon-button" aria-label={t("收起人物详情")} onClick={() => onSelect('')}><X/></button></header><div className="cast-detail-title"><span className="cast-avatar">{actor.name.slice(0,1)}</span><div><h2>{actor.name}</h2><p>{actor.role}</p><CharacterImportanceBadge value={actor.importance}/></div></div><details className="cast-story" key={actor.id}><summary><span>{t("人物故事")}</span><small className="cast-story-expand">{t("展开")}</small><small className="cast-story-collapse">{t("收起")}</small></summary><p>{actor.story || actor.description || t("人物故事尚未填写")}</p></details><div className="cast-detail-actions"><button className="secondary" onClick={()=>onEditProfile(actor.id)}><PencilSimple/>{t("编辑人物档案")}</button><button className="secondary" onClick={()=>onStory(actor.id)}><Sparkle/>{t("生成人物故事")}</button><button className="primary" onClick={() => onWorkbench(null,null,actor.id)}><Play/>{t("角色工作台")}</button><button className="secondary" onClick={() => onRelation(actor.id)}><Link/>{t("查看关系与设定")}</button></div><h3>{t("人物分组")}</h3><div className="group-member-chips">{actor.tags.map(tag => <span key={tag}>{tag}</span>)}{!actor.tags.length && <small>{t("尚未分组")}</small>}</div><button className="secondary" disabled={busy} onClick={() => manage([actor.id])}><Tag/>{t("管理分组")}</button><h3>{t("所有出场 ")}<small>{appearances.length}</small></h3>{appearances.map(({ level,appearance,track }) => <article className="appearance-summary" key={`${level.id}-${appearance.id}`}><strong>{track?.name || t("待安排场景")}</strong><small>{appearanceLabel(level,appearance)}</small><div><button onClick={() => onLocate(level.id,appearance.id,actor.id)}><MapPin size={12}/>{t("定位关卡")}</button><button onClick={() => onWorkbench(level,appearance)}><ChatText size={12}/>{t("对白 / 预演")}</button></div></article>)}{!appearances.length && <p className="muted-text">{t("还没有安排出场，可以拖入关卡画布。")}</p>}<h3>{t("人物关系 ")}<small>{relations.length}</small></h3>{relations.map(r => { const otherId = r.source.id === actor.id ? r.target.id : r.source.id; const other = Object.values(c).filter(Array.isArray).flat().find(row => row.id === otherId); return <button className="cast-relation" key={r.id} onClick={() => onRelation(actor.id)}>{other?.name} <span>{r.label}</span></button>; })}{!relations.length && <p className="muted-text">{t("尚未建立关系")}</p>}<h3>{t("长期目标")}</h3>{actor.goals.map((goal,i) => <p key={i}>{goal}</p>)}<h3>{t("人物口吻")}</h3><p>{actor.voice || t("待补充")}</p></aside>}
    </div>
    {menu && <CharacterGroupMenu onEdit={()=>{const id=menu.id;closeMenu(false);onEditProfile(id);}} context={menu} onClose={closeMenu} onManage={() => manage([menu.id])} onMove={() => manage([menu.id], 'move')} onStory={()=>{const id=menu.id;closeMenu(false);onStory(id);}}/>}
    {modal?.type === 'membership' && <MembershipModal characters={c.characters} ids={modal.ids} onClose={() => setModal(null)} onSave={commitGroups}/>}
    {modal?.type === 'move' && <MoveGroupModal characters={c.characters} ids={modal.ids} initialSource={group} onClose={() => setModal(null)} onSave={commitGroups}/>}
    {modal?.type === 'directory' && <GroupManagerModal characters={c.characters} initialGroup={group} onClose={() => setModal(null)} onSave={commitGroups} onUndo={undoGroups} canUndo={history.length > 0}/>}
  </div>;
}
