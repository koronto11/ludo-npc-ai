import {MoreDetails,DraftCloseGuard,useDraftClose} from './MoreDetails';
import {groupSettingsLevel} from './moreDetailsModel';
import { t, tm, useI18n } from './i18n';
import {useEffect,useState} from 'react';
import {Users,CaretDown,CaretRight,Sparkle,GearSix} from '@phosphor-icons/react';
import {Modal} from './Modal';
import {ControlWidthHandle} from './ControlWidthHandle';
import {uid} from './planning';
import {groupIntervalSummary,appearanceGroupStyle} from './appearanceGroups';
import {npcGroupMembers,npcGroupBounds,groupDialogueCommands} from './npcGroups';
import './npcGroups.css';

export function NpcGroupCard({document,level,group,expanded,onToggle,style,dragging,locked,onDrag,onEdit,onReview,onGenerate,onConfigure,onWorkbench,onAppearance,onResize,onResizeKey,onManage}){
  useI18n();
  const [details,setDetails]=useState(false);
  const members=npcGroupMembers(document,level,group),bounds=groupIntervalSummary(level,group.id);
  return <article data-control-key={`group:${group.id}`} className={`npc-group-card ${appearanceGroupStyle(document.content,level,group)==='appearance'?'appearance-group-card':''} ${dragging?'dragging-control':''} ${expanded?'expanded':'collapsed'} ${details?'':'compact-members'}`} style={style} data-testid={`npc-group-${group.id}`}>
    <header><button className="npc-group-grip" disabled={locked} onPointerDown={onDrag} aria-label={t("移动 NPC 组 {0}", [group.name])} title={t("上下拖动排列 · 左右调整时间 · 拖到其他场景移动")}><Users size={18}/><span><strong title={`${group.name} · ${members.map(m=>m.actor?.name).join("、")}`} >{group.name}</strong><small title={t("{0} 人 · 出场 {1}–{2} · {3} 人待审核", [members.length, bounds.start, bounds.end, members.filter(m=>m.drafts.length).length])}>{members.length}{t(" 人 · ")}{bounds.mixed?t("覆盖 {0}–{1}",[bounds.start,bounds.end]):`${bounds.start}–${bounds.end}`}{bounds.mixed?t(" · 成员时间不同"):""}{t(" · 待审核 ")}{members.filter(m=>m.drafts.length).length}</small></span></button><button className="icon-button" disabled={locked} aria-label={t("管理出场组成员 {0}",[group.name])} title={t("管理成员 / 解散组")} onClick={onManage}><Users size={16}/></button><button className="icon-button" aria-label={t("配置 NPC 组 {0}", [group.name])} disabled={locked} onClick={onConfigure}><GearSix size={16}/></button><button className="icon-button" aria-label={t("{0} NPC 组 {1}", [expanded?t("收起"):t("展开"), group.name])} aria-expanded={expanded} aria-controls={`npc-group-members-${group.id}`} title={expanded?t("收起 NPC 组"):t("展开 NPC 组")} onClick={onToggle}>{expanded?<CaretDown/>:<CaretRight/>}</button></header>
    {expanded&&<><div className="npc-group-members" id={`npc-group-members-${group.id}`}>{members.map(m=><div className="npc-group-member" key={m.appearance.id} data-testid={`appearance-${m.appearance.id}`}><div className="npc-member-identity"><button className="subtle-button" disabled={locked} title={t("调整这个人物的出场时间与条件")} onClick={()=>onAppearance(m.appearance)}>{m.actor?.name}</button><small>{m.actor?.role} · {m.appearance.start_tick}–{m.appearance.end_tick}{m.appearance.condition?.op!=="always"?t(" · 有条件"):""}{!details&&<span className="npc-compact-status">{t(m.status)}</span>}</small></div><div className="npc-member-speech"><span className={`npc-member-status ${m.drafts.length?'pending':''}`}>{t(m.status)}{m.lines>0?t(" · {0} 张台词卡", [m.lines]):''}</span><p title={m.preview}>{m.preview}</p></div><div className="npc-member-actions">{m.drafts.length>0?<button className="primary" disabled={locked} onClick={()=>onReview(m.drafts[0])}>{t("审核")}{m.drafts.length>1?` ${m.drafts.length}`:''}</button>:null}{m.failure&&!m.generating?<button className="secondary" disabled={locked||m.generating} title={tm(m.failure.item.error)} onClick={()=>onGenerate(m.appearance.id)}>{t("重试台词")}</button>:null}<button className="secondary" disabled={locked} aria-label={t("编辑台词 {0}", [m.actor?.name])} onClick={()=>onEdit(m.appearance.id)}>{t("编辑台词")}</button><button className="subtle-button" disabled={locked} onClick={()=>onWorkbench(m.appearance)}>{t("编排 / 试玩")}</button></div></div>)}</div><footer><button className="subtle-button" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>{t(details?"精简成员列表":"显示台词摘要")}</button><button className="secondary" disabled={locked||!members.length||members.some(m=>m.generating)} onClick={()=>onGenerate()}><Sparkle size={13}/>{t("批量生成台词")}</button></footer></>}
    <ControlWidthHandle kind="group" name={group.name} width={style.width} locked={locked} onResize={onResize} onResizeKey={onResizeKey}/>
  </article>;
}

