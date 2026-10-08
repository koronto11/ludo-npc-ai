import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {DotsThree,DotsSixVertical,Trash,ArrowCounterClockwise,X} from '@phosphor-icons/react';
import {Modal} from './Modal';
import {t,tm,useI18n} from './i18n';
import {libraryDeleteCommands,libraryDeleteBlockers,libraryObject,libraryUsages} from './libraryActionsModel';
import './libraryActions.css';

export function LibraryRow({target,Icon,children,selected,onOpen,onMore,draggable=false,onDragStart,group=false,disabled=false,menuTarget=null,sortScope,sortDisabled=false,sorting=false,insertion,onSortStart,onSortEnd,onSortOver,onSortDrop,onSortKey}) {
  useI18n();
  const more=e=>{e.preventDefault();e.stopPropagation();const trigger=e.currentTarget,rect=trigger.getBoundingClientRect();onMore({target,trigger,x:rect.right,y:rect.bottom});};
  return <div data-library-scope={sortScope} data-library-id={target.id} className={`library-action-row ${selected?'selected':''} ${group?'library-action-group':''} ${sorting?'library-sorting':''} ${insertion?`library-insert-${insertion}`:''}`} onDragOver={onSortOver} onDrop={onSortDrop}>
    {sortScope&&<button className="library-sort-handle" disabled={disabled||sortDisabled} draggable={!disabled&&!sortDisabled} title={t('同级排序 · Alt ↑ / ↓')} aria-label={t('拖动排序：{0}',[target.name])} onDragStart={onSortStart} onDragEnd={onSortEnd} onKeyDown={onSortKey} onClick={e=>e.stopPropagation()}><DotsSixVertical size={14}/></button>}
    <button className={group?'library-group':'library-row'} disabled={disabled} draggable={draggable} onDragStart={onDragStart} onClick={onOpen} onContextMenu={more} onKeyDown={e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey)more(e);}}>{Icon&&<Icon size={17}/>}<span>{children}</span></button>
    <button className="library-more icon-button" disabled={disabled} aria-label={t('更多操作：{0}',[target.name])} aria-haspopup="menu" aria-expanded={menuTarget?.kind===target.kind&&menuTarget?.id===target.id} onClick={more}><DotsThree size={20} weight="bold"/></button>
  </div>;
}

export function LibraryActionMenu({context,actions,onClose}) {
  useI18n();
  const ref=useRef(null),[position,setPosition]=useState({left:context.x,top:context.y});
  useLayoutEffect(()=>{const box=ref.current.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(context.x,window.innerWidth-box.width-8)),top:Math.max(8,Math.min(context.y,window.innerHeight-box.height-8))});ref.current.querySelector('button')?.focus();},[context]);
  useEffect(()=>{
    const outside=e=>{if(!ref.current?.contains(e.target))onClose(false);};
    const resized=()=>onClose(false);
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',resized);window.addEventListener('wheel',outside,{capture:true,passive:true});
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resized);window.removeEventListener('wheel',outside,true);};
  },[onClose]);
  return createPortal(<div ref={ref} className="library-action-menu" role="menu" aria-label={t('资料操作：{0}',[context.target.name])} style={position} onKeyDown={e=>{
    if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();onClose(true);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    e.preventDefault();const items=[...ref.current.querySelectorAll('[role="menuitem"]:not(:disabled)')],index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }}><header>{context.target.name}</header>{actions.map(action=><button role="menuitem" disabled={action.disabled} key={action.label} className={action.danger?'library-danger':''} onClick={()=>{onClose(false);action.run();}}>{action.Icon&&<action.Icon size={16}/>}<span>{t(action.label)}</span></button>)}</div>,document.body);
}

export function LibraryUsageList({rows,onOpen}) {
  useI18n();
  return <div className="library-usages">{rows.map(row=><button className="secondary" key={`${row.kind}:${row.levelId || ''}:${row.id}`} onClick={()=>onOpen(row)}><strong>{row.name}</strong><small>{t(usageLabels[row.kind] || '资料')}</small></button>)}</div>;
}
const usageLabels={level:'关卡',track:'场景轨道',appearance:'人物出场',relation:'人物关系',initial:'初始状态',case:'已保存预演输入',draft:'草稿记录',generation:'生成记录',character:'人物',location:'地点',faction:'阵营',event:'剧情事件',rule:'条件规则',dialogue:'对白',text:'文本'};

export function LibraryUsageDialog({document,target,onOpen,onClose}) {
  useI18n();
  const rows=libraryUsages(document,target);
  return <Modal title={t('使用位置：{0}',[target.name])} subtitle={t('选择关联条目查看或编辑；多次出场分别列出。')} onClose={onClose}><LibraryUsageList rows={rows} onOpen={onOpen}/>{!rows.length&&<p>{t('这份资料尚未被引用。')}</p>}<div className="modal-actions"><button className="secondary" onClick={onClose}>{t('关闭')}</button></div></Modal>;
}

export function LibraryDeleteDialog({local,target,onOpen,onClose,onDeleted}) {
  useI18n();
  const [base]=useState(()=>structuredClone(local.project._document)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const row=libraryObject(local.project._document,target),usages=libraryDeleteBlockers(local.project._document,target);
  const save=async()=>{if(busy)return;setBusy(true);setError('');try{const result=await local.transact(latest=>libraryDeleteCommands(base,target,latest));onDeleted(target,result);onClose();}catch(reason){setError(reason.message);}finally{setBusy(false);}};
  return <Modal title={t('确认删除“{0}”？',[row?.name || target.name])} subtitle={t('请核对删除范围，确认后才会删除。')} onClose={busy?()=>{}:onClose}>
    <div className="library-delete-body"><p>{t('对象类型：{0}',[t(usageLabels[target.kind] || '资料')])}</p><p>{target.kind==='level'?t('删除本关卡的场景轨道、时间锚点、NPC 组与出场安排；共享人物、地点和对白保留。'):target.kind==='character'?t('删除人物档案及该人物的初始状态；历史试玩快照保留。'):t('删除这份共享资料，历史试玩快照保留。')}</p><p className="muted-text">{t('可使用“撤销删除”恢复；已保存项目的恢复点也会保留删除前内容。')}</p>
    {usages.length>0&&<><p role="status" className="library-reference-warning">{t('发现 {0} 处引用，请先处理关联后再删除。',[usages.length])}</p><LibraryUsageList rows={usages} onOpen={onOpen}/></>}{error&&<p className="danger" role="alert">{tm(error)}</p>}</div>
    <div className="modal-actions"><button className="secondary" disabled={busy} onClick={onClose}>{t('取消')}</button><button className="secondary library-confirm-delete" disabled={busy||!row||usages.length>0} onClick={save}><Trash size={16}/>{busy?t('处理中…'):t('确认删除')}</button></div>
  </Modal>;
}

export function LibraryDeletedNotice({name,onUndo,onDismiss,busy,canUndo,onRecovery}) {
  useI18n();
  return <div className="library-deleted-notice" role="status"><span>{t('已删除“{0}”',[name])}</span>{canUndo?<button disabled={busy} onClick={onUndo}><ArrowCounterClockwise size={14}/>{t('撤销删除')}</button>:<button onClick={onRecovery}>{t('工程备份恢复')}</button>}<button aria-label={t('关闭删除提示')} onClick={onDismiss}><X size={14}/></button></div>;
}
