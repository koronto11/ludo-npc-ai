import {MoreDetails} from './MoreDetails';
import {authorEntityCommands} from './moreDetailsModel';
import {localizeLabels} from './i18n.js';
import { t, tm, useI18n } from './i18n';
import { useEffect, useState } from 'react';
import { useNavigationEditor } from './UnsavedNavigation';
import { Plus, Trash } from '@phosphor-icons/react';
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const copy = value => structuredClone(value);
const kinds = localizeLabels({ event:'剧情事件', rule:'条件规则', dialogue:'对话图', text:'非对话文本', fact:'世界事实', variable:'故事变量' });
const collections = { event:'events',rule:'rules',dialogue:'dialogues',text:'texts',fact:'facts',variable:'variables' };
const effectNames = localizeLabels({ set_variable:'设置变量',increment_variable:'增减变量',grant_knowledge:'授予认知',move_character:'改变人物地点',set_behavior:'改变人物行为',unlock_text:'解锁文本' });
const conditionNames = localizeLabels({ always:'无额外条件',all:'全部满足',any:'任一满足',not:'条件取反',variable:'变量比较',time:'故事时间',knows:'人物知道事实',at_location:'人物位于地点',scene:'当前场景',event_occurred:'事件已发生',appearance:'跟随人物出场' });
function SelectRef({ label, rows, value, onChange, optional = false }) {
  useI18n(); return <label>{label}<select aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value || null)}><option value="">{optional ? t("不指定") : t("请选择")}</option>{rows.map(row => <option key={row.id} value={row.id}>{row.name || row.label || row.text || row.id}</option>)}</select></label>; }
function ScalarField({ label, type, value, onChange }) {
  useI18n(); return <label>{label}{type === 'boolean' ? <select aria-label={label} value={String(value)} onChange={e => onChange(e.target.value === 'true')}><option value="true">{t("是")}</option><option value="false">{t("否")}</option></select> : <input aria-label={label} type={type === 'number' ? 'number' : 'text'} step={type === 'number' ? 'any' : undefined} value={value ?? ''} onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} />}</label>; }
