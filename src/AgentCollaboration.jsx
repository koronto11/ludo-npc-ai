import {useEffect,useRef,useState} from 'react';
import {ArrowClockwise,ArrowCounterClockwise,Check,Copy,Flag,Gear,Robot,Trash} from '@phosphor-icons/react';
import {Modal} from './Modal';
import {api} from './localApi';
import {t,tm,useI18n} from './i18n';
import {agentClientConfigurations,collaborationCardIds} from './agentCollaborationModel';
import './agentCollaboration.css';

const statusLabels={marked:'待智能体处理',pending:'候选待审核',accepted:'已采用',rejected:'已拒绝',reviewed:'已完成逐卡审核',stale:'原文背景已变化',cancelled:'已取消'};
const scopeLabels={text:'当前文字',cards:'选中多张卡片',flow:'整个对白流程'};

export function AgentCollaboration({local,mark,onMark,onLocate,onReview,onClose}) {
  useI18n();
  const projectId=local.project._document.project_id;
  const [tab,setTab]=useState(mark?'mark':'tasks'),[tasks,setTasks]=useState([]),[selected,setSelected]=useState(null);
  const [instruction,setInstruction]=useState(t('润色标记的文字，使其符合人物身份和当前场景；保留剧情信息。'));
  const [connection,setConnection]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [deletedTasks,setDeletedTasks]=useState([]),[showDeleted,setShowDeleted]=useState(false),[lastDeleted,setLastDeleted]=useState(null);
  const [scope,setScope]=useState(mark?.selectedIds?.length>1?'cards':'text');
  const [cardIds,setCardIds]=useState(mark?.selectedIds?.length?mark.selectedIds:mark?[mark.nodeId]:[]);
  const [closePrompt,setClosePrompt]=useState(false),[created,setCreated]=useState(false),[edited,setEdited]=useState(false),[notice,setNotice]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const prefix=`/api/v2/projects/${projectId}`;
  const load=async()=>{
    try{const [rows,deleted]=await Promise.all([api(`${prefix}/agent-tasks`),api(`${prefix}/agent-tasks?deleted=true`)]);if(alive.current){setTasks(rows);setDeletedTasks(deleted);setSelected(value=>value&&!rows.some(row=>row.id===value.id)?null:value);}}
    catch(reason){if(alive.current)setError(reason.message);}
  };
  useEffect(()=>{load();api(`${prefix}/agent-connection`).then(value=>{if(alive.current)setConnection(value);}).catch(reason=>{if(alive.current)setError(reason.message);});},[projectId]);
  useEffect(()=>{if(tab!=='tasks')return;const timer=setInterval(()=>{if(!document.hidden)load();},2500);return()=>clearInterval(timer);},[tab,projectId]);
  const inspect=async task=>{
    setBusy(true);setError('');
    try{const value=await api(`${prefix}/agent-tasks/${task.id}`);if(alive.current)setSelected(value);}
    catch(reason){if(alive.current)setError(reason.message);}finally{if(alive.current)setBusy(false);}
  };
  useEffect(()=>{
    const latest=tasks.find(task=>task.id===selected?.id);
    if(latest&&!busy&&(latest.status!==selected.status||latest.draft_id!==selected.draft_id||latest.stale!==selected.stale||JSON.stringify(latest.counts)!==JSON.stringify(selected.counts)))inspect(latest);
  },[tasks,selected?.id,busy]);
  const create=async()=>{
    setBusy(true);setError('');
    try{const task=await onMark(instruction,scope,cardIds);if(!task)return;setCreated(true);setEdited(false);setSelected(task);setTab('tasks');await load();}
    catch(reason){setError(reason.message);}finally{setBusy(false);}
  };
  const cancel=async task=>{
    setBusy(true);setError('');
    try{setSelected(await api(`${prefix}/agent-tasks/${task.id}/cancel`,{method:'POST'}));await load();}
    catch(reason){setError(reason.message);}finally{setBusy(false);}
  };
  const remove=async task=>{
    setBusy(true);setError('');
    try{await api(`${prefix}/agent-tasks/${task.id}`,{method:'DELETE'});setSelected(value=>value?.id===task.id?null:value);setLastDeleted(task);await load();}
    catch(reason){setError(reason.message);}finally{setBusy(false);}
  };
  const restore=async task=>{
    setBusy(true);setError('');
    try{await api(`${prefix}/agent-tasks/${task.id}/restore`,{method:'POST'});setLastDeleted(value=>value?.id===task.id?null:value);await load();}
    catch(reason){setError(reason.message);}finally{setBusy(false);}
  };
  const copy=async text=>{
    try{await navigator.clipboard.writeText(text);setNotice(t('已复制'));}
    catch{setNotice(t('请选中配置文字复制'));}
  };
  const close=()=>{if(busy)return;if(edited&&!created){setClosePrompt(true);return;}onClose();};
  const configs=connection?agentClientConfigurations(connection):null;
  const markedIds=collaborationCardIds(mark?.graph,scope,cardIds);
  const invalidCards=scope!=='text'&&(!markedIds.length||markedIds.length>200);
  return <Modal title={t('自己的智能体协作')} subtitle={t('本地 MCP · 标记文字 → 智能体候选 → 作者审核')} onClose={close} wide className="agent-collaboration-modal">
    <div className="agent-collaboration-tabs" role="group" aria-label={t('协作页面')}>
      {mark&&<button className={tab==='mark'?'active':''} onClick={()=>setTab('mark')}><Flag size={15}/>{t('标记对白')}</button>}
      <button className={tab==='tasks'?'active':''} onClick={()=>{setTab('tasks');load();}}><Robot size={15}/>{t('协作任务')} <span>{tasks.length}</span></button>
      <button className={tab==='connection'?'active':''} onClick={()=>setTab('connection')}><Gear size={15}/>{t('连接 Codex / Claude')}</button>
    </div>
    <div className={`agent-collaboration-body ${tab==='tasks'?'agent-tasks-body':''}`}>
      {tab==='mark'&&mark&&<section className="agent-mark-form">
        <fieldset className="agent-scope-picker"><legend>{t('协作范围')}</legend>{Object.entries(scopeLabels).map(([value,label])=><label key={value}><input type="radio" name="agent-scope" checked={scope===value} onChange={()=>{setScope(value);setEdited(true);}}/>{t(label)}</label>)}</fieldset>
        <p className="agent-target-path">{scope==='text'?<>{mark.path} · {mark.optionId?t('玩家选项'):t('对白正文')}</>:mark.graph.name}</p>
        {scope==='text'?<div className="agent-text-preview">{Array.from(mark.text).slice(mark.start,mark.end).join('') || t('空白正文')}</div>:<>
          <p>{t('允许修改 {0} 张卡片的台词和玩家选项文字；完整流程仅作为上下文。',[markedIds.length])}</p>
          {scope==='cards'&&<><p className="muted">{t('可在画布按住 Shift 多选，也可在这里勾选零散卡片。')}</p><div className="agent-card-picker">{mark.graph.nodes.map(node=><label key={node.id}><input type="checkbox" aria-label={t('标记卡片 {0}',[node.label||node.id])} checked={cardIds.includes(node.id)} onChange={event=>{setCardIds(ids=>event.target.checked?[...ids,node.id]:ids.filter(id=>id!==node.id));setEdited(true);}}/><span><strong>{node.label||node.id}</strong><small>{node.text || t('空白正文')}</small></span></label>)}</div></>}
          {scope==='flow'&&<p className="muted">{t('包含当前流程的所有分支和结束台词，不包含其他对白流程。')}</p>}
          {invalidCards&&<p className="danger">{t('请选择 1–200 张当前流程中的不同对白卡片')}</p>}
        </>}
        <label>{t('交给智能体的要求')}<textarea aria-label={t('协作要求')} maxLength={4000} value={instruction} onChange={event=>{setInstruction(event.target.value);setEdited(true);setCreated(false);}}/></label>
        <p className="muted">{scope==='text'?t('将先保存当前编排，再固定这段文字的位置和版本。候选仅替换标记文字，保留连线、条件、效果和说话者。'):t('将先保存当前编排并固定版本。智能体只能修改允许范围内的文本，候选按卡片独立审核；连线、条件、效果、说话者和标题保持不变。')}</p>
        <p className="muted">{t('任务会向你连接的智能体提供当前对白流程、世界底稿、说话者资料及当前场景背景；不提供模型密钥或其他工程。云端模型会处理这些创作资料。')}</p>
      </section>}
      {tab==='tasks'&&<div className={`agent-task-layout ${selected?'has-detail':''}`}><section className="agent-task-list">
        <div className="agent-list-heading"><strong>{t('当前工程的协作任务')}</strong><button className="icon-button" aria-label={t('刷新协作任务')} disabled={busy} onClick={load}><ArrowClockwise size={15}/></button></div>
        <div className="agent-task-filters" role="group" aria-label={t('任务列表范围')}><button className={!showDeleted?'active':''} disabled={busy} onClick={()=>setShowDeleted(false)}>{t('协作任务')} {tasks.length}</button><button className={showDeleted?'active':''} disabled={busy} onClick={()=>{setShowDeleted(true);setSelected(null);}}>{t('已删除')} {deletedTasks.length}</button></div>
        <p className="agent-delete-help muted">{t('删除仅移除协作任务，已有候选和已采用的对白保留。可在“已删除”中恢复。')}</p>
        {lastDeleted&&<div className="agent-delete-undo" role="status"><span>{t('协作任务已删除')}</span><button className="subtle-button" disabled={busy} onClick={()=>restore(lastDeleted)}><ArrowCounterClockwise size={14}/>{t('撤销删除')}</button></div>}
        <div className="agent-task-rows" role="region" aria-label={t('协作任务列表')} tabIndex={0}>{showDeleted?(!deletedTasks.length?<p className="muted">{t('暂无已删除的协作任务')}</p>:deletedTasks.map(task=><article className="agent-task-row deleted" key={task.id}><div className="agent-task-summary"><strong>{task.target.dialogue_name} · {task.scope&&task.scope!=='text'?t(scopeLabels[task.scope]):task.target.node_label}</strong><small>{t(statusLabels[task.status] || task.status)}</small><span>{task.instruction}</span></div><button className="icon-button" aria-label={t('恢复协作任务 {0}',[task.instruction])} title={t('恢复任务')} disabled={busy} onClick={()=>restore(task)}><ArrowCounterClockwise size={16}/></button></article>)):<>
        {!tasks.length&&<p className="muted">{t('在画布或快速文本中选中对白，再点击“标记对白”。')}</p>}
        {tasks.map(task=><article key={task.id} className={`agent-task-row ${selected?.id===task.id?'active':''}`}><button disabled={busy} className="agent-task-summary" onClick={()=>inspect(task)}><strong>{task.target.dialogue_name} · {task.scope&&task.scope!=='text'?t(scopeLabels[task.scope]):task.target.node_label}</strong><small>{t(statusLabels[task.status] || task.status)}{task.card_count?` · ${task.card_count}`:''}</small><span>{task.instruction}</span></button><button className="icon-button agent-task-delete" aria-label={t('删除协作任务 {0}',[task.instruction])} title={t('删除任务')} disabled={busy} onClick={()=>remove(task)}><Trash size={16}/></button></article>)}
        </>}</div>
      </section><section className="agent-task-detail" role="region" aria-label={t('协作任务详情')} tabIndex={0}>
        {!selected?<p className="muted">{t('选择任务查看定位、原文和候选。')}</p>:<>
          <div className="agent-task-detail-heading"><strong>{selected.target.dialogue_name} · {selected.scope&&selected.scope!=='text'?t(scopeLabels[selected.scope]):selected.target.node_label}</strong><span>{t(statusLabels[selected.status] || selected.status)}</span></div>
          <p>{selected.instruction}</p>
          <p className="muted">{t('任务编号')} <code>{selected.id}</code></p>
          {selected.previous_text!==null&&selected.previous_text!==selected.original_text&&<><h3>{t('标记前的原文')}</h3><div className="agent-text-preview">{selected.previous_text}</div></>}
          {(!selected.scope||selected.scope==='text')&&<><h3>{t('当前标记文字')}</h3><div className="agent-text-preview">{selected.selected_text || t('空白正文')}</div></>}
          {selected.scope&&selected.scope!=='text'&&<><p>{t(scopeLabels[selected.scope])} · {selected.card_count} {t('张卡片')}</p>{selected.counts&&<p>{t('候选待审核')} {selected.counts.pending} · {t('已采用')} {selected.counts.accepted} · {t('已拒绝')} {selected.counts.rejected}</p>}{selected.candidates?.length?selected.candidates.map(candidate=><article className="agent-card-candidate" key={candidate.draft_id}><strong>{candidate.name}</strong><small>{t(statusLabels[candidate.status])}</small>{candidate.card&&<><h3>{t('标记时原文')}</h3><div className="agent-text-preview">{selected.cards.find(n=>n.id===candidate.node_id)?.text || t('空白正文')}</div><h3>{t('候选正文')}</h3><div className="agent-text-preview">{candidate.card.text}</div>{candidate.card.options?.map(option=><p key={option.id}>{option.text}</p>)}</>}{candidate.explanation&&<p>{candidate.explanation}</p>}<div className="agent-task-actions"><button className="secondary" disabled={busy} onClick={()=>onLocate({...selected.target,node_id:candidate.node_id})}>{t('定位原卡片')}</button><button className="primary" disabled={busy} onClick={()=>onReview(candidate.draft_id)}>{t('审核这张卡片')}</button></div></article>):<div className="agent-marked-cards">{selected.cards.map(node=><p key={node.id}><strong>{node.label||node.id}</strong> · {node.text || t('空白正文')}</p>)}</div>}</>}
          {selected.candidate_text!==undefined&&<><h3>{t('候选正文')}</h3><div className="agent-text-preview agent-candidate">{selected.candidate_text}</div>{selected.explanation&&<p>{selected.explanation}</p>}</>}
          {selected.stale&&!['accepted','rejected'].includes(selected.status)&&<p className="danger">{t('工程背景已变化；未提交的任务需要重新标记，已有候选需在审核中重新比较。')}</p>}
          <div className="agent-task-actions"><button className="secondary" disabled={busy} onClick={()=>onLocate(selected.target)}>{t('定位原卡片')}</button>{selected.draft_id&&<button className="primary" disabled={busy} onClick={()=>onReview(selected.draft_id)}>{t('审核修改候选')}</button>}{['marked','stale'].includes(selected.status)&&<button className="subtle-button" disabled={busy} onClick={()=>cancel(selected)}>{t('取消此任务')}</button>}<button className="subtle-button danger" disabled={busy} onClick={()=>remove(selected)}><Trash size={14}/>{t('删除任务')}</button></div>
          <p className="muted">{t('在自己的智能体里说：读取 NPCs 最新标记的任务，按要求提交修改候选。多个任务时可指定上面的任务编号。')}</p>
        </>}
      </section></div>}
      {tab==='connection'&&<section className="agent-connection">
        <p>{t('首次添加一次本地 MCP。配置绑定当前工程，切换工程时请更新配置中的工程 ID。编辑器需保持运行；添加后按客户端要求重新连接 MCP。')}</p>
        <p className="muted">{t('MCP 提供任务读取和候选提交，不会自动向现有聊天发送消息，也不会自动采用修改。')}</p>
        {configs&&<>{[['Codex',configs.codex],['Claude Code',configs.claude]].map(([label,value])=><section key={label}><div className="agent-list-heading"><h3>{label}</h3><button className="secondary" onClick={()=>copy(value)}><Copy size={14}/>{t('复制配置')}</button></div><pre tabIndex={0}>{value}</pre></section>)}<p>{t('Codex：合并到本机 ~/.codex/config.toml 的 MCP 配置。Claude Code：通过本机 MCP 配置添加，或合并到工作目录的 .mcp.json；保留已有配置。')}</p></>}
      </section>}
      {error&&<p className="danger" role="alert">{tm(error)}</p>}{notice&&<p role="status">{notice}</p>}
    </div>
    {closePrompt&&<div className="agent-close-prompt" role="alert"><p>{t('协作要求尚未提交，关闭会丢弃本次要求。')}</p><div className="agent-close-actions"><button type="button" className="primary" onClick={()=>setClosePrompt(false)}>{t('继续编辑')}</button><button type="button" className="secondary danger" onClick={onClose}>{t('放弃并关闭')}</button></div></div>}
    <footer className="agent-collaboration-footer"><span id="agent-task-creation-help">{tab==='mark'?t('创建后，请在自己的 Codex 或 Claude 中主动读取协作任务；不会自动发送到聊天。'):t('候选进入草稿审核，正式对白由你决定采用。')}</span>{tab==='mark'&&<button className="primary" aria-describedby="agent-task-creation-help" disabled={busy||created||!instruction.trim()||invalidCards} onClick={create}><Check size={15}/>{busy?t('正在保存…'):t('保存并创建协作任务')}</button>}</footer>
  </Modal>;
}
