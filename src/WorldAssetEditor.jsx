import {useEffect,useRef,useState} from 'react';
import {Modal} from './Modal';
import {t,tm,useI18n} from './i18n';
import {worldAssetCommands} from './worldAssetEditorModel';

export function WorldAssetEditor({local,assetId,kind,onClose}) {
  useI18n();
  const [projectId]=useState(local.project._document.project_id);
  const collection=kind==='location'?'locations':'factions';
  const [base]=useState(()=>structuredClone(local.project._document.content[collection].find(row=>row.id===assetId)));
  const [draft,setDraft]=useState(base),[busy,setBusy]=useState(false),[error,setError]=useState(''),[closing,setClosing]=useState(false);
  const saving=useRef(false),dirty=JSON.stringify(base)!==JSON.stringify(draft);
  useEffect(()=>{const warn=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const close=()=>{if(saving.current)return;if(dirty)setClosing(true);else onClose();};
  const save=async()=>{
    if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try {
      await local.transact(latest=>{
        if(latest.project_id!==projectId)throw new Error(t('所属项目已变化，请重新打开资料。'));
        return worldAssetCommands(base,{...draft,tags:draft.tags.map(value=>value.trim()).filter(Boolean),...(kind==='faction'?{policies:draft.policies.map(value=>value.trim()).filter(Boolean)}:{})},latest);
      });
      onClose();
    }catch(reason){setError(reason.message);setClosing(false);}finally{saving.current=false;setBusy(false);}
  };
  if(!base)return <Modal title={t('世界资料已移除')} onClose={onClose}/>;
  const patch=(key,value)=>setDraft(previous=>({...previous,[key]:value}));
  return <Modal title={kind==='location'?t('编辑地点'):t('编辑阵营')} subtitle={t('修改共享资料，已有场景和关系仍引用同一对象。')} wide onClose={close} className="world-editor-modal">
    <form onSubmit={e=>{e.preventDefault();save();}}>
      <fieldset className="world-editor-body" disabled={busy||closing} style={{border:0,margin:0}}>
        <div className="form-columns"><label className="form-field">{t('名称')}<input required maxLength={150} value={draft.name} onChange={e=>patch('name',e.target.value)}/></label><label className="form-field">{t('类型描述')}<input value={draft.role} onChange={e=>patch('role',e.target.value)}/></label></div>
        <label className="form-field">{t('说明')}<textarea value={draft.description} onChange={e=>patch('description',e.target.value)}/></label>
        {kind==='location'?<label className="form-field">{t('所属地点')}<select value={draft.parent_id || ''} onChange={e=>patch('parent_id',e.target.value || null)}><option value="">{t('不指定')}</option>{local.project._document.content.locations.filter(row=>row.id!==assetId).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:<label className="form-field">{t('阵营政策 · 每行一条')}<textarea value={draft.policies.join('\n')} onChange={e=>patch('policies',e.target.value.split('\n'))}/></label>}
        <label className="form-field">{t('资料标签 · 每行一条')}<textarea value={draft.tags.join('\n')} onChange={e=>patch('tags',e.target.value.split('\n'))}/></label>
      </fieldset>
      <footer className="world-editor-footer">{error&&<p className="danger" role="alert">{tm(error)}</p>}{closing?<div className="world-close-guard" role="alert"><strong>{t('世界资料有未保存的修改。')}</strong><div><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('不保存并关闭')}</button><button type="button" className="primary" disabled={busy} onClick={save}>{t('保存并关闭')}</button><button type="button" className="secondary" onClick={()=>setClosing(false)}>{t('继续编辑')}</button></div></div>:<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={close}>{t('取消')}</button><button className="primary" disabled={busy||!dirty}>{busy?t('保存中…'):t('保存世界资料')}</button></div>}</footer>
    </form>
  </Modal>;
}