export function NpcMemberEditor({local,levelId,appearanceId,onClose,announce}){
  useI18n();
  const doc=local.project._document,level=doc.content.levels.find(l=>l.id===levelId),appearance=level?.appearances.find(a=>a.id===appearanceId);
  const group=level?.npc_groups.find(g=>g.id===appearance?.npc_group_id),member=group&&npcGroupMembers(doc,level,group).find(m=>m.appearance.id===appearanceId);
  const [graphId,setGraphId]=useState(member?.dialogues[0]?.id || '');
  const original=member?.dialogues.find(g=>g.id===graphId);
  const initial=original?.nodes || [{id:uid('node'),label:'场景闲聊',speaker_id:member?.actor.id,text:'',condition:{op:'always'},effects:[],options:[]}];
  const [baseNodes,setBaseNodes]=useState(initial),[baseActor]=useState(member?.actor),[nodes,setNodes]=useState(initial),[name,setName]=useState(member?.actor.name || ''),[role,setRole]=useState(member?.actor.role || ''),[dirty,setDirty]=useState(false),[prompt,setPrompt]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const handler=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const close=()=>{if(!busy){if(dirty)setPrompt(true);else onClose();}};
  const save=async()=>{if(busy)return;setBusy(true);setError('');try{
    if(!name.trim()||!nodes.some(n=>n.text.trim()))throw new Error(t("填写人物名称与至少一句台词"));
    const latest=await local.exportDocument(),current=latest.content.levels.find(l=>l.id===levelId),a=current?.appearances.find(a=>a.id===appearanceId);
    const actor=latest.content.characters.find(c=>c.id===a?.character_id),graph=graphId?latest.content.dialogues.find(g=>g.id===graphId):null;
    if(!a||!actor||(graphId&&!graph))throw new Error(t("人物或对白已变更，请重新打开"));
    if(graph&&JSON.stringify(graph.nodes)!==JSON.stringify(baseNodes))throw new Error(t("台词已被其他编辑修改，请重新打开后核对"));
    if((name!==baseActor.name||role!==baseActor.role)&&(actor.name!==baseActor.name||actor.role!==baseActor.role))throw new Error(t("人物身份已被其他编辑修改，请重新打开后核对"));
    const commands=groupDialogueCommands(latest.content,current,a,graph,nodes,uid);
    if(name!==baseActor.name||role!==baseActor.role)commands.unshift({type:'patch_entity',target:{kind:'character',id:actor.id},changes:{name:name.trim(),role}});
    await local.transact(commands);setDirty(false);announce(t("人物台词已保存"));onClose();
  }catch(reason){setError(reason.message);}finally{setBusy(false);}};
  if(!member)return <Modal title={t("成员已变更")} onClose={onClose}><p>{t("请关闭后重新打开 NPC 组。")}</p></Modal>;
  return <Modal title={t("{0} · 编辑台词", [member.actor.name])} subtitle={t("修改这个人物的台词；完整条件与玩家分支可在编排 / 试玩中调整。")} wide className="npc-member-modal" onClose={close}>
    {prompt&&<div className="npc-unsaved" role="alert"><strong>{t("台词尚未保存")}</strong><div><button className="secondary" onClick={onClose}>{t("不保存并关闭")}</button><button className="primary" disabled={busy} onClick={save}>{t("保存并关闭")}</button><button className="secondary" onClick={()=>setPrompt(false)}>{t("取消")}</button></div></div>}
    <form onSubmit={e=>{e.preventDefault();save();}} inert={prompt?true:undefined}><div className="npc-editor-body"><div className="form-columns"><label>{t("人物名称")}<input required value={name} maxLength="120" aria-label={t("NPC人物名称")} onChange={e=>{setName(e.target.value);setDirty(true);}}/></label><label>{t("身份")}<input value={role} aria-label={t("NPC人物身份")} onChange={e=>{setRole(e.target.value);setDirty(true);}}/></label></div>
    {member.dialogues.length>1&&<label className="form-field">{t("对白")}<select aria-label={t("NPC对白")} disabled={dirty||busy} value={graphId} onChange={e=>{setGraphId(e.target.value);setNodes(member.dialogues.find(g=>g.id===e.target.value).nodes);setBaseNodes(member.dialogues.find(g=>g.id===e.target.value).nodes);}}>{member.dialogues.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
    {nodes.map((node,i)=><label className="npc-line-editor" key={node.id}><strong>{node.label || t("台词 {0}", [i+1])}</strong><textarea aria-label={t("NPC台词 {0}", [i+1])} rows={3} required value={node.text} onChange={e=>{setNodes(rows=>rows.map(n=>n.id===node.id?{...n,text:e.target.value}:n));setDirty(true);}}/>{node.options.length>0&&<small>{node.options.length}{t(" 个玩家选项 · 原有分支、条件和效果保留")}</small>}</label>)}
    <p className="muted-text">{member.dialogues.length?t("此对白若被其他出场复用，修改也会同步。"):t("保存后创建这个人物的场景对白，不需要模型。")}</p>{error&&<p role="alert" className="danger">{tm(error)}</p>}</div><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={close}>{t("关闭")}</button><button className="primary" disabled={busy}>{busy?t("保存中…"):t("保存台词")}</button></div></form>
  </Modal>;
}

export function NpcGroupSettings({level,group,onSave,onClose}){
  useI18n();
  const [base]=useState(()=>structuredClone(level)),[original]=useState(()=>structuredClone(group));
  const bounds=npcGroupBounds(base,original);
  const [value,setValue]=useState({...original,start:bounds.start,end:bounds.end});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const initial={...original,start:bounds.start,end:bounds.end};
  const guard=useDraftClose(JSON.stringify(initial)!==JSON.stringify(value),busy,onClose);
  const save=async()=>{
    if(busy)return;
    if(!value.name.trim()||![value.start,value.end].every(n=>Number.isSafeInteger(n)&&n>=0)||value.end<value.start){setError(t('请填写组名与有效的出场时间。'));guard.setClosing(false);return;}
    setBusy(true);setError('');
    try{await onSave(groupSettingsLevel(base,original,value,bounds),base);onClose();}
    catch(reason){setError(reason.message);guard.setClosing(false);}finally{setBusy(false);}
  };
  const patch=changes=>setValue(previous=>({...previous,...changes}));
  return <Modal title={t("NPC 组设置")} subtitle={t("修改组名、场景与统一出场时间；单个人物仍可单独配置。")} onClose={guard.close}>
    <DraftCloseGuard guard={guard} busy={busy} onSave={save} onClose={onClose}/>
    <form inert={guard.closing?true:undefined} onSubmit={e=>{e.preventDefault();save();}}>
      <fieldset className="npc-editor-body" disabled={busy} style={{border:0,margin:0}}>
        <label className="form-field">{t("组名")}<input required maxLength="150" value={value.name} onChange={e=>patch({name:e.target.value})}/></label>
        <label className="form-field">{t("场景")}<select value={value.track_id} onChange={e=>patch({track_id:e.target.value})}>{base.tracks.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
        <MoreDetails value={value} onChange={patch}/>
        <div className="form-columns"><label>{t("统一开始")}<input aria-label={t("NPC组开始")} type="number" required min="0" step="1" value={value.start} onChange={e=>patch({start:e.target.value===''?'':Number(e.target.value)})}/></label><label>{t("统一结束")}<input aria-label={t("NPC组结束")} type="number" required min={value.start} step="1" value={value.end} onChange={e=>patch({end:e.target.value===''?'':Number(e.target.value)})}/></label></div>
        <p className="muted-text">{t("只修改组名、说明或标签会保留每个成员的时间。修改统一时间后，才会将所有成员设为此范围。")}</p>
      </fieldset>
      {error&&<p role="alert" className="danger">{tm(error)}</p>}
      <div className="modal-actions"><button type="button" className="subtle-button" disabled={busy||JSON.stringify(initial)!==JSON.stringify(value)} title={t("保留角色和出场，可用关卡撤销恢复分组")} onClick={async()=>{setBusy(true);try{await onSave({...base,npc_groups:base.npc_groups.filter(row=>row.id!==group.id),appearances:base.appearances.map(row=>row.npc_group_id===group.id?{...row,npc_group_id:null}:row)},base);onClose();}catch(reason){setError(reason.message);}finally{setBusy(false);}}}>{t("解散组，保留人物")}</button><button type="button" className="secondary" disabled={busy} onClick={guard.close}>{t("取消")}</button><button className="primary" disabled={busy}>{t("保存 NPC 组")}</button></div>
    </form>
  </Modal>;
}
