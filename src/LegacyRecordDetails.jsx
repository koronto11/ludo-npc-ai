import {useState} from 'react';
import {Modal} from './Modal';
import {MoreDetails,DraftCloseGuard,useDraftClose} from './MoreDetails';
import {legacyMetadataCommands} from './moreDetailsModel';
import {t,tm,useI18n} from './i18n';

function RecordEditor({local,recordId,onClose}) {
  useI18n();
  const [projectId]=useState(local.project._document.project_id);
  const [base]=useState(()=>structuredClone(local.project._document.content.simulation_cases.find(row=>row.id===recordId)));
  const [value,setValue]=useState(base),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dirty=JSON.stringify(base)!==JSON.stringify(value);
  const guard=useDraftClose(dirty,busy,onClose);
  const save=async()=>{
    if(busy)return;setBusy(true);setError('');
    try {
      await local.transact(latest=>{
        if(latest.project_id!==projectId)throw new Error(t('所属项目已变化，请重新打开资料。'));
        return legacyMetadataCommands(base,value,latest);
      });onClose();
    }catch(reason){setError(reason.message);guard.setClosing(false);}finally{setBusy(false);}
  };
  if(!base)return <Modal title={t('记录已移除，请重新打开。')} onClose={onClose}/>;
  return <Modal title={t('旧记录资料 · {0}',[base.name])} subtitle={t('只补充说明、标签与备注；原始测试条件和操作路径保持不变。')} onClose={guard.close}>
    <DraftCloseGuard guard={guard} busy={busy} onSave={save} onClose={onClose}/>
    <form inert={guard.closing?true:undefined} onSubmit={e=>{e.preventDefault();save();}}>
      <MoreDetails value={value} disabled={busy} onChange={patch=>setValue({...value,...patch})}/>
      <label className="form-field">{t('记录备注')}<textarea aria-label={t('记录备注')} rows={4} disabled={busy} value={value.notes || ''} onChange={e=>setValue({...value,notes:e.target.value})}/></label>
      <p className="muted-text">{t('随机种子（只读）')}：{base.seed}</p>
      {error&&<p className="danger" role="alert">{tm(error)}</p>}
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={guard.close}>{t('取消')}</button><button className="primary" disabled={busy||!dirty}>{t('保存记录资料')}</button></div>
    </form>
  </Modal>;
}
export function LegacyRecordDetails({local,recordId,content,readOnly=false}) {
  useI18n();
  const [editing,setEditing]=useState(false);
  const row=content.simulation_cases.find(item=>item.id===recordId);
  if(!row)return null;
  return <section className="legacy-metadata">
    <details><summary>{t('旧记录说明与备注')}</summary>
      <p>{row.description || t('尚无资料说明')}</p><p>{row.tags.length?row.tags.join(' · '):t('尚无资料标签')}</p><p>{row.notes || t('尚无记录备注')}</p>
      <small>{t('随机种子（只读）')}：{row.seed}</small>
      {local&&!readOnly&&<p><button className="secondary" onClick={()=>setEditing(true)}>{t('编辑记录资料')}</button></p>}
    </details>
    {editing&&<RecordEditor local={local} recordId={recordId} onClose={()=>setEditing(false)}/>}
  </section>;
}
