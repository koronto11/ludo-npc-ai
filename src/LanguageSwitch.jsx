import {t} from './i18n.js';
import {useEffect,useState} from 'react';
import {api} from './localApi';
import {useI18n,setLanguage,getLanguage,getLanguageVersion} from './i18n';
let loading;
let saving=Promise.resolve();
function loadPreference(){
 if(!loading){const version=getLanguageVersion();loading=api('/api/workspace').then(info=>{if(getLanguageVersion()===version&&info.ui_language)setLanguage(info.ui_language);}).catch(()=>{});}
 return loading;
}
export function LanguageSwitch(){
 const {language}=useI18n();const [warning,setWarning]=useState('');
 useEffect(()=>{loadPreference();},[]);
 async function change(next){
  setLanguage(next);setWarning('');
  // Serialize rapid changes so the last choice also wins on disk.
  const request=saving.catch(()=>{}).then(()=>api('/api/workspace/preferences',{method:'PUT',body:{ui_language:next}}));saving=request;
  try{await request;}catch{if(getLanguage()===next)setWarning(t("已在当前浏览器记住；本机应用偏好暂未保存。"));}
 }
 return <label className="language-switch" title={warning||undefined}><span className="sr-only">{language==='en'?'Interface language':'界面语言'}</span><select aria-label={language==='en'?'Interface language':'界面语言'} value={language} onChange={e=>change(e.target.value)}><option value="zh">中文</option><option value="en">English</option></select>{warning&&<span className="language-warning" role="status">!</span>}</label>;
}
