import {useEffect,useMemo,useRef,useState} from 'react';
import {MagnifyingGlass,ArrowLeft,ArrowRight} from '@phosphor-icons/react';
import {Modal} from './Modal';
import {LanguageSwitch} from './LanguageSwitch';
import {useI18n} from './i18n';
import {helpSections,searchHelp} from './helpContent';
import './help.css';

export function HelpPanel({onClose}){
 const {language}=useI18n();const en=language==='en';
 const [query,setQuery]=useState(''),[selected,setSelected]=useState('start');const content=useRef(null);
 const matches=useMemo(()=>searchHelp(query,language),[query,language]);
 const active=matches.find(s=>s.id===selected)||matches[0];
 const chapter=active?.[language];const index=helpSections.findIndex(s=>s.id===active?.id);
 useEffect(()=>{if(content.current)content.current.scrollTop=0;},[active?.id,language]);
 const go=next=>{setQuery('');setSelected(helpSections[next].id);};
 return <Modal className="help-manual" title={en?'NPCs AI Studio · User guide':'NPCs AI Studio · 使用帮助'} subtitle={en?'From a new project to playable dialogue, review and local delivery.':'从新建项目到对白编排、试玩、审核与本地交付。'} onClose={onClose} wide>
  <div className="help-toolbar"><label className="help-search"><MagnifyingGlass size={17}/><input aria-label={en?'Search help':'搜索帮助'} placeholder={en?'Search project, key, dialogue, recovery…':'搜索项目、密钥、对白、恢复…'} value={query} onChange={e=>setQuery(e.target.value)}/></label>{query&&<button className="secondary" onClick={()=>setQuery('')}>{en?'Clear':'清除'}</button>}<LanguageSwitch/></div>
  <div className="help-layout">
   <nav aria-label={en?'Guide chapters':'帮助章节'} className="help-chapters"><small>{en?`${matches.length} chapters`:`${matches.length} 个章节`}</small>{matches.map(s=><button key={s.id} aria-current={active?.id===s.id?'page':undefined} onClick={()=>setSelected(s.id)}><span>{String(helpSections.indexOf(s)+1).padStart(2,'0')}</span>{s[language].title}</button>)}</nav>
   <article ref={content} className="help-article" lang={en?'en':'zh-CN'} aria-labelledby={chapter?'help-chapter-title':undefined}>
    {chapter?<><small>{en?`Chapter ${index+1} / ${helpSections.length}`:`第 ${index+1} / ${helpSections.length} 章`}</small><h3 id="help-chapter-title">{chapter.title}</h3><p className="help-intro">{chapter.intro}</p><h4>{en?'Steps and controls':'步骤与操作'}</h4><ol>{chapter.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>{chapter.code&&<pre>{chapter.code}</pre>}<aside className="help-notes"><h4>{en?'Details to remember':'需要注意的细节'}</h4>{chapter.notes.map((note,i)=><p key={i}>{note}</p>)}</aside><div className="help-pagination"><button className="secondary" disabled={index<=0} onClick={()=>go(index-1)}><ArrowLeft size={15}/>{en?'Previous chapter':'上一章'}</button><button className="secondary" disabled={index===helpSections.length-1} onClick={()=>go(index+1)}>{en?'Next chapter':'下一章'}<ArrowRight size={15}/></button></div></>:<p role="status">{en?'No matching chapters. Try another keyword or clear the search.':'没有匹配章节，请更换关键词或清除搜索。'}</p>}
   </article>
  </div>
  <div className="modal-actions"><small>{en?'Interface language does not translate your story content.':'界面语言不会翻译你的故事内容。'}</small><button className="primary" onClick={onClose}>{en?'Return to workbench':'返回工作台'}</button></div>
 </Modal>;
}
