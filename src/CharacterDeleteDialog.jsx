import {useRef, useState} from 'react';
import {Trash} from '@phosphor-icons/react';
import {Modal} from './Modal';
import {LibraryUsageList} from './LibraryActions';
import {characterRemovalBlockers, characterRemovalCommands} from './characterRemoval';
import {t, tm, useI18n} from './i18n';

export function CharacterDeleteDialog({local, ids, onClose, onDeleted, onOpenUsage, disabled}) {
  useI18n();
  const [base] = useState(()=>structuredClone(local.project._document));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  const document = local.project._document;
  const selected = new Set(ids);
  const rows = base.content.characters.filter(row=>selected.has(row.id));
  const blockers = characterRemovalBlockers(document, ids);
  const tooMany = ids.length > 499;
  const save = async()=>{
    if (saving.current || disabled || tooMany || blockers.length) return;
    saving.current=true; setBusy(true); setError('');
    try { const result=await local.transact(latest=>characterRemovalCommands(base,ids,latest)); onDeleted(ids,result); onClose(); }
    catch(reason) { setError(reason.message); }
    finally {saving.current=false; setBusy(false);}
  };
  return <Modal title={t('删除 {0} 个人物',[rows.length])} subtitle={t('请核对删除范围，确认后才会删除。')} onClose={()=>{if(!saving.current)onClose();}}>
    <div className="library-delete-body">
      <p className="character-delete-names">{rows.map(row=>row.name).join('、')}</p>
      <p>{t('删除人物档案及该人物的初始状态；历史试玩快照保留。')}</p>
      <p className="muted-text">{t('删除后可通过顶部撤销或“撤销删除”恢复。')}</p>
      {tooMany&&<p role="alert" className="danger">{t('一次最多删除 499 个人物，请分批处理。')}</p>}
      {disabled&&<p role="alert" className="danger">{t('请先完成生成任务，或保存当前未完成的编辑和预演输入。')}</p>}
      {!!blockers.length&&<><p role="status" className="library-reference-warning">{t('发现 {0} 处引用，请先处理关联后再删除。',[blockers.length])}</p><LibraryUsageList rows={blockers.map(row=>({...row,name:`${rows.find(actor=>actor.id===row.characterId)?.name || row.characterId} · ${row.name || row.id}`}))} onOpen={row=>{onClose();onOpenUsage(row);}}/></>}
      {error&&<p role="alert" className="danger">{tm(error)}</p>}
    </div>
    <div className="modal-actions"><button className="secondary" disabled={busy} onClick={onClose}>{t('取消')}</button><button className="secondary library-confirm-delete" disabled={busy||disabled||tooMany||!!blockers.length} onClick={save}><Trash/>{busy?t('处理中…'):t('确认删除')}</button></div>
  </Modal>;
}
