import {useEffect,useState} from 'react';
import {t,useI18n} from './i18n';
import './moreDetails.css';

export function MoreDetails({value,onChange,label,description=true,disabled=false}) {
  useI18n();
  const prefix=label || value.name || t('资料');
  return <details className="more-details" key={value.id}>
    <summary>{label?t('更多资料 · {0}',[label]):t('更多资料')}<span>{description?t('说明与标签'):t('资料标签')}</span></summary>
    <fieldset disabled={disabled}>
      {description&&<label>{t('资料说明')}<textarea rows={3} aria-label={t('{0}资料说明',[prefix])} value={value.description || ''} onChange={e=>onChange({description:e.target.value})}/></label>}
      <label>{t('资料标签 · 每行一条')}<textarea rows={3} aria-label={t('{0}资料标签',[prefix])} value={(value.tags || []).join('\n')} onChange={e=>onChange({tags:e.target.value.split('\n')})}/></label>
      <small>{t('标签用于整理资料；触发条件与故事效果请在对应配置中设置。')}</small>
    </fieldset>
  </details>;
}
export function useDraftClose(dirty,busy,onClose) {
  const [closing,setClosing]=useState(false);
  useEffect(()=>{const warn=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  return {closing,setClosing,close:()=>{if(!busy){if(dirty)setClosing(true);else onClose();}}};
}
export function DraftCloseGuard({guard,busy,onSave,onClose}) {
  useI18n();
  return guard.closing?<div className="details-close-guard" role="alert"><strong>{t('资料有未保存的修改。')}</strong><div><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('不保存并关闭')}</button><button type="button" className="primary" disabled={busy} onClick={onSave}>{t('保存并关闭')}</button><button type="button" className="secondary" disabled={busy} onClick={()=>guard.setClosing(false)}>{t('继续编辑')}</button></div></div>:null;
}
