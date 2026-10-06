import {useSyncExternalStore} from 'react';
import {translate,translateMessage,SUPPORTED_LANGUAGES} from './i18nCore.js';
const listeners=new Set();
let language='zh';
let version=0;
export const getLanguageVersion=()=>version;
try{const saved=localStorage.getItem('npcs-ui-language');if(SUPPORTED_LANGUAGES.includes(saved))language=saved;}catch{}
export const getLanguage=()=>language;
export const t=(key,values=[])=>translate(key,values,language);
export const tm=message=>translateMessage(message,language);
export function setLanguage(next){
  if(!SUPPORTED_LANGUAGES.includes(next))return;
  if(language!==next)version++;
  language=next;
  try{localStorage.setItem('npcs-ui-language',next);}catch{}
  if(typeof document!=='undefined'){document.documentElement.lang=next==='en'?'en':'zh-CN';document.title=next==='en'?'NPCs AI Studio · Narrative workbench':'NPCs AI Studio · 叙事导演台';}
  listeners.forEach(fn=>fn());
}
export function useI18n(){const locale=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getLanguage,getLanguage);return {language:locale,t,tm};}

const labelProxies=new WeakMap();
// Only immutable, code-owned label tables use this adapter. Project data never does.
export function localizeLabels(value){
 if(typeof value==='string')return t(value);
 if(!value||typeof value!=='object')return value;
 if(labelProxies.has(value))return labelProxies.get(value);
 const proxy=new Proxy(value,{get(target,key,receiver){return localizeLabels(Reflect.get(target,key,receiver));}});
 labelProxies.set(value,proxy);return proxy;
}
