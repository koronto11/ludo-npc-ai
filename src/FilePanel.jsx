import { t, tm, useI18n } from './i18n';
import { useEffect, useState } from 'react';
import { FolderOpen, FloppyDisk, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { api } from './localApi';
import { STORAGE_KEY } from './legacyProjectStorage';
import { projectDirectoryName } from './projectPaths';

export function FilePanel({ mode, local, onClose, onLoaded, announce }) {
  useI18n();
  const [folder, setFolder] = useState(local.workspaceInfo?.project_folder || '');
  const [name, setName] = useState('我的世界');
  const [filename, setFilename] = useState('我的世界.ludo.json');
  const [template, setTemplate] = useState('blank');
  const [path, setPath] = useState(mode === 'save-as' ? `${folder}/${local.project.name.replace(/[\\/:*?"<>|]/g, '-')}-副本.ludo.json` : '');
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState([]);
  const [point, setPoint] = useState('');
  const folderName=projectDirectoryName(mode==='organize'?local.project.name:name);
  const destination=`${folder.replace(/[\\/]+$/,'')}/${folderName}`;
  useEffect(() => {
    if (mode === 'recovery' && local.identifier()) api(`/api/v2/projects/${local.identifier()}/recovery`).then(rows => { setPoints(rows); setPoint(rows[0]?.id || ''); }).catch(e => setError(e.message));
  }, [mode]);
  const pick = async kind => {
    setError(''); setBusy(true);
    try { const result = await api('/api/files/dialog', { method: 'POST', body: { kind } }); if (result.path) kind === 'folder' ? setFolder(result.path) : setPath(result.path); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const run = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (mode === 'save-as') { await local.flush(path); announce(t("已保存到选定的本地文件")); }
      else if (mode === 'recovery') { await local.restore(point); onLoaded(); announce(t("已恢复；恢复前的正式文件已保留为备份")); }
      else if(mode==='organize'){await local.organize(folder);onLoaded();announce(t("已整理到独立项目文件夹，原工程和备份保留"));}
      else {
        await local.switchProject(() => mode === 'new' ? api('/api/files/new', { method: 'POST', body: { name, filename, folder, template, layout:'folder' } }) : api('/api/files/open', { method: 'POST', body: { path, discard } }), discard);
        onLoaded(); announce(mode === 'new' ? t("新项目已创建到本地文件夹") : t("项目已从本地文件打开"));
      }
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const migrateBrowser = async () => {
    setBusy(true); setError('');
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error(t("当前浏览器没有旧版项目"));
      await local.switchProject(async () => ({ project: await api('/api/v2/projects/import', { method: 'POST', body: { document: JSON.parse(raw) } }), file: { path: null, dirty: true } }), discard);
      onLoaded(); onClose(); announce(t("浏览器项目已迁移，请另存为本地文件；旧数据已保留"));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const titles = { new: '新建本地项目', open: '打开本地项目', 'save-as': '另存为本地文件', recovery: '从备份恢复',organize:'整理为项目文件夹' };
  return <Modal title={titles[mode]} subtitle={mode === 'recovery' ? t("恢复会替换当前内容与画布，包括未保存修改。恢复前的正式文件会保留一份备份。") : t("创作内容保存在你的电脑上。应用配置与工程文件分别存放。")} onClose={()=>{if(!busy)onClose();}} wide>
    <form onSubmit={run} className="file-panel">
      {mode === 'new' ? <>
        <label className="form-field">{t("项目名称")}<input required aria-label={t("新项目名称")} value={name} onChange={e => { setName(e.target.value); setFilename(`${projectDirectoryName(e.target.value)}.ludo.json`); }} /></label>
        <label className="form-field">{t("保存位置")}<div className="path-input"><input required aria-label={t("项目保存位置")} value={folder} onChange={e => setFolder(e.target.value)} /><button type="button" className="secondary" disabled={busy} onClick={() => pick('folder')}><FolderOpen size={16} />{t("选择位置")}</button></div></label>
        <div className="project-folder-preview"><strong>{t("自动创建同名项目文件夹")}</strong><code>{destination}</code><small>{t("工程保存在其中，备份归入 backups，导出归入 exports。模型配置与密钥由本机共用。")}</small></div>
        <div className="form-columns"><label className="form-field">{t("项目文件名")}<input required aria-label={t("项目文件名")} value={filename} onChange={e => setFilename(e.target.value)} /></label><label className="form-field">{t("起点")}<select aria-label={t("项目模板")} value={template} onChange={e => setTemplate(e.target.value)}><option value="blank">{t("空白世界")}</option><option value="lighthouse">{t("灯港示例")}</option><option value="outpost">{t("荒原驿站示例")}</option><option value="campfire">{t("营地关卡示例")}</option></select></label></div>
      </> : mode==='organize'?<><label className="form-field">{t("保存位置")}<div className="path-input"><input required aria-label={t("整理项目保存位置")} value={folder} onChange={e=>setFolder(e.target.value)}/><button type="button" className="secondary" disabled={busy} onClick={()=>pick('folder')}><FolderOpen size={16}/>{t("选择位置")}</button></div></label><div className="project-folder-preview"><strong>{t("创建项目文件夹并继续编辑")}</strong><code>{destination}</code><small>{t("复制当前工程和有效的历史备份。原文件保留；此前下载到其他位置的导出文件请自行移入 exports。")}</small></div></>: mode === 'recovery' ? <><label className="form-field">{t("可用恢复点")}<select value={point} onChange={e => setPoint(e.target.value)} aria-label={t("恢复点")}>{points.map(row => <option key={row.id} value={row.id}>{row.id === 'previous' ? t("上一次有效保存") : row.updated_at} · {row.name}{t(" · 修订 ")}{row.revision}</option>)}</select></label>{!points.length && <p className="muted-text">{t("暂时没有有效备份。项目再次保存后会保留旧版本。")}</p>}</> : <label className="form-field">{t("完整项目路径")}<div className="path-input"><input required aria-label={t("本地项目路径")} value={path} onChange={e => setPath(e.target.value)} placeholder={mode === 'save-as' ? t("D:/我的项目/我的世界.ludo.json") : t("填写已有 .ludo.json 文件的完整路径")} /><button type="button" className="secondary" disabled={busy} onClick={() => pick(mode === 'open' ? 'open' : 'save')}><FolderOpen size={16} />{t("选择文件")}</button></div></label>}
      {mode === 'open' && <div className="recent-projects"><span className="section-label">{t("最近项目")}</span>{(local.workspaceInfo?.recent || []).map(item => <button key={item} type="button" onClick={() => setPath(item)} title={item}><FolderOpen size={15} /><span>{item}</span></button>)}<button type="button" className="subtle-button" disabled={busy} onClick={migrateBrowser}>{t("迁移旧浏览器项目，再另存为文件")}</button></div>}
      {['new', 'open'].includes(mode) && <label className="checkbox-label"><input type="checkbox" checked={discard} onChange={e => setDiscard(e.target.checked)} />{t("放弃当前未保存修改（已经保存的文件不受影响）")}</label>}
      {local.file.path && <p className="current-file">{t("当前文件：")}{local.file.path}</p>}
      {mode === 'save-as' && <p className="muted-text">{t("保存成功后继续编辑新文件。原文件保留；已有目标文件不会被覆盖。")}</p>}
      {error && <p className="danger file-error" role="alert">{tm(error)}</p>}
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t("取消")}</button><button className="primary" type="submit" disabled={busy || mode === 'recovery' && !point}>{mode === 'recovery' ? <ArrowCounterClockwise size={16} /> : <FloppyDisk size={16} />}{busy ? t("处理中…") : mode === 'new' ? t("创建项目文件夹") : mode === 'open' ? t("打开项目") : mode === 'recovery' ? t("确认恢复") : mode==='organize'?t("整理并继续编辑"):t("保存到文件")}</button></div>
    </form>
  </Modal>;
}
