import {useEffect,useId,useRef,useState} from 'react';
import {FileText,BookOpen,ShieldCheck,PencilSimple,Info,ArrowsOut,ArrowsIn,Plus,Trash,Circle,CheckCircle} from '@phosphor-icons/react';
import {t,tm,useI18n} from './i18n';
import {Modal} from './Modal';
import {worldEditorCommands,parseWorldRuleLines,worldRuleTexts} from './worldEditorModel';
import './worldEditor.css';

const sections=[{id:'basic',label:'基础信息',Icon:FileText},{id:'premise',label:'故事前提',Icon:BookOpen},{id:'rules',label:'已确认规则',Icon:ShieldCheck},{id:'tone',label:'写作风格',Icon:PencilSimple}];

export function WorldEditor({local,onClose}) {
  useI18n();
  const [base]=useState(()=>structuredClone(local.project._document));
  const [draft,setDraft]=useState(()=>({name:base.name,world:structuredClone(base.content.world)}));
  const [rules,setRules]=useState(()=>base.content.world.rules.map((text,index)=>({id:`rule-${index}`,text})));
  const [section,setSection]=useState('premise'),[expanded,setExpanded]=useState(false),[bulk,setBulk]=useState(null);
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:760px)').matches);
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const saving=useRef(false),nextRule=useRef(base.content.world.rules.length),ruleFocus=useRef(null),navRef=useRef(null),panelId=useId();
  const dirty=JSON.stringify(draft)!==JSON.stringify({name:base.name,world:base.content.world}) || JSON.stringify(rules.map(row=>row.text))!==JSON.stringify(base.content.world.rules) || !!bulk;
  useEffect(()=>{const guard=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
  useEffect(()=>{const media=window.matchMedia('(max-width:760px)'),change=()=>setCompact(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const close=()=>{if(saving.current)return;if(dirty)setConfirm(true);else onClose();};
  useEffect(()=>{if(section==='rules'&&ruleFocus.current){document.getElementById(ruleFocus.current)?.focus();ruleFocus.current=null;}},[section,rules]);
  const addRules=texts=>{const added=texts.map(text=>({id:`rule-${nextRule.current++}`,text}));if(!added.length)return;ruleFocus.current=`${panelId}-${added[0].id}`;setRules(rows=>[...rows,...added]);};
  const save=async()=>{
    if(saving.current)return;
    if(!draft.name.trim() || !draft.world.name.trim()){setSection('basic');setError(t('项目名称和世界名称不能为空。'));return;}
    const nextRules=[...worldRuleTexts(rules),...(bulk===null?[]:parseWorldRuleLines(bulk))];
    if(nextRules.length>500){setSection('rules');setError(t('世界规则最多 500 条，请减少条目后保存。'));return;}
    for(const [key,label,value] of [['premise',t('故事前提'),draft.world.premise],['tone',t('写作风格'),draft.world.tone],...nextRules.map((value,index)=>['rules',t('规则 {0}',[index+1]),value])])if(Array.from(value).length>30000){setSection(key);setError(t('“{0}”最多 30000 字，当前输入已保留。',[label]));return;}
    saving.current=true;setBusy(true);setError('');
    try {
      const value={...draft,world:{...draft.world,rules:nextRules}};
      await local.transact(latest=>worldEditorCommands(base,value,latest));
      onClose();
    }catch(reason){setError(reason.message);}finally{saving.current=false;setBusy(false);}
  };
  const field=(key,value)=>setDraft(previous=>({...previous,world:{...previous.world,[key]:value}}));
  const blocked=busy||confirm;
  const tabsKey=e=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key)||blocked)return;e.preventDefault();const index=sections.findIndex(row=>row.id===section),next=e.key==='Home'?0:e.key==='End'?3:(index+(['ArrowDown','ArrowRight'].includes(e.key)?1:-1)+4)%4;setSection(sections[next].id);navRef.current.querySelectorAll('[role=tab]')[next].focus();};
  return <Modal title={t('世界底稿')} subtitle={t('整个项目共享的背景、规则与写作风格。')} onClose={close} wide className={`world-editor-modal ${expanded?'world-editor-expanded':''}`}>
    <button type="button" className="icon-button world-expand" disabled={busy} aria-label={t(expanded?'还原编辑窗口':'放大编辑窗口')} onClick={()=>setExpanded(value=>!value)}>{expanded?<ArrowsIn size={20}/>:<ArrowsOut size={20}/>}</button>
    <form noValidate onSubmit={e=>{e.preventDefault();save();}}>
      <div className="world-editor-layout">
        <aside className="world-editor-nav"><div ref={navRef} role="tablist" aria-label={t('世界底稿分区')} aria-orientation={compact?'horizontal':'vertical'} onKeyDown={tabsKey}>{sections.map(({id,label,Icon})=><button key={id} type="button" role="tab" id={`${panelId}-tab-${id}`} aria-selected={section===id} aria-controls={`${panelId}-${id}`} tabIndex={section===id?0:-1} disabled={blocked} onClick={()=>setSection(id)}><Icon size={20}/><span>{t(label)}</span></button>)}</div><p><Info size={17}/><span>{t('区域与局部剧情请在关卡设置中填写。')}</span></p></aside>
        <div className="world-editor-body" inert={blocked?true:undefined}>
          <section hidden={section!=='basic'} role="tabpanel" id={`${panelId}-basic`} aria-labelledby={`${panelId}-tab-basic`}><header><div><h3>{t('基础信息')}</h3><p>{t('项目文件与共享世界的名称。')}</p></div></header><div className="form-columns"><label className="form-field">{t('项目名称')}<input value={draft.name} aria-invalid={!draft.name.trim()} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label className="form-field">{t('世界名称')}<input value={draft.world.name} aria-invalid={!draft.world.name.trim()} onChange={e=>field('name',e.target.value)}/></label></div></section>
          <section hidden={section!=='premise'} role="tabpanel" id={`${panelId}-premise`} aria-labelledby={`${panelId}-tab-premise`} className="world-long-section"><header><div><h3>{t('故事前提')}</h3><p>{t('世界的起点、核心冲突与故事边界。')}</p></div><small>{t('{0} 字',[Array.from(draft.world.premise).length])}</small></header><textarea className="world-prose" aria-label={t('故事前提')} spellCheck={false} value={draft.world.premise} onChange={e=>field('premise',e.target.value)}/></section>
          <section hidden={section!=='rules'} role="tabpanel" id={`${panelId}-rules`} aria-labelledby={`${panelId}-tab-rules`}><header><div><h3>{t('已确认规则')}</h3><p>{t('角色与故事生成共同遵守的写作约束。')}</p></div><div className="world-rule-actions"><button className="secondary" type="button" disabled={bulk!==null} onClick={()=>setBulk('')}>{t('批量粘贴规则')}</button><button className="secondary" type="button" onClick={()=>addRules([''])}><Plus size={15}/>{t('添加规则')}</button></div></header>{bulk!==null&&<div className="world-bulk-editor"><label className="form-field">{t('批量粘贴规则 · 每行一条')}<textarea autoFocus value={bulk} rows={5} onChange={e=>setBulk(e.target.value)}/></label><div><button className="secondary" type="button" onClick={()=>setBulk(null)}>{t('取消')}</button><button className="secondary" type="button" disabled={!parseWorldRuleLines(bulk).length} onClick={()=>{addRules(parseWorldRuleLines(bulk));setBulk(null);}}>{t('添加到规则列表')}</button></div></div>}<div className="world-rule-list">{rules.map((row,index)=><div className="world-rule-row" key={row.id}><span>{index+1}</span><textarea id={`${panelId}-${row.id}`} aria-label={t('规则 {0}',[index+1])} value={row.text} rows={Math.min(8,Math.max(2,row.text.split('\n').length,Math.ceil(row.text.length/46)))} onChange={e=>setRules(rows=>rows.map(item=>item.id===row.id?{...item,text:e.target.value}:item))}/><button className="icon-button" type="button" aria-label={t('移除规则 {0}',[index+1])} onClick={()=>{ruleFocus.current=rules[index+1]?`${panelId}-${rules[index+1].id}`:rules[index-1]?`${panelId}-${rules[index-1].id}`:null;setRules(rows=>rows.filter(item=>item.id!==row.id));}}><Trash size={17}/></button></div>)}</div>{!rules.length&&<p className="world-rule-empty">{t('尚无规则，可逐条添加或批量粘贴。')}</p>}</section>
          <section hidden={section!=='tone'} role="tabpanel" id={`${panelId}-tone`} aria-labelledby={`${panelId}-tab-tone`} className="world-long-section"><header><div><h3>{t('写作风格')}</h3><p>{t('语气、措辞、叙事节奏与需要避免的表达。')}</p></div><small>{t('{0} 字',[Array.from(draft.world.tone).length])}</small></header><textarea className="world-prose" aria-label={t('写作风格')} spellCheck={false} value={draft.world.tone} onChange={e=>field('tone',e.target.value)}/></section>
        </div>
      </div>
      <footer className="world-editor-footer">{error&&<p className="danger" role="alert">{tm(error)}</p>}{confirm?<div className="world-close-guard" role="alert"><strong>{t('世界底稿有未保存的修改。')}</strong><div><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('不保存并关闭')}</button><button type="button" className="primary" disabled={busy} onClick={save}>{t('保存并关闭')}</button><button type="button" className="secondary" disabled={busy} onClick={()=>setConfirm(false)}>{t('继续编辑')}</button></div></div>:<div className="modal-actions"><span className={`world-draft-status ${dirty?'dirty':''}`}>{dirty?<Circle size={9} weight="fill"/>:<CheckCircle size={15}/>}<span role="status">{t(dirty?'未保存修改':'已载入保存内容')}</span></span><button type="button" className="secondary" disabled={busy} onClick={close}>{t('取消')}</button><button className="primary" disabled={busy}>{busy?t('保存中…'):t('保存并关闭')}</button></div>}</footer>
    </form>
  </Modal>;
}
