import {useState} from 'react';
import {Modal} from './Modal';
import {DraftCloseGuard,useDraftClose} from './MoreDetails';
import {t,tm,useI18n} from './i18n';

export function RelationModal({modal,project,onClose,onRelation}) {
  useI18n();
  const [initial]=useState(()=>{
    const row=modal.edge || modal.connection || {};
    return {source:row.source || '',target:row.target || '',label:row.label || '',category:row.category || 'social',direction:row.direction || 'forward',description:row.description || ''};
  });
  const [value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const guard=useDraftClose(JSON.stringify(value)!==JSON.stringify(initial),busy,onClose);
  const patch=changes=>setValue(previous=>({...previous,...changes}));
  const save=async()=>{
    if(busy)return;
    if(!value.source || !value.target || value.source===value.target){setError(t('请选择两个不同的对象'));guard.setClosing(false);return;}
    if(!value.label.trim())return;
    setBusy(true);setError('');
    try {await onRelation(value.label.trim(),modal.edge || null,value);}
    catch(reason){setError(reason.message);guard.setClosing(false);}
    finally{setBusy(false);}
  };
  return <Modal title={modal.edge?t('编辑关系'):t('建立关系')} onClose={guard.close}>
    <DraftCloseGuard guard={guard} busy={busy} onSave={save} onClose={onClose}/>
    <form inert={guard.closing?true:undefined} onSubmit={event=>{event.preventDefault();save();}}>
      <fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
        <div className="form-columns">{[['source','来源'],['target','目标']].map(([field,label])=><label className="form-field" key={field}>{t(label)}<select required aria-label={t(label)} value={value[field]} onChange={event=>patch({[field]:event.target.value})}><option value="">{t('请选择')}</option>{project.entities.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>)}</div>
        <label className="form-field">{t('关系名称')}<input autoFocus required maxLength={200} aria-label={t('关系名称')} value={value.label} onChange={event=>patch({label:event.target.value})}/></label>
        <div className="form-columns"><label className="form-field">{t('关系类别')}<select aria-label={t('关系类别')} value={value.category} onChange={event=>patch({category:event.target.value})}>{[['social','人物关系'],['event','故事关联'],['dialogue','对白关联']].map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label><label className="form-field">{t('关系方向')}<select aria-label={t('关系方向')} value={value.direction} onChange={event=>patch({direction:event.target.value})}><option value="forward">{t('单向关系')}</option><option value="both">{t('双向关系')}</option></select></label></div>
        <label className="form-field">{t('关系说明')}<textarea rows={4} aria-label={t('关系说明')} value={value.description} onChange={event=>patch({description:event.target.value})}/></label>
      </fieldset>
      {error&&<p role="alert" className="danger">{tm(error)}</p>}
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={guard.close}>{t('取消')}</button><button className="primary" disabled={busy||!value.label.trim()||!value.source||!value.target||value.source===value.target}>{busy?t('保存中…'):t('保存关系')}</button></div>
    </form>
  </Modal>;
}
