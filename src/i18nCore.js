import baseEnglish from './locales/en.json' with {type:'json'};
import extraEnglish from './locales/en-extra.json' with {type:'json'};
import storyEnglish from './locales/en-story.json' with {type:'json'};
const english={...baseEnglish,...extraEnglish,...storyEnglish};

export const SUPPORTED_LANGUAGES=['zh','en'];
export const englishCatalog=english;
export function translate(key,values=[],language='zh') {
  if(typeof key!=='string')return key;
  const text=language==='en'?(english[key]??key):key;
  return text.replace(/\{(\d+)\}/g,(match,index)=>index<values.length?String(values[index]??''):match);
}
const chinese=Object.fromEntries(Object.entries(english).map(([key,value])=>[value,key]));
const compilePatterns=catalog=>Object.entries(catalog).filter(([key])=>/\{\d+\}/.test(key)).map(([key,value])=>{
  const indexes=[];
  const expression=key.split(/(\{\d+\})/g).map(part=>{
    if(/^\{\d+\}$/.test(part)){indexes.push(Number(part.slice(1,-1)));return '(.*?)';}
    return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }).join('');
  return {pattern:new RegExp(`^${expression}$`,'s'),value,indexes};
});
const messagePatterns={en:compilePatterns(english),zh:compilePatterns(chinese)};
export function translateMessage(message,language='zh') {
  if(typeof message!=='string')return message;
  const catalog=language==='en'?english:chinese;
  if(catalog[message])return catalog[message];
  // Known service/UI patterns only. Never call this on authored names or prose.
  for(const {pattern,value,indexes} of messagePatterns[language==='en'?'en':'zh']){
    const match=message.match(pattern);
    if(match){const args=[];indexes.forEach((index,i)=>{args[index]=match[i+1];});return value.replace(/\{(\d+)\}/g,(_,i)=>args[i]??'');}
  }
  return message;
}
export function translateError(body,status,language='zh') {
  const original=body.message||body.details?.[0]?.msg||'';
  const rendered=translateMessage(original,language);
  const labels={revision_conflict:'项目版本冲突，请重新打开或另存副本',session_required:'本机会话已失效，请重新连接服务',foreign_origin:'仅允许同源的本机访问',project_not_found:'项目不存在，请重新打开',invalid_document:'请检查输入数据、引用与字段类型',stale_simulation:'内容版本已变化，请用最新工程重新预演'};
  const fallback=translate(labels[body.error]|| (status===409?'项目版本冲突，请重新打开或另存副本':status===401?'本机会话已失效，请重新连接服务':'本地服务请求失败'),[],language);
  if(!original)return fallback;
  if(language==='zh'||rendered!==original||!/[\u3400-\u9fff]/.test(original))return rendered;
  return `${fallback}\n${translate('服务返回的原始说明',[],language)}: ${original}`;
}
