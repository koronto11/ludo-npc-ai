import { t, useI18n } from './i18n';
import {Sparkle,CaretRight} from '@phosphor-icons/react';
import {generationOverview} from './draftReviewModel';
import './generationDock.css';

export function GenerationDock({document,jobs,error,onOpen}){
  useI18n();
  const summary=generationOverview(document,jobs);
  const status=summary.pending?'pending':summary.failed?'failed':'accepted';
  return <section className="generation-dock" aria-label={t("生成与审核")}>
    <button className="generation-dock-open" onClick={()=>onOpen(status,!!summary.active.length || !summary.pending&&!summary.failed)} aria-label={t("查看生成与审核记录")}>
      <span className="generation-dock-title"><Sparkle size={15}/><strong>{t("生成与审核")}</strong><CaretRight size={14}/></span>
      <span className="generation-dock-counts"><span className={summary.active.length?'working':''}>{t("生成中 ")}<b>{summary.active.length}</b></span><span className={summary.pending?'pending':''}>{t("待审核 ")}<b>{summary.pending}</b></span><span className={summary.failed?'failed':''}>{t("失败 ")}<b>{summary.failed}</b></span></span>
      <span className="generation-dock-hint">{summary.active.length?t("正在生成：{0}", [summary.active[0].name]):summary.pending?t("查看草稿，审核后加入项目"):summary.failed?t("查看失败原因与重试记录"):summary.records?t("查看已采用文本与生成记录"):t("尚无生成记录")}</span>
    </button>
    {error&&<p className="generation-dock-error" role="status">{t("进度连接异常，请打开记录查看")}</p>}
  </section>;
}
