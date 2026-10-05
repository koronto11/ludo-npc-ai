import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './localApi';
import { commandsFromView, projectView, viewSignature } from './projectBridge';

const empty = { version: 2, name: '正在连接本地项目…', world: { name: '', district: '', rules: [], revision: 1 }, entities: [], relations: [], dialogue: {}, notes: { letter: '' }, scenario: { day: 2, evidence: true, trust: 1 }, tasks: [], modelProfile: { endpoint: '', model: '' } };
const authorSignature = value => JSON.stringify({ name:value.name, editor:value.editor, content:Object.fromEntries(Object.entries(value.content).filter(([key])=>!['drafts','generation_history'].includes(key))) });

export function useLocalProject(announce) {
  const [project, setProject] = useState(empty);
  const [file, setFile] = useState({ path: null });
  const [workspaceInfo, setWorkspaceInfo] = useState(null);
  const [saveState, setSaveState] = useState('连接中');
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  const [dragging, setDragging] = useState(false);
  const current = useRef(empty);
  const document = useRef(null);
  const fileRef = useRef({ path: null });
  const baseline = useRef('');
  const saved = useRef(true);
  const queue = useRef(Promise.resolve());
  const profile = useRef({ endpoint: '', model: '' });
  const pendingInitial = useRef(null);
  const pristine = useRef(false);

  const adopt = useCallback(envelope => {
    const view = projectView(envelope.project, profile.current);
    document.current = envelope.project; fileRef.current = envelope.file || { path: null };
    current.current = view; baseline.current = viewSignature(view);
    saved.current = !envelope.file?.dirty; setFile(fileRef.current); setProject(view);
    setSaveState(saved.current ? '已保存到文件' : '尚未保存到文件'); setFailure('');
    return view;
  }, []);

  const serial = useCallback(work => {
    const next = queue.current.catch(() => {}).then(work);
    queue.current = next;
    return next;
  }, []);

  const postCommands = useCallback(async commands => {
    for(let attempt=0;attempt<3;attempt++) {
      const before=document.current;
      try { return await api(`/api/v2/projects/${before.project_id}/commands`, {method:'POST',body:{expected_revision:before.revision,commands}}); }
      catch(error) {
        if(error.status!==409 || attempt===2) throw error;
        const latest=await api(`/api/v2/projects/${before.project_id}`);
        if(authorSignature(latest)!==authorSignature(before)) throw error;
        document.current=latest;
      }
    }
  },[]);

  const flush = useCallback((destination = null) => serial(async () => {
    if (!document.current) throw new Error('本地服务尚未连接');
    let snapshot = current.current;
    let signature = viewSignature(snapshot);
    setSaveState('保存中');
    try {
      const commands = commandsFromView(document.current, snapshot);
      if (commands.length) document.current = await postCommands(commands);
      else {
        const latest=await api(`/api/v2/projects/${document.current.project_id}`);
        document.current=latest;
        if(viewSignature(current.current)===signature) {
          snapshot=projectView(latest,profile.current); signature=viewSignature(snapshot);
          current.current=snapshot; setProject(snapshot);
        }
      }
      if (JSON.stringify(snapshot.modelProfile) !== JSON.stringify(profile.current)) {
        const info = await api('/api/workspace/model-profile', { method: 'PUT', body: { endpoint: snapshot.modelProfile.endpoint, model: snapshot.modelProfile.model || null } });
        profile.current = snapshot.modelProfile; setWorkspaceInfo(info);
      }
      if (!destination && !fileRef.current.path) {
        baseline.current = signature; saved.current = false; setSaveState('尚未保存到文件'); return;
      }
      let result;
      for(let attempt=0;attempt<3;attempt++) {
        try { result=await api(`/api/v2/projects/${document.current.project_id}/save`, { method: 'POST', body: { expected_revision: document.current.revision, path: destination } }); break; }
        catch(error) { if(error.status!==409 || attempt===2) throw error; const latest=await api(`/api/v2/projects/${document.current.project_id}`); if(authorSignature(latest)!==authorSignature(document.current)) throw error; document.current=latest; }
      }
      document.current = result.project; fileRef.current = result.file; setFile(result.file);
      setProject(previous => { const next = { ...previous, _document: result.project }; current.current = next; return next; });
      baseline.current = signature; saved.current = viewSignature(current.current) === signature;
      setSaveState(saved.current ? '已保存到文件' : '有未保存修改'); setFailure('');
      setWorkspaceInfo(await api('/api/workspace'));
      if (result.file.warning) announce(result.file.warning);
    } catch (error) { saved.current = false; setSaveState('保存失败'); setFailure(error.message); throw error; }
  }), [announce, serial,postCommands]);

  const changeProject = useCallback(update => {
    pristine.current = false;
    setProject(previous => {
      const next = typeof update === 'function' ? update(previous) : update;
      current.current = next; saved.current = false;
      return next;
    });
  }, []);

  useEffect(() => {
    // A StrictMode remount reuses one initialization promise, avoiding duplicate imports/locks.
    if (!pendingInitial.current) pendingInitial.current = (async () => {
      await api('/api/session');
      const info = await api('/api/workspace');
      profile.current = { endpoint: info.model_profile.endpoint, model: info.model_profile.model || '' };
      setWorkspaceInfo(info);
      if (info.last_project) {
        try { return await api('/api/files/open', { method: 'POST', body: { path: info.last_project } }); }
        catch (error) { announce(`最近项目未打开：${error.message}`); }
      }
      const project = await api('/api/v2/projects', { method: 'POST', body: { name: '未保存的新世界' } });
      return { project, file: { path: null, dirty: true }, initialBlank: true };
    })();
    let active = true;
    pendingInitial.current.then(envelope => { if (active) { adopt(envelope); pristine.current = !!envelope.initialBlank; setReady(true); } }).catch(error => { if (active) { setFailure(error.message); setSaveState('服务未连接'); } });
    return () => { active = false; };
  }, [adopt, announce]);

  useEffect(() => {
    if (!ready || dragging || viewSignature(project) === baseline.current) return;
    setSaveState('有未保存修改');
    const timer = setTimeout(() => flush().catch(() => {}), 700);
    return () => clearTimeout(timer);
  }, [project, ready, dragging, flush]);

  useEffect(() => {
    const unload = event => { if (!saved.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, []);

  const switchProject = useCallback((operation, discard = false) => serial(async () => {
    if (document.current && !saved.current && !discard && !pristine.current) throw new Error('当前项目尚未保存，请先保存或选择放弃当前修改');
    const envelope = await operation();
    const previous = document.current;
    const view = adopt(envelope);
    pristine.current = false;
    if (previous && previous.project_id !== envelope.project.project_id) await api(`/api/v2/projects/${previous.project_id}/close`, { method: 'POST', body: { discard: true } });
    setWorkspaceInfo(await api('/api/workspace'));
    return view;
  }), [adopt, serial]);

  const restore = useCallback(point_id => serial(async () => {
    const result = await api(`/api/v2/projects/${document.current.project_id}/restore`, { method: 'POST', body: { expected_revision: document.current.revision, point_id } });
    return adopt(result);
  }), [adopt, serial]);

  const transact = useCallback(async commands => {
    await flush();
    return serial(async () => {
      const updated = await postCommands(commands);
      adopt({ project: updated, file: { ...fileRef.current, dirty: true } });
      if (!fileRef.current.path) return updated;
      try {
        let result;
        for(let attempt=0;attempt<3;attempt++) {
          try { result=await api(`/api/v2/projects/${updated.project_id}/save`, {method:'POST',body:{expected_revision:document.current.revision}}); break; }
          catch(error) { if(error.status!==409 || attempt===2) throw error; const latest=await api(`/api/v2/projects/${updated.project_id}`); if(authorSignature(latest)!==authorSignature(document.current)) throw error; document.current=latest; }
        }
        adopt(result); return result.project;
      } catch (error) { setFailure(error.message); setSaveState('保存失败'); throw error; }
    });
  }, [flush, serial, adopt,postCommands]);

  const refresh = useCallback(() => serial(async () => {
    const info=await api('/api/workspace');
    setWorkspaceInfo(info);
    if(!document.current || viewSignature(current.current)!==baseline.current) return info;
    const identifier=document.current.project_id;
    const [latest,status]=await Promise.all([api(`/api/v2/projects/${identifier}`),api(`/api/v2/projects/${identifier}/file`)]);
    if(document.current.project_id!==identifier || viewSignature(current.current)!==baseline.current) return info;
    profile.current={endpoint:info.model_profile.endpoint,model:info.model_profile.model || ''};
    adopt({project:latest,file:status});
    return info;
  }),[serial,adopt]);

  const exportDocument = useCallback(async () => { await flush(); return document.current; }, [flush]);
  return { project, setProject: changeProject, file, workspaceInfo, saveState, ready, failure, saved, flush, switchProject, restore, exportDocument, transact, refresh, setDragging, identifier: () => document.current?.project_id };
}