const valueDefault = type => type === 'boolean' ? false : type === 'number' ? 0 : '';
function conditionDefault(op,c) {
  const result = { op };
  if (op === 'all' || op === 'any') result.conditions = [{ op:'always' }];
  if (op === 'not') result.condition = { op:'always' };
  if (op === 'variable') { result.variable_id = c.variables[0]?.id || ''; result.comparison='eq'; result.value=c.variables[0]?.default ?? 0; }
  if (op === 'time') { result.comparison='gte'; result.value=0; }
  if (['knows','at_location'].includes(op)) result.character_id=c.characters[0]?.id || '';
  if (op === 'knows') result.fact_id=c.facts[0]?.id || '';
  if (['at_location','scene'].includes(op)) result.location_id=c.locations[0]?.id || '';
  if (op === 'appearance') { result.level_id=c.levels[0]?.id || ''; result.appearance_id=c.levels[0]?.appearances[0]?.id || ''; }
  if (op === 'event_occurred') result.event_id=c.events[0]?.id || '';
  return result;
}
export function ConditionEditor({ value = { op:'always' }, onChange, content:c, depth=0, allowAppearance=true }) {
  useI18n();
  const update = patch => onChange({ ...value, ...patch });
  const variable=c.variables.find(v => v.id === value.variable_id);
  return <div className="condition-editor"><label>{t("条件类型")}<select aria-label={t("条件类型")} value={value.op} onChange={e => onChange(conditionDefault(e.target.value,c))}>{Object.entries(conditionNames).filter(([op]) => (allowAppearance || op!=='appearance') && (op!=='appearance'||c.levels.some(l=>l.appearances.length)) && (depth < 12 || !['all','any','not'].includes(op))).map(([op,name]) => <option key={op} value={op}>{name}</option>)}</select></label>
    {value.op === 'variable' && <SelectRef label={t("条件变量")} rows={c.variables} value={value.variable_id} onChange={id => update({ variable_id:id, value:c.variables.find(v => v.id === id)?.default ?? 0, comparison:'eq' })} />}
    {['variable','time'].includes(value.op) && <><label>{t("比较")}<select aria-label={t("比较方式")} value={value.comparison} onChange={e => update({ comparison:e.target.value })}>{Object.entries({eq:'等于',ne:'不等于',gte:'大于等于',lte:'小于等于',gt:'大于',lt:'小于'}).filter(([op]) => value.op === 'time' || variable?.value_type === 'number' || ['eq','ne'].includes(op)).map(([op,name]) => <option value={op} key={op}>{t(name)}</option>)}</select></label><ScalarField label={t("条件值")} type={value.op === 'time' ? 'number' : variable?.value_type || 'number'} value={value.value} onChange={v => update({ value:v })} /></>}
    {['knows','at_location'].includes(value.op) && <SelectRef label={t("条件人物")} rows={c.characters} value={value.character_id} onChange={id => update({ character_id:id })} />}
    {value.op === 'knows' && <SelectRef label={t("条件事实")} rows={c.facts} value={value.fact_id} onChange={id => update({ fact_id:id })} />}
    {['at_location','scene'].includes(value.op) && <SelectRef label={t("条件地点")} rows={c.locations} value={value.location_id} onChange={id => update({ location_id:id })} />}
    {value.op === 'appearance' && <><SelectRef label={t("跟随出场的关卡")} rows={c.levels} value={value.level_id} onChange={id=>update({level_id:id,appearance_id:c.levels.find(l=>l.id===id)?.appearances[0]?.id || ''})}/><SelectRef label={t("跟随的人物出场")} rows={(c.levels.find(l=>l.id===value.level_id)?.appearances || []).map(a=>({...a,name:`${c.characters.find(v=>v.id===a.character_id)?.name} · ${c.levels.find(l=>l.id===value.level_id)?.tracks.find(t=>t.id===a.track_id)?.name || '待安排'} · ${a.start_tick}–${a.end_tick}`}))} value={value.appearance_id} onChange={id=>update({appearance_id:id})}/></>}
    {value.op === 'event_occurred' && <SelectRef label={t("条件事件")} rows={c.events} value={value.event_id} onChange={id => update({ event_id:id })} />}
    {value.op === 'not' && <ConditionEditor value={value.condition} content={c} depth={depth+1} allowAppearance={allowAppearance} onChange={v => update({ condition:v })} />}
    {['all','any'].includes(value.op) && <div className="condition-children">{value.conditions.map((child,i) => <div key={i}><ConditionEditor value={child} content={c} depth={depth+1} allowAppearance={allowAppearance} onChange={v => update({ conditions:value.conditions.map((x,j) => i === j ? v : x) })} /><button type="button" className="subtle-button danger" disabled={value.conditions.length === 1} onClick={() => update({ conditions:value.conditions.filter((_,j) => j !== i) })}>{t("移除此条件")}</button></div>)}<button type="button" className="secondary" disabled={value.conditions.length >= 64} onClick={() => update({ conditions:[...value.conditions,{op:'always'}] })}><Plus size={12} />{t("添加条件")}</button></div>}
  </div>;
}
function effectDefault(op,c) {
  const e={op};
  if (['set_variable','increment_variable'].includes(op)) { const v=c.variables.find(v => op !== 'increment_variable' || v.value_type === 'number'); e.variable_id=v?.id || ''; if(op === 'set_variable') e.value=v?.default ?? 0; else e.amount=1; }
  if (['grant_knowledge','move_character','set_behavior'].includes(op)) e.character_id=c.characters[0]?.id || '';
  if (op === 'grant_knowledge') e.fact_id=c.facts[0]?.id || '';
  if (op === 'move_character') e.location_id=c.locations[0]?.id || '';
  if (op === 'set_behavior') e.behavior='';
  if (op === 'unlock_text') e.text_id=c.texts[0]?.id || '';
  return e;
}
export function EffectsEditor({ value=[], onChange, content:c, label='执行效果' }) {
  useI18n();
  return <div className="effects-editor"><h4>{label}</h4>{value.map((e,i) => { const update=patch => onChange(value.map((x,j) => i === j ? {...e,...patch} : x)); const variable=c.variables.find(v => v.id === e.variable_id); return <div className="effect-row" key={i}><label>{t("效果类型")}<select aria-label={t("效果类型")} value={e.op} onChange={event => onChange(value.map((x,j) => i === j ? effectDefault(event.target.value,c) : x))}>{Object.entries(effectNames).map(([op,name]) => <option value={op} key={op}>{t(name)}</option>)}</select></label>
    {e.variable_id !== undefined && <SelectRef label={t("效果变量")} rows={c.variables.filter(v => e.op !== 'increment_variable' || v.value_type === 'number')} value={e.variable_id} onChange={id => update({ variable_id:id, ...(e.op === 'set_variable' ? {value:c.variables.find(v => v.id === id)?.default ?? 0} : {}) })} />}
    {e.op === 'set_variable' && <ScalarField label={t("设置值")} type={variable?.value_type || 'number'} value={e.value} onChange={v => update({value:v})} />}
    {e.op === 'increment_variable' && <ScalarField label={t("变化量")} type="number" value={e.amount} onChange={v => update({amount:v})} />}
    {e.character_id !== undefined && <SelectRef label={t("效果人物")} rows={c.characters} value={e.character_id} onChange={id => update({character_id:id})} />}
    {e.fact_id !== undefined && <SelectRef label={t("授予的事实")} rows={c.facts} value={e.fact_id} onChange={id => update({fact_id:id})} />}
    {e.location_id !== undefined && <SelectRef label={t("移动至地点")} rows={c.locations} value={e.location_id} onChange={id => update({location_id:id})} />}
    {e.text_id !== undefined && <SelectRef label={t("解锁文本")} rows={c.texts} value={e.text_id} onChange={id => update({text_id:id})} />}
    {e.behavior !== undefined && <label>{t("新行为")}<input aria-label={t("新行为")} value={e.behavior} onChange={event => update({behavior:event.target.value})} /></label>}
    <button type="button" className="subtle-button danger" onClick={() => onChange(value.filter((_,j) => i !== j))}><Trash size={12} />{t("移除效果")}</button></div>; })}<button type="button" className="secondary" onClick={() => onChange([...value,effectDefault('set_behavior',c)])}><Plus size={12} />{t("添加效果")}</button></div>;
}
function fresh(kind,c) {
  const row={id:uid(kind),kind,name:`新的${kinds[kind]}`};
  if (['event','rule','text'].includes(kind)) row.condition={op:'always'};
  if (['event','rule'].includes(kind)) { row.enabled=true; row.effects=[]; }
  if(kind === 'event') { row.scheduled_at=c.initial_state.tick; row.priority=0; row.affected_character_ids=[]; }
  if(kind === 'dialogue') { const node=uid('node'); row.character_id=c.characters[0]?.id || null; row.entry_node_id=node; row.entry_routes=[]; row.nodes=[{id:node,text:'',speaker_id:row.character_id,condition:{op:'always'},effects:[],options:[]}]; }
  if(kind === 'text') { row.body='';row.text_type='custom';row.author_id=c.characters[0]?.id || null; }
  if(kind === 'fact') { row.description='';row.available_at=c.initial_state.tick;row.visibility='private';row.truth='true'; }
  if(kind === 'variable') { row.value_type='number';row.default=0; }
  return row;
}
function DialogueDefinition({ row, update, content:c }) {
  useI18n();
  const nodes=row.nodes;
  const patchNode=(index,patch) => update({nodes:nodes.map((n,i) => i === index ? {...n,...patch} : n)});
  return <><SelectRef label={t("对话所属人物")} rows={c.characters} optional value={row.character_id} onChange={id => update({character_id:id})} /><SelectRef label={t("默认入口节点")} rows={nodes} value={row.entry_node_id} onChange={id => update({entry_node_id:id})} /><h3>{t("条件入口 · 从上到下匹配")}</h3>{(row.entry_routes || []).map((route,i) => <div className="node-definition" key={i}><SelectRef label={t("条件入口节点")} rows={nodes} value={route.node_id} onChange={id => update({entry_routes:row.entry_routes.map((r,j) => i===j ? {...r,node_id:id} : r)})} /><ConditionEditor value={route.condition} content={c} onChange={condition => update({entry_routes:row.entry_routes.map((r,j) => i===j ? {...r,condition} : r)})} /><button type="button" className="subtle-button danger" onClick={() => update({entry_routes:row.entry_routes.filter((_,j) => i!==j)})}>{t("删除条件入口")}</button></div>)}<button className="secondary" type="button" onClick={() => update({entry_routes:[...(row.entry_routes || []),{node_id:row.entry_node_id,condition:{op:'always'}}]})}>{t("添加条件入口")}</button><h3>{t("对话节点与玩家选项")}</h3>{nodes.map((n,i) => <details className="node-definition" open={i===0 || undefined} key={n.id}><summary>{n.label || t("节点 {0}", [i+1])} <small>{n.options?.length || 0}{t(" 个选项")}</small></summary><label>{t("节点标题")}<input aria-label={t("节点 {0} 标题", [i+1])} value={n.label || ''} onChange={e => patchNode(i,{label:e.target.value})} /></label><SelectRef label={t("节点 {0} 说话者", [i+1])} rows={c.characters} optional value={n.speaker_id} onChange={id => patchNode(i,{speaker_id:id})} /><label>{t("对白")}<textarea aria-label={t("节点 {0} 对白", [i+1])} value={n.text} onChange={e => patchNode(i,{text:e.target.value})} /></label><h4>{t("节点出现条件")}</h4><ConditionEditor value={n.condition} content={c} onChange={condition => patchNode(i,{condition})} /><EffectsEditor label={t("进入节点时的效果")} content={c} value={n.effects} onChange={effects => patchNode(i,{effects})} />{(n.options || []).map((o,j) => { const change=patch => patchNode(i,{options:n.options.map((x,k) => j===k ? {...x,...patch} : x)}); return <div className="option-definition" key={o.id}><label>{t("玩家选项")}<input aria-label={t("节点 {0} 选项 {1}", [i+1, j+1])} value={o.text} onChange={e => change({text:e.target.value})} /></label><SelectRef label={t("选项跳转")} rows={nodes} optional value={o.target_node_id} onChange={id => change({target_node_id:id})} /><small>{t("不指定跳转则结束对话；可跳向已有节点汇合，也可有意循环。")}</small><ConditionEditor content={c} value={o.condition} onChange={condition => change({condition})} /><EffectsEditor label={t("选择后的效果")} content={c} value={o.effects} onChange={effects => change({effects})} /><button type="button" className="subtle-button danger" onClick={() => patchNode(i,{options:n.options.filter((_,k) => j!==k)})}>{t("删除选项")}</button></div>; })}<button type="button" className="secondary" onClick={() => patchNode(i,{options:[...(n.options || []),{id:uid('option'),text:'新选项',condition:{op:'always'},effects:[],target_node_id:null}]})}>{t("添加玩家选项")}</button><button type="button" className="subtle-button danger" disabled={nodes.length<=1} onClick={() => update({nodes:nodes.filter((_,j) => i!==j)})}>{t("删除节点")}</button></details>)}<button type="button" className="secondary" onClick={() => update({nodes:[...nodes,{id:uid('node'),label:'新节点',text:'',speaker_id:row.character_id,condition:{op:'always'},effects:[],options:[]}]})}>{t("添加对话节点")}</button></>;
}
export function StoryAuthoring({ local, announce, initialId, initialKind, onPreview, onDirtyChange, allowedKinds, onNavigationHandlers }) {
  useI18n();
  const document=local.project._document;
  const [kind,setKind]=useState('event');
  const [row,setRow]=useState(null);
  const [base,setBase]=useState(null);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{if(!dirty)setBase(row?structuredClone(row):null);},[row,dirty]);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  useEffect(() => { if(!document) return; const found=Object.values(collections).flatMap(key => document.content[key]).find(r => r.id === initialId); const first=found || (allowedKinds ? document.content[collections[initialKind || allowedKinds[0]]]?.[0] : document.content.events[0] || document.content.dialogues[0]);setKind(initialId === 'initial' ? 'initial' : first?.kind || initialKind || allowedKinds?.[0] || 'event');setRow(initialId === 'initial' ? {kind:'initial',state:copy(document.content.initial_state),clock_unit:document.content.world.clock_unit} : first ? copy(first) : null);setDirty(false);setError(''); },[document?.project_id,initialId,initialKind]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); },[dirty,onDirtyChange]);
  useEffect(() => { const unload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload); },[dirty]);
  useNavigationEditor(onNavigationHandlers,{dirty,busy:saving,name:row?.name || '剧情资料',save:()=>save(),discard:()=>{discard();return true;}});
  if(!document) return <div className="empty-state">{t("正在载入本地工程…")}</div>;
  const c=document.content;
  const update=patch => { setRow(previous => ({...previous,...patch}));setDirty(true);setError(''); };
  const discard=() => { setRow(row?.kind === 'initial' ? {kind:'initial',state:copy(c.initial_state),clock_unit:c.world.clock_unit} : copy(c[collections[kind]]?.find(r => r.id===row?.id) || null));setDirty(false);setError(''); };
  const chooseKind=next => { if(dirty) {announce(t("请先提交或放弃当前编辑"));return;}setKind(next);setRow(next==='initial' ? {kind:'initial',state:copy(c.initial_state),clock_unit:c.world.clock_unit} : copy(c[collections[next]][0] || null));setError(''); };
  const save=async event => { event?.preventDefault();if(saving || !row)return false;setSaving(true);setError('');try { let commands; if(row.kind==='initial') commands=[{type:'set_initial_state',state:row.state},{type:'replace_world',world:{...c.world,clock_unit:row.clock_unit}}]; else { commands=latest=>authorEntityCommands(base,row,latest); } const updated=await local.transact(commands);setRow(row.kind==='initial' ? {kind:'initial',state:copy(updated.content.initial_state),clock_unit:updated.content.world.clock_unit} : copy(updated.content[collections[kind]].find(r=>r.id===row.id)));setDirty(false);announce(t("剧情定义已提交，预演将按新内容版本重算"));return true; }catch(reason){setError(reason.message);return false;}finally{setSaving(false);} };
  return <div className="story-authoring"><div className="workspace-heading"><div><small>{t("作者定义 / 条件与对话")}</small><h1>{allowedKinds?t("剧情资料"):t("剧情编排")}</h1><p>{t("先定义事实和变量，再编排事件、效果与对话。所有修改经 Python 校验。")}</p></div><button className="secondary" onClick={onPreview}>{t("预演当前剧情")}</button></div><div className="authoring-layout"><nav className="authoring-nav">{Object.entries({...kinds,initial:'初始状态'}).filter(([key])=>!allowedKinds || allowedKinds.includes(key)).map(([key,name]) => <button className={kind===key ? 'active' : ''} key={key} onClick={()=>chooseKind(key)}>{t(name)}<small>{key==='initial' ? '' : c[collections[key]].length}</small></button>)}{kind!=='initial' && <button className="secondary" onClick={()=>{if(dirty){announce(t("先提交或放弃编辑"));return;}setRow(fresh(kind,c));setDirty(true);}}><Plus size={14}/>{t("新增")}{t(kinds[kind])}</button>}</nav><div className="authoring-form">{kind!=='initial' && <SelectRef label={t("编辑对象")} rows={c[collections[kind]]} value={c[collections[kind]].some(r=>r.id===row?.id)?row?.id:''} onChange={id=>{if(dirty){announce(t("先提交或放弃编辑"));return;}setRow(copy(c[collections[kind]].find(r=>r.id===id) || null));}} />}
    {!row ? <div className="empty-state"><p>{t("尚无")}{t(kinds[kind])}{t("，从左侧新增。")}</p></div> : <form onSubmit={save}>
    {row.kind!=='initial' && <><label>{t("名称")}<input required aria-label={t("剧情对象名称")} value={row.name} onChange={e=>update({name:e.target.value})}/></label>{row.kind!=='text' && <label>{t("说明")}<textarea aria-label={t("剧情对象说明")} value={row.description || ''} onChange={e=>update({description:e.target.value})}/></label>}</>}
    {row.kind!=='initial'&&<MoreDetails value={row} description={row.kind==='text'} disabled={saving} onChange={update}/>}
    {row.kind==='fact' && <><label>{t("可获知时间")}<input aria-label={t("事实可获知时间")} type="number" min="0" step="1" value={row.available_at} onChange={e=>update({available_at:Number(e.target.value)})}/></label><label>{t("真实性")}<select value={row.truth} onChange={e=>update({truth:e.target.value})}><option value="true">{t("真实")}</option><option value="false">{t("错误事实")}</option><option value="unknown">{t("尚未确定")}</option></select></label><label>{t("可见范围")}<select value={row.visibility} onChange={e=>update({visibility:e.target.value})}><option value="private">{t("私有")}</option><option value="public">{t("公开")}</option></select></label><p className="muted-text">{t("公开标记不等于人物已获知；通过初始认知或授予认知效果指定人物所知。")}</p></>}
    {row.kind==='variable' && <><label>{t("变量类型")}<select aria-label={t("变量类型")} value={row.value_type} onChange={e=>update({value_type:e.target.value,default:valueDefault(e.target.value)})}><option value="number">{t("数值")}</option><option value="boolean">{t("布尔")}</option><option value="text">{t("文字")}</option></select></label><ScalarField label={t("默认值")} type={row.value_type} value={row.default} onChange={v=>update({default:v})}/></>}
    {['event','rule'].includes(row.kind) && <><label className="checkbox-label"><input type="checkbox" checked={row.enabled} onChange={e=>update({enabled:e.target.checked})}/>{t("启用")}</label>{row.kind==='event' && <div className="form-columns"><label>{t("计划时间")}<input aria-label={t("事件计划时间")} type="number" min="0" step="1" value={row.scheduled_at} onChange={e=>update({scheduled_at:Number(e.target.value)})}/></label><label>{t("优先级")}<input type="number" step="1" value={row.priority} onChange={e=>update({priority:Number(e.target.value)})}/></label></div>}<h3>{t("触发条件")}</h3><ConditionEditor value={row.condition} content={c} onChange={condition=>update({condition})}/><EffectsEditor content={c} value={row.effects} onChange={effects=>update({effects})}/><p className="muted-text">{t("事件到达计划时间后持续等待条件满足；事件和规则在一个分支内各触发一次。")}</p></>}
    {row.kind==='dialogue' && <DialogueDefinition row={row} update={update} content={c}/>}
    {row.kind==='text' && <><label>{t("文本类型")}<select value={row.text_type} onChange={e=>update({text_type:e.target.value})}>{Object.entries({letter:'信件',diary:'日记',rumor:'传闻',biography:'人物小传',quest:'任务说明',custom:'其他'}).map(([key,name])=><option key={key} value={key}>{t(name)}</option>)}</select></label><SelectRef label={t("文本作者")} optional rows={c.characters} value={row.author_id} onChange={id=>update({author_id:id})}/><label>{t("文本正文")}<textarea aria-label={t("非对话文本正文")} value={row.body} onChange={e=>update({body:e.target.value})}/></label><h3>{t("出现条件")}</h3><ConditionEditor content={c} value={row.condition} onChange={condition=>update({condition})}/></>}
    {row.kind==='initial' && <><label>{t("时钟单位")}<select aria-label={t("世界时钟单位")} value={row.clock_unit} onChange={e=>update({clock_unit:e.target.value})}><option value="day">{t("天")}</option><option value="minute">{t("分钟")}</option><option value="chapter">{t("章")}</option></select></label><label>{t("故事起点")}<input aria-label={t("故事初始时间")} type="number" min="0" step="1" value={row.state.tick} onChange={e=>update({state:{...row.state,tick:Number(e.target.value)}})}/></label><h3>{t("变量初值")}</h3>{c.variables.map(v=><ScalarField key={v.id} label={t("初始 {0}", [v.name])} type={v.value_type} value={row.state.variables[v.id] ?? v.default} onChange={value=>update({state:{...row.state,variables:{...row.state.variables,[v.id]:value}}})}/>)}<h3>{t("人物初始状态")}</h3>{c.characters.map(actor=>{const state=row.state.characters[actor.id] || {location_id:null,behavior:'',known_fact_ids:[]};const change=patch=>update({state:{...row.state,characters:{...row.state.characters,[actor.id]:{...state,...patch}}}});return <section className="node-definition" key={actor.id}><h4>{actor.name}</h4><SelectRef label={t("{0} 初始地点", [actor.name])} optional rows={c.locations} value={state.location_id} onChange={id=>change({location_id:id})}/><label>{t("初始行为")}<input aria-label={t("{0} 初始行为", [actor.name])} value={state.behavior} onChange={e=>change({behavior:e.target.value})}/></label><h4>{t("初始知道的事实")}</h4>{c.facts.map(f=><label className="checkbox-label" key={f.id}><input type="checkbox" disabled={f.available_at>row.state.tick && !state.known_fact_ids.includes(f.id)} checked={state.known_fact_ids.includes(f.id)} onChange={e=>change({known_fact_ids:e.target.checked?[...state.known_fact_ids,f.id]:state.known_fact_ids.filter(id=>id!==f.id)})}/>{f.name}{f.available_at>row.state.tick?t(" · 未来事实"):''}</label>)}</section>;})}</>}
    {error && <p role="alert" className="danger">{tm(error)}</p>}<div className="authoring-submit"><span>{dirty?t("有未提交编辑"):t("已载入定义")}</span><button type="button" className="secondary" onClick={discard}>{t("放弃编辑")}</button><button className="primary" type="submit" disabled={saving || !dirty}>{saving?t("正在校验和保存…"):t("提交剧情定义")}</button></div></form>}
  </div></div></div>;
}
