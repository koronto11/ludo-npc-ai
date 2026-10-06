import { t, tm, useI18n } from './i18n';
import {useState} from 'react';
import {Modal} from './Modal';
import {appearanceLabel,uid} from './planning';
import {levelDialogueChecks,linkageCommands} from './appearanceDialogue';
import './appearanceDialogue.css';
export function AppearanceDialogueCheck({local,levelId,appearanceId,onClose,onWorkbench,announce}) {
  useI18n();
  const content=local.project._document.content,level=content.levels.find(l=>l.id===levelId);
  const [onlyProblems,setOnlyProblems]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const rows=level?levelDialogueChecks(content,level).filter(r=>!appearanceId||r.appearance.id===appearanceId):[];
  const problems=rows.filter(r=>r.problems.length);
  const change=async(row,mode)=>{
    setBusy(true);setError('');
    try {
      const latest=await local.exportDocument(),l=latest.content.levels.find(v=>v.id===levelId),a=l?.appearances.find(v=>v.id===row.appearance.id),g=latest.content.dialogues.find(v=>v.id===row.graph.id);
      if(!l||!a||!g||JSON.stringify(g.nodes)!==JSON.stringify(row.graph.nodes)||JSON.stringify(a)!==JSON.stringify(row.appearance)||JSON.stringify(l.tracks)!==JSON.stringify(level.tracks))throw new Error(t("出场或对白已变更，请重新打开检查后核对"));
      const commands=linkageCommands(latest.content,l,a,g,mode,uid);
      if(commands.length)await local.transact(commands);
      announce(mode==='follow'?t("对白已跟随这次出场；自定义条件保留"):t("已解除联动，当前场景和时间保留为固定条件"));
    } catch(reason){setError(reason.message);}finally{setBusy(false);}
  };
  return <Modal title={t("对白联动检查")} subtitle={t("检查对白与人物出场的时间、场景是否匹配。这里只检查明确条件，不判断台词的自然语言内容。")} wide className="appearance-dialogue-modal" onClose={()=>{if(!busy)onClose();}}>
    <div className="linkage-summary"><strong>{problems.length?t("{0} 项需要核对", [problems.length]):t("未发现明确的场景或时间冲突")}</strong><label><input type="checkbox" checked={onlyProblems} onChange={e=>setOnlyProblems(e.target.checked)}/>{t("只看需核对")}</label></div>
    <div className="linkage-list">{rows.filter(r=>!onlyProblems||r.problems.length).map(row=><article className={`linkage-card ${row.problems.length?'has-problem':''}`} key={`${row.appearance.id}:${row.graph.id}`}><header><strong>{content.characters.find(a=>a.id===row.appearance.character_id)?.name} · {row.graph.name}</strong><span>{row.following?t("跟随本次出场"):t("独立条件")}</span></header><p>{appearanceLabel(level,row.appearance)}</p>{row.problems.map(p=><p className="linkage-problem" key={p}>{p}</p>)}{row.uses>1&&<p className="muted-text">{t("此对白被 ")}{row.uses}{t(" 次出场复用。启用联动会先复制为本次出场专用对白，其他出场保留原内容。")}</p>}<details><summary>{t("条件与调整说明")}</summary><p>{t("跟随出场后，移动人物、NPC 组或时间锚点即可改变对白可用范围。可识别的原场景时间范围会替换，受伤、任务、认知等其他条件保留。")}</p><p>{t("不能识别的自定义条件会保留；若仍有冲突，请进入编排修改。")}</p></details><footer><button className="secondary" disabled={busy} onClick={()=>{onClose();onWorkbench(level,row.appearance);}}>{t("查看编排 / 试玩")}</button><button className={row.following?'secondary':'primary'} disabled={busy||(!row.following&&!row.scope.location_id)} onClick={()=>change(row,row.following?'independent':'follow')}>{row.following?t("解除联动，保留当前范围"):row.uses>1?t("复制并跟随本次出场"):t("跟随本次出场")}</button></footer></article>)}{!rows.length&&<p className="muted-text">{t("本次范围内还没有对白。先为人物编排或生成台词。")}</p>}{onlyProblems&&rows.length>0&&!problems.length&&<p className="muted-text">{t("没有需要核对的项目。")}</p>}</div>{error&&<p className="danger" role="alert">{tm(error)}</p>}<div className="modal-actions"><small>{t("独立条件不会自动修改；联动设置保存在本地工程。")}</small><button className="secondary" disabled={busy} onClick={onClose}>{t("关闭")}</button></div>
  </Modal>;
}
