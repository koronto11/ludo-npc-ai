import { useEffect, useState } from 'react';
import { FolderOpen, FloppyDisk, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { api } from './localApi';
import { STORAGE_KEY } from './project';

export function FilePanel({ mode, local, onClose, onLoaded, announce }) {
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
      if (mode === 'save-as') { await local.flush(path); announce('已保存到选定的本地文件'); }
      else if (mode === 'recovery') { await local.restore(point); onLoaded(); announce('已恢复；恢复前的正式文件已保留为备份'); }
      else {
        await local.switchProject(() => mode === 'new' ? api('/api/files/new', { method: 'POST', body: { name, filename, folder, template } }) : api('/api/files/open', { method: 'POST', body: { path, discard } }), discard);
        onLoaded(); announce(mode === 'new' ? '新项目已创建到本地文件夹' : '项目已从本地文件打开');
      }
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const migrateBrowser = async () => {
    setBusy(true); setError('');
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error('当前浏览器没有旧版项目');
      await local.switchProject(async () => ({ project: await api('/api/v2/projects/import', { method: 'POST', body: { document: JSON.parse(raw) } }), file: { path: null, dirty: true } }), discard);
      onLoaded(); onClose(); announce('浏览器项目已迁移，请另存为本地文件；旧数据已保留');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const titles = { new: '新建本地项目', open: '打开本地项目', 'save-as': '另存为本地文件', recovery: '从备份恢复' };
  return <Modal title={titles[mode]} subtitle={mode === 'recovery' ? '恢复会替换当前内容与画布，包括未保存修改。恢复前的正式文件会保留一份备份。' : '创作内容保存在你的电脑上。应用配置与工程文件分别存放。'} onClose={onClose} wide>
    <form onSubmit={run} className="file-panel">
      {mode === 'new' ? <>
        <label className="form-field">项目名称<input required aria-label="新项目名称" value={name} onChange={e => { setName(e.target.value); setFilename(`${e.target.value.replace(/[\\/:*?"<>|]/g, '-')}.ludo.json`); }} /></label>
        <label className="form-field">项目文件夹<div className="path-input"><input required aria-label="项目文件夹" value={folder} onChange={e => setFolder(e.target.value)} /><button type="button" className="secondary" disabled={busy} onClick={() => pick('folder')}><FolderOpen size={16} />选择文件夹</button></div></label>
        <div className="form-columns"><label className="form-field">项目文件名<input required aria-label="项目文件名" value={filename} onChange={e => setFilename(e.target.value)} /></label><label className="form-field">起点<select aria-label="项目模板" value={template} onChange={e => setTemplate(e.target.value)}><option value="blank">空白世界</option><option value="lighthouse">灯港示例</option><option value="outpost">荒原驿站示例</option></select></label></div>
      </> : mode === 'recovery' ? <><label className="form-field">可用恢复点<select value={point} onChange={e => setPoint(e.target.value)} aria-label="恢复点">{points.map(row => <option key={row.id} value={row.id}>{row.id === 'previous' ? '上一次有效保存' : row.updated_at} · {row.name} · 修订 {row.revision}</option>)}</select></label>{!points.length && <p className="muted-text">暂时没有有效备份。项目再次保存后会保留旧版本。</p>}</> : <label className="form-field">完整项目路径<div className="path-input"><input required aria-label="本地项目路径" value={path} onChange={e => setPath(e.target.value)} placeholder={mode === 'save-as' ? 'D:/我的项目/我的世界.ludo.json' : '填写已有 .ludo.json 文件的完整路径'} /><button type="button" className="secondary" disabled={busy} onClick={() => pick(mode === 'open' ? 'open' : 'save')}><FolderOpen size={16} />选择文件</button></div></label>}
      {mode === 'open' && <div className="recent-projects"><span className="section-label">最近项目</span>{(local.workspaceInfo?.recent || []).map(item => <button key={item} type="button" onClick={() => setPath(item)} title={item}><FolderOpen size={15} /><span>{item}</span></button>)}<button type="button" className="subtle-button" disabled={busy} onClick={migrateBrowser}>迁移旧浏览器项目，再另存为文件</button></div>}
      {['new', 'open'].includes(mode) && <label className="checkbox-label"><input type="checkbox" checked={discard} onChange={e => setDiscard(e.target.checked)} />放弃当前未保存修改（已经保存的文件不受影响）</label>}
      {local.file.path && <p className="current-file">当前文件：{local.file.path}</p>}
      {mode === 'save-as' && <p className="muted-text">保存成功后继续编辑新文件。原文件保留；已有目标文件不会被覆盖。</p>}
      {error && <p className="danger file-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={busy || mode === 'recovery' && !point}>{mode === 'recovery' ? <ArrowCounterClockwise size={16} /> : <FloppyDisk size={16} />}{busy ? '处理中…' : mode === 'new' ? '创建项目' : mode === 'open' ? '打开项目' : mode === 'recovery' ? '确认恢复' : '保存到文件'}</button></div>
    </form>
  </Modal>;
}
