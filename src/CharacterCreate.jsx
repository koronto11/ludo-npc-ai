import {useRef,useState} from 'react';
import {t,tm,useI18n} from './i18n';
import {Modal} from './Modal';
import {CharacterImportanceOptions} from './CharacterImportance';
import {useDraftClose,DraftCloseGuard} from './MoreDetails';
import {characterCreationCommands} from './characterCreation';

export function CharacterCreate({local,importance='supporting',onClose,onCreated}) {
  useI18n();
  const [draft,setDraft]=useState({name:'',role:'',importance,description:''});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const id=useRef(`character-${crypto.randomUUID()}`),saving=useRef(false);
  const dirty=!!(draft.name||draft.role||draft.description||draft.importance!==importance);
  const guard=useDraftClose(dirty,busy,onClose);
  const save=async()=>{
    if(saving.current)return;
    if(!draft.name.trim()){setError(t('人物姓名不能为空。'));guard.setClosing(false);return;}
    saving.current=true;setBusy(true);setError('');
    try{
      await local.transact(latest=>characterCreationCommands(latest,draft,id.current));
      onCreated(id.current,draft.name.trim());
    }catch(reason){setError(reason.message);guard.setClosing(false);}
    finally{saving.current=false;setBusy(false);}
  };
  return <Modal title={t('创建人物')} subtitle={t('先建立人物档案，之后再安排出场、编写对白或生成故事。')} onClose={guard.close}>
    <DraftCloseGuard guard={guard} busy={busy} onSave={save} onClose={onClose}/>
    <form onSubmit={e=>{e.preventDefault();save();}} inert={guard.closing?true:undefined}>
      <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <label className="form-field">{t('姓名')}<input required autoFocus maxLength={150} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
        <label className="form-field">{t('身份 / 职责')}<input maxLength={30000} value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value})}/></label>
        <label className="form-field">{t('角色定位')}<select value={draft.importance} onChange={e=>setDraft({...draft,importance:e.target.value})}><CharacterImportanceOptions/></select><small>{t('用于区分人物的叙事定位，与身份、分组分别管理。')}</small></label>
        <label className="form-field">{t('人物简介')}<textarea rows={4} maxLength={30000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
      </fieldset>
      {error&&<p className="danger" role="alert">{tm(error)}</p>}
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={guard.close}>{t('取消')}</button><button className="primary" disabled={busy}>{busy?t('保存中…'):t('创建人物')}</button></div>
    </form>
  </Modal>;
}
