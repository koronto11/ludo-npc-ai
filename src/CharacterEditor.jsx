import {localizeLabels} from './i18n.js';
import { t, tm, useI18n } from './i18n';
import {useEffect,useRef,useState} from 'react';
import {LockKey} from '@phosphor-icons/react';
import {Modal} from './Modal';
import {characterLists,profileChanges} from './characterProfile';
import './characterEditor.css';
import {CharacterImportanceOptions} from './CharacterImportance';

const labels=localizeLabels({name:'姓名',role:'身份 / 职责',importance:'角色定位',description:'人物简介',story:'人物故事',personality:'性格',voice:'人物口吻',goals:'长期目标',boundary:'行为底线',uncertainties:'未知与待定设定'});
export function CharacterEditor({local,characterId,onClose,announce,onTemplate}) {
  useI18n();
  const [base]=useState(()=>structuredClone(local.project._document.content.characters.find(a=>a.id===characterId)));
  const [draft,setDraft]=useState(base),[busy,setBusy]=useState(false),[error,setError]=useState(''),[closing,setClosing]=useState(false);
  const saving=useRef(false);
  const dirty=JSON.stringify(base)!==JSON.stringify(draft);
  useEffect(()=>{const warn=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const close=()=>{if(!saving.current){if(dirty)setClosing(true);else onClose();}};
  const save=async()=>{
    if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try {
      const latest=await local.exportDocument();
      const changes=profileChanges(base,draft,latest.content.characters.find(a=>a.id===characterId));
      if(Object.keys(changes).length)await local.transact([{type:'patch_entity',target:{kind:'character',id:characterId},changes}]);
      announce(t("人物档案已保存，所有画布使用同一份设定"));onClose();
    } catch(reason){setError(reason.message);setClosing(false);} finally{saving.current=false;setBusy(false);}
  };
  if(!base)return <Modal title={t("人物已移除")} onClose={onClose}><p>{t("请重新选择人物。")}</p></Modal>;
  const field=key=><div className="profile-field" key={key}><div className="profile-field-heading"><label htmlFor={`profile-${key}`}>{t(labels[key])}</label><label className="profile-lock"><input type="checkbox" aria-label={t("保护{0}", [labels[key]])} checked={draft.confirmed_fields.includes(key)} onChange={e=>setDraft(v=>({...v,confirmed_fields:e.target.checked?[...v.confirmed_fields,key]:v.confirmed_fields.filter(f=>f!==key)}))}/><LockKey size={12}/>{t("保护")}</label></div>{key==='importance'?<select id={`profile-${key}`} value={draft.importance} onChange={e=>setDraft(v=>({...v,importance:e.target.value}))}><CharacterImportanceOptions/></select>:['name','role','voice'].includes(key)?<input id={`profile-${key}`} required={key==='name'} maxLength={key==='name'?150:30000} value={draft[key]} onChange={e=>setDraft(v=>({...v,[key]:e.target.value}))}/>:<textarea id={`profile-${key}`} rows={key==='story'?9:3} maxLength={30000} value={characterLists.has(key)?draft[key].join('\n'):draft[key]} onChange={e=>setDraft(v=>({...v,[key]:characterLists.has(key)?e.target.value.split('\n'):e.target.value}))}/>} {characterLists.has(key)&&<small>{t("每行一条")}</small>}</div>;
  return <Modal title={t("编辑人物档案 · {0}", [base.name])} subtitle={t("在这里修改人物设定。勾选保护可阻止模型草稿覆盖，仍可手动修改。")} wide className="character-editor" onClose={close}>
    {closing&&<div className="profile-unsaved" role="alert"><strong>{t("人物档案尚未保存")}</strong><div><button className="secondary" onClick={onClose}>{t("不保存并关闭")}</button><button className="primary" disabled={busy} onClick={save}>{t("保存并关闭")}</button><button className="secondary" onClick={()=>setClosing(false)}>{t("取消")}</button></div></div>}
    <form onSubmit={e=>{e.preventDefault();save();}} inert={closing?true:undefined}><fieldset disabled={busy} className="profile-body"><div className="form-columns">{field('name')}{field('role')}</div>{field('importance')}<p className="muted-text profile-position-help">{t('用于区分人物的叙事定位，与身份、分组分别管理。')}</p>{field('description')}{field('story')}<details className="profile-more"><summary>{t("性格、口吻与其他设定")}</summary>{['personality','voice','goals','boundary','uncertainties'].map(field)}</details></fieldset>{error&&<p className="danger" role="alert">{tm(error)}</p>}<div className="modal-actions">{onTemplate&&<button type="button" className="secondary" disabled={busy||dirty} title={dirty?t("先保存档案，再保存为模板"):t("复用这份人物设定")} onClick={()=>onTemplate(characterId)}>{t("保存为模板")}</button>}<button type="button" className="secondary" disabled={busy} onClick={close}>{t("关闭")}</button><button className="primary" disabled={busy||!dirty}>{busy?t("保存中…"):t("保存人物档案")}</button></div></form>
  </Modal>;
}
