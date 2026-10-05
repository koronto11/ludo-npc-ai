import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CaretDown, CaretRight, Check, CheckCircle, TreeStructure, User, Users, Flag, ChatText, FileText, Gear, Export, FolderOpen, FloppyDisk, X, ArrowCounterClockwise, Eye, PencilSimple, WarningCircle, Sparkle, Trash, Rows, List, ArrowRight, Info, Globe, BookOpen, MagnifyingGlass, Cursor, Hand, Link, Plus, SquaresFour, ArrowsOut, Play, Circle, LockKey, Target } from '@phosphor-icons/react';
import { Graph, kindIcons, kindLabels } from './Graph';
import { Inspector } from './Inspector';
import { RuntimeTimeline, RehearsalWorkspace } from './Rehearsal';
import { useRehearsal } from './useRehearsal';
import { StoryAuthoring } from './StoryAuthoring';
import { Modal } from './Modal';
import { useLocalProject } from './useLocalProject';
import { FilePanel } from './FilePanel';
import { api } from './localApi';
import { isSeed } from './projectBridge';
import { useGenerationJobs, ModelConnections, GenerateModal, DraftReviewWorkspace } from './Generation';

const makeId = prefix => `${prefix}-${crypto.randomUUID()}`;

function Director() {
  const [selectedId, setSelectedId] = useState('');
  const [workspace, setWorkspace] = useState('关系画布');
  const [inspectorTab, setInspectorTab] = useState('设定');
  const [timelineTab, setTimelineTab] = useState('故事时间线');
  const [libraryTab, setLibraryTab] = useState('资料');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({ residents: true });
  const [tool, setTool] = useState('select');
  const [flow, setFlow] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [modal, setModal] = useState(null);
  const [modelManagerOpen,setModelManagerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(window.innerWidth > 760);
  const [menu, setMenu] = useState(false);
  const [sessionKeys, setSessionKeys] = useState({});
  const toastTimer = useRef(null);
  const announce = useCallback(message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4500); }, []);
  const local = useLocalProject(announce);
  const rehearsal = useRehearsal(local, announce);
  const generation = useGenerationJobs(local, announce);
  const [draftDirty,setDraftDirty]=useState(false);
  const [authoringId, setAuthoringId] = useState(null);
  const [authorDirty, setAuthorDirty] = useState(false);
  const chooseWorkspace = value => { if (authorDirty || draftDirty) { announce('请先提交或保存当前编辑'); return; } setWorkspace(value); };
  const openAuthoring = id => { if(authorDirty || draftDirty) { announce('请先提交或保存当前编辑'); return; } setAuthoringId(id || null); setWorkspace('对话编排'); };
  const { project, setProject, saveState } = local;
  const patch = useCallback(update => { setProject(previous => typeof update === 'function' ? update(previous) : { ...previous, ...update }); }, []);
  const edit = useCallback((id, update) => patch(previous => ({ ...previous, entities: previous.entities.map(item => item.id === id ? { ...item, ...update } : item), ...(id === 'lighthouse' && update.text !== undefined ? { dialogue: { ...previous.dialogue, threatened: update.text } } : {}) })), [patch]);

  useEffect(() => { if (!project.entities.some(e => e.id === selectedId)) setSelectedId(project.entities.find(e => e.kind === 'character')?.id || project.entities[0]?.id || ''); }, [project.entities, selectedId]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
      if (event.key === 'Escape') { setMenu(false); setSidebarOpen(false); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [local.flush, local.file.path, announce]);

  const select = useCallback((id, focus = false) => { setSelectedId(id); setInspectorOpen(true); setInspectorTab('设定'); setSidebarOpen(false); if (focus) setTimeout(() => document.querySelector('[aria-label="名称"]')?.focus(), 50); }, []);
  const save = async () => { setMenu(false); if (!local.file.path) { setModal({ type: 'file', mode: 'save-as' }); return; } try { await local.flush(); announce('项目已保存到本地文件'); } catch (error) { announce(error.message); } };
  const download = async () => { setMenu(false); try { const document = await local.exportDocument(); setModal({ type: 'export', document }); } catch (error) { announce(error.message); } };
  const onPositions = useCallback(changes => patch(previous => ({ ...previous, entities: previous.entities.map(item => { const change = changes.find(change => change.id === item.id); return change ? { ...item, position: change.position } : item; }) })), [patch]);
  const dropEntity = (id, screenPosition) => { if (!id || !flow) return; const item = project.entities.find(item => item.id === id); if (!item) return; edit(id, { hidden: false, position: flow.screenToFlowPosition(screenPosition) }); select(id); announce(`${item.name}已放入画布`); };
  const connect = connection => { if (connection.source === connection.target) { announce('请选择另一个对象建立关系'); return; } setModal({ type: 'relation', connection }); };
  const addRelation = (label, edge = null) => {
    const connection = edge || modal.connection;
    patch(previous => ({ ...previous, relations: edge ? previous.relations.map(item => item.id === edge.id ? { ...item, label } : item) : [...previous.relations, { ...connection, id: makeId('relation'), label }] }));
    setModal(null); announce(edge ? '关系已更新' : '新关系已建立');
  };
  const fit = () => flow?.fitView({ padding: .06, duration: 250 });
  const addDraft = draft => {
    const visible = project.entities.filter(item => !item.hidden);
    const position = { x: Math.max(400, ...visible.map(item => item.position.x + 310)), y: 120 };
    const item = { ...draft, id: makeId(draft.kind || 'character'), position, hidden: false };
    patch(previous => ({ ...previous, entities: [...previous.entities, item], tasks: modal.type === 'generate' ? [...previous.tasks, { id: makeId('task'), name: `${item.name} · 角色草稿`, status: 'completed', detail: '已审核并写入' }] : previous.tasks }));
    select(item.id); setModal(null); setWorkspace('关系画布'); announce(`${item.name}已加入项目`); setTimeout(fit, 100);
  };
  const matches = item => `${item.name} ${item.role} ${item.summary || ''}`.includes(query.trim());
  const characters = project.entities.filter(item => item.kind === 'character' && !item.hidden);
  const residents = project.entities.filter(item => item.kind === 'character' && item.hidden);
  const events = project.entities.filter(item => item.kind === 'event');
  const selected = project.entities.find(item => item.id === selectedId);
  const previewId = selected?.kind === 'character' ? selectedId : project.entities.find(e => e.kind === 'character')?.id;
  const libraryRow = item => { const Icon = kindIcons[item.kind]; return <button key={item.id} className={`library-row ${selectedId === item.id ? 'selected' : ''}`} draggable onDragStart={event => event.dataTransfer.setData('application/ludo-entity', item.id)} onClick={() => { select(item.id); if (item.hidden) announce('将这个角色拖到画布，可显示其关系'); }}><Icon size={17} weight={item.kind === 'character' ? 'fill' : 'regular'} /><span>{item.name}{item.kind === 'character' && <small> · {item.role}</small>}</span></button>; };
  const groupHeader = (key, label, Icon, count) => <button className="library-group" onClick={() => setCollapsed(previous => ({ ...previous, [key]: !previous[key] }))}>{collapsed[key] ? <CaretRight size={12} /> : <CaretDown size={12} />}<Icon size={18} /><strong>{label}</strong>{count !== undefined && <small>{count}</small>}</button>;

  return <main className={`director ${inspectorOpen ? '' : 'inspector-hidden'} ${sidebarOpen ? 'sidebar-open' : ''}`}>
    <header className="app-bar">
      <div className="brand"><span>Ludo</span><small>叙事导演台</small></div>
      <div className="app-menus"><div className="project-menu"><button onClick={() => setMenu(!menu)}>项目</button>{menu && <><div className="menu-dismiss" onClick={() => setMenu(false)} /><div className="dropdown-menu" role="menu"><button onClick={() => { setModal({ type: 'file', mode: 'new' }); setMenu(false); }}><Plus />新建本地项目</button><button onClick={() => { setModal({ type: 'file', mode: 'open' }); setMenu(false); }}><FolderOpen />打开本地项目</button><button onClick={save}><FloppyDisk />保存项目<kbd>Ctrl S</kbd></button><button onClick={() => { setModal({ type: 'file', mode: 'save-as' }); setMenu(false); }}><FloppyDisk />另存为…</button><button disabled={!local.file.path} onClick={() => { setModal({ type: 'file', mode: 'recovery' }); setMenu(false); }}><ArrowCounterClockwise />备份恢复</button><hr /><button onClick={download}><Export />导出 v2 项目</button></div></>}</div><button onClick={() => setModal({ type: 'world' })}>世界</button><button onClick={() => { setInspectorOpen(!inspectorOpen); announce(inspectorOpen ? '属性面板已收起' : '属性面板已展开'); }}>视图</button><button onClick={() => setModal({ type: 'help' })}>帮助</button></div>
      <button className="project-title" title={local.file.path || '尚未保存到本地文件'} onClick={() => setModal({ type: 'world' })}>{project.name}<CaretDown size={13} /></button>
      <div className="app-bar-actions"><button className={`save-indicator ${saveState === '保存失败' ? 'danger' : ''}`} onClick={save}><Check size={14} />{saveState}</button><button className="model-status" onClick={() => setModal({ type: 'model' })}><Circle size={11} weight="fill" />{local.workspaceInfo?.model_profiles?.find(p=>p.id===local.workspaceInfo.active_profile_id)?.name ? `模型配置 · ${local.workspaceInfo.model_profiles.filter(p=>p.enabled!==false&&!p.archived).length} 个已启用` : '模型配置 · 未启用'}</button><button className="compact-button" onClick={download}><Export size={15} />导出</button><button className="icon-button" onClick={() => setModal({ type: 'model' })} aria-label="模型设置"><Gear size={18} /></button></div>
    </header>
    <div className="context-bar">
      <div className="breadcrumb"><button className="icon-button library-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="切换资料库"><List /></button><TreeStructure size={18} /><span>{project.world.name}</span><small>/</small><span>{project.world.district}</span></div>
      <nav className="workspace-tabs" aria-label="工作区">{['关系画布', '对话编排', '情境预演', '草稿审核'].map(name => <button key={name} className={workspace === name ? 'active' : ''} onClick={() => { chooseWorkspace(name); if (name === '关系画布') setTimeout(fit, 80); }}>{name}</button>)}</nav>
      <div className="canvas-tools"><button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="选择与拖拽角色"><Cursor size={16} /><span>选择</span></button><button className={tool === 'pan' ? 'active' : ''} onClick={() => setTool('pan')} title="平移画布"><Hand size={16} /><span>移动画布</span></button><button onClick={() => { setTool('select'); announce('从卡片边缘的连接点拖向另一张卡片，即可建立关系'); }}><Link size={16} /><span>建立关联</span></button><button onClick={() => setModal({ type: 'add' })}><Plus size={17} /><span>添加节点</span></button><button onClick={fit} title="显示全部节点"><ArrowsOut size={16} /></button></div>
      <div className="context-actions"><button className="primary" onClick={() => setModal({ type: 'generate', actor: null })}><Sparkle size={16} />生成角色</button><button className="secondary preview-action" onClick={() => chooseWorkspace('情境预演')}><Play size={14} />预演当前情境</button><button className="icon-button inspector-toggle" onClick={() => setInspectorOpen(!inspectorOpen)} aria-label="切换属性面板"><Rows size={18} /></button></div>
    </div>
    {sidebarOpen && <div className="dock-scrim" onClick={() => setSidebarOpen(false)} />}
    <aside className="library">
      <div className="library-tabs"><button className={libraryTab === '资料' ? 'active' : ''} onClick={() => setLibraryTab('资料')}>资料</button><button className={libraryTab === '模板' ? 'active' : ''} onClick={() => setLibraryTab('模板')}>模板</button></div>
      <div className="library-search"><MagnifyingGlass size={16} /><input aria-label="搜索资料" placeholder="搜索世界、角色与文本…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="清除搜索"><X size={12} /></button>}</div>
      <div className="library-tree">
        {libraryTab === '模板' ? <div className="template-list">{['关键角色', '支线角色', '背景居民', '条件对话', '故事事件'].map(name => <button key={name} onClick={() => setModal({ type: 'add', template: name })}><FileText size={19} /><span>{name}<small>从结构化模板开始</small></span><Plus size={16} /></button>)}</div> : <>
          {groupHeader('world', '世界底稿', Globe)}
          {!collapsed.world && <div className="library-children"><button className="library-row" onClick={() => setModal({ type: 'world' })}><BookOpen size={16} /><span>世界规则</span></button>{project.entities.filter(item => ['faction', 'location'].includes(item.kind) && matches(item)).map(libraryRow)}</div>}
          {groupHeader('characters', '角色', Users, characters.length + residents.length)}
          {!collapsed.characters && <div className="library-children">{characters.filter(matches).map(libraryRow)}{groupHeader('residents', '背景居民', Users, residents.length)}{(!collapsed.residents || query) && residents.filter(matches).map(libraryRow)}</div>}
          {groupHeader('events', '故事事件', Flag, events.length)}
          {!collapsed.events && <div className="library-children">{events.filter(matches).map(libraryRow)}</div>}
          {groupHeader('texts', '对话与文本', ChatText, project.entities.filter(e => ['dialogue', 'text'].includes(e.kind)).length)}
          {!collapsed.texts && <div className="library-children">{project.entities.filter(item => ['dialogue', 'text'].includes(item.kind) && matches(item)).map(libraryRow)}<button className="library-row" onClick={() => openAuthoring()}><FileText size={16} /><span>编排剧情与对话</span></button></div>}
          {query && !project.entities.some(matches) && <p className="muted-text search-empty">没有匹配的资料</p>}
        </>}
      </div>
      <section className="task-list"><div className="library-section-title">生成任务<button className="icon-button" onClick={() => chooseWorkspace('草稿审核')} aria-label="查看生成记录"><CaretRight /></button></div>{project.tasks.slice(-2).map(task => <button key={task.id} onClick={() => chooseWorkspace('草稿审核')}><CheckCircle size={15} /><span>{task.name} · {task.detail}</span></button>)}<button onClick={() => setModal({ type: 'generate', actor: project.entities[0] })}><Circle size={14} /><span>人物故事 · 生成待审核草稿</span></button></section>
      <section className="world-summary"><button className="library-section-title" onClick={() => setModal({ type: 'world' })}>世界约束<PencilSimple size={12} /></button>{project.world.rules.slice(0, 2).map(rule => <p key={rule}>{rule}</p>)}</section>
    </aside>
    <section className="central">
      <div className="main-workspace">
        {workspace === '关系画布' ? <><div className="canvas-caption">{!local.file.path && <button className="primary" onClick={() => setModal({ type: 'file', mode: 'new' })}>新建本地项目</button>}<h1>{project.world.district || project.world.name || '新世界'} · 角色与故事关联</h1><p>{characters.length + residents.length} 角色 / {events.length} 事件 / 世界底稿 v{project._document?.content_revision || project.world.revision}</p></div><Graph project={project} selectedId={selectedId} onSelect={select} onPatch={onPositions} onConnect={connect} onEdge={edge => setModal({ type: 'relation', edge })} onReady={instance => { setFlow(instance); }} tool={tool} onDropEntity={dropEntity} onDragState={local.setDragging} rehearsal={rehearsal} /><div className="canvas-zoom"><button onClick={() => { flow?.zoomOut({ duration: 150 }); setTimeout(() => setZoom(Math.round((flow?.getZoom() || 1) * 100)), 180); }} aria-label="缩小画布">−</button><button onClick={() => { flow?.zoomTo(1, { duration: 150 }); setZoom(100); }} title="原始比例">{flow ? `${Math.round(flow.getZoom() * 100)}%` : `${zoom}%`}</button><button onClick={() => { flow?.zoomIn({ duration: 150 }); setTimeout(() => setZoom(Math.round((flow?.getZoom() || 1) * 100)), 180); }} aria-label="放大画布">＋</button></div></> : workspace === '对话编排' ? <StoryAuthoring local={local} announce={announce} initialId={authoringId} onDirtyChange={setAuthorDirty} onPreview={() => chooseWorkspace('情境预演')} /> : workspace === '草稿审核' ? <DraftReviewWorkspace local={local} generation={generation} announce={announce} onDirtyChange={setDraftDirty} onGenerate={() => setModal({type:'generate'})} onRetry={retry=>setModal({type:'generate',retry})}/> : <RehearsalWorkspace rehearsal={rehearsal} characterId={previewId} onEdit={() => openAuthoring()} />}
      </div>
      <RuntimeTimeline rehearsal={rehearsal} project={project} onSelect={select} tab={timelineTab} setTab={setTimelineTab} />
    </section>
    {inspectorOpen && <Inspector rehearsal={rehearsal} onAuthoring={openAuthoring} project={project} selectedId={selectedId} onEdit={edit} onSelect={select} onClose={() => setInspectorOpen(false)} tab={inspectorTab} setTab={setInspectorTab} onGenerate={actor => setModal({ type: 'generate', actor })} onRemove={actor => setModal({ type: 'remove', actor })} />}
    <footer className="status-bar"><button className="file-location" title={local.file.path || '首次保存请选择文件'} onClick={() => setModal({ type: 'file', mode: 'open' })}><FolderOpen size={12} />{local.file.path || '尚未保存到文件'}</button><span>世界底稿 v{project._document?.content_revision || project.world.revision}</span><span><CheckCircle size={12} />{`通用预演 · 内容 v${rehearsal.result?.content_revision || project._document?.content_revision || 1}`}</span><span>{selectedId ? '已选中 1 个对象' : '未选择对象'}</span><span className="status-spacer" /><span>空格拖动画布 · 双击编辑 · Ctrl S 保存</span></footer>
    {local.failure && <div className="storage-error" role="alert"><WarningCircle size={18} /><span>{local.failure}</span><button onClick={save}>重试保存</button><button onClick={() => setModal({ type: 'file', mode: 'save-as' })}>另存副本</button>{!local.ready && <button onClick={() => window.location.reload()}>重新连接</button>}</div>}
    {toast && <div className="toast" role="status"><Info size={18} /><span>{toast}</span><button className="icon-button" onClick={() => setToast(null)} aria-label="关闭提示"><X size={14} /></button></div>}
    {modal?.type === 'file' ? <FilePanel mode={modal.mode} local={{ ...local, switchProject: async (...args) => { if(generation.active) throw new Error('请先取消或等待当前工程的生成任务'); if(rehearsal.dirty || authorDirty || draftDirty) throw new Error('当前预演分支或剧情定义有未保存编辑，请先保存或放弃修改'); return local.switchProject(...args); } }} onClose={() => setModal(null)} onLoaded={() => { setSelectedId(''); setWorkspace('关系画布'); setTimeout(fit, 150); }} announce={announce} /> : modal?.type==='model' ? <ModelConnections local={local} sessionKeys={sessionKeys} setSessionKeys={setSessionKeys} onClose={()=>setModal(null)} announce={announce}/> : modal?.type==='generate' ? <GenerateModal local={local} rehearsal={rehearsal} actor={modal.actor} retry={modal.retry} sessionKeys={sessionKeys} onClose={()=>setModal(null)} onSubmitted={()=>chooseWorkspace('草稿审核')} onSettings={()=>setModelManagerOpen(true)} announce={announce}/> : modal && <ModalContent modal={modal} project={project} onClose={() => setModal(null)} onPatch={patch} onEdit={edit} onAccept={addDraft} onRelation={addRelation} onSelect={select} announce={announce} />}
    {modal?.type==='generate'&&modelManagerOpen&&<ModelConnections local={local} sessionKeys={sessionKeys} setSessionKeys={setSessionKeys} onClose={()=>setModelManagerOpen(false)} announce={announce}/>}

  </main>;
}

function ModalContent({ modal, project, onClose, onPatch, onEdit, onAccept, onRelation, announce }) {
  if (modal.type === 'export') return <ExportModal project={project} document={modal.document} onClose={onClose} />;
  if (modal.type === 'add') return <ManualObjectModal modal={modal} project={project} onClose={onClose} onAccept={onAccept} onEdit={onEdit} onPatch={onPatch} announce={announce} />;
  if (modal.type === 'world') return <WorldModal project={project} onPatch={onPatch} onClose={onClose} />;
  if (modal.type === 'relation') return <RelationModal modal={modal} project={project} onClose={onClose} onRelation={onRelation} onPatch={onPatch} announce={announce} />;
  if (modal.type === 'remove') return <Modal title={`删除“${modal.actor.name}”？`} subtitle="关联关系将同时移除。" onClose={onClose}><div className="modal-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" onClick={() => { onPatch(previous => ({ ...previous, entities: previous.entities.filter(item => item.id !== modal.actor.id).map(item => item.affects ? { ...item, affects: item.affects.filter(id => id !== modal.actor.id) } : item), relations: previous.relations.filter(edge => edge.source !== modal.actor.id && edge.target !== modal.actor.id) })); onClose(); announce('对象及其关联已删除'); }}>删除对象</button></div></Modal>;
  return <Modal title="使用叙事导演台" subtitle="从世界出发，规划人物与随剧情变化的文本。" onClose={onClose}><div className="help-content"><p><strong>拖拽角色</strong> 在画布中移动卡片；将资料库角色拖入画布。</p><p><strong>建立关系</strong> 从卡片边缘的连接点拖向另一个对象，输入关系名称。双击关系修改或删除。</p><p><strong>编辑内容</strong> 选择卡片，在右侧修改设定、认知或事件条件。</p><p><strong>预演变化</strong> 在情境预演中指定时间、场景和初始变量；选择选项并查看变化记录。可保存分支或回溯后分叉。</p><p><strong>剧情编排</strong> 在对话编排中编辑事实、变量、事件、效果和节点分支。</p><p><strong>保存与导出</strong> 选择本地文件后自动保存；项目菜单提供新建、打开、另存为和备份恢复。</p><p><strong>生成模式</strong> 配置兼容模型接口后生成草稿；在草稿审核中查看字段差异、保护已确认设定并接受。</p></div><div className="modal-actions"><button className="primary" onClick={onClose}>开始创作</button></div></Modal>;
}

function ExportModal({ project, document, onClose }) {
  const text = JSON.stringify(document || project._document, null, 2);
  const [url] = useState(() => URL.createObjectURL(new Blob([text], { type: 'application/json' })));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <Modal title="导出项目" subtitle="包含世界、角色、关系、文本、情境与生成记录。不包含 API Key。" onClose={onClose} wide><label className="form-field">项目 JSON<textarea className="json-editor" aria-label="导出项目 JSON" readOnly value={text} /></label><div className="modal-actions"><button className="secondary" onClick={onClose}>关闭</button><a className="primary download-link" href={url} download={`${project.name}.ludo.json`}>下载项目文件</a></div></Modal>;
}
function RelationModal({ modal, project, onClose, onRelation, onPatch, announce }) {
  const connection = modal.edge || modal.connection;
  const [label, setLabel] = useState(modal.edge?.label || '关联');
  const source = project.entities.find(item => item.id === connection.source);
  const target = project.entities.find(item => item.id === connection.target);
  return <Modal title={modal.edge ? '编辑关系' : '建立关系'} subtitle={`${source?.name} → ${target?.name}`} onClose={onClose}><form onSubmit={event => { event.preventDefault(); if (label.trim()) onRelation(label.trim(), modal.edge); }}><label className="form-field">关系名称<input autoFocus required maxLength={50} value={label} onChange={event => setLabel(event.target.value)} /></label><div className="suggestions">{['相互信任', '常驻', '提供情报', '敌对', '亲属', '触发'].map(name => <button type="button" key={name} onClick={() => setLabel(name)}>{name}</button>)}</div><div className="modal-actions">{modal.edge && <button type="button" className="subtle-button danger" onClick={() => { onPatch(previous => ({ ...previous, relations: previous.relations.filter(item => item.id !== modal.edge.id) })); onClose(); announce('关系已删除'); }}><Trash size={15} />删除关系</button>}<button type="button" className="secondary" onClick={onClose}>取消</button><button type="submit" className="primary">保存关系</button></div></form></Modal>;
}

function WorldModal({ project, onPatch, onClose }) {
  const [world, setWorld] = useState(project.world);
  const [name, setName] = useState(project.name);
  const [rules, setRules] = useState(project.world.rules.join('\n'));
  return <Modal title="世界底稿" subtitle="角色草稿引用这份资料。确认的事实是整个项目的共同约束。" onClose={onClose} wide><form onSubmit={event => { event.preventDefault(); onPatch({ name, world: { ...world, rules: rules.split('\n').map(rule => rule.trim()).filter(Boolean), revision: world.revision + 1 } }); onClose(); }}><div className="form-columns"><label className="form-field">项目名称<input required value={name} onChange={event => setName(event.target.value)} /></label><label className="form-field">世界名称<input required value={world.name} onChange={event => setWorld({ ...world, name: event.target.value })} /></label></div><label className="form-field">故事前提<textarea value={world.premise} onChange={event => setWorld({ ...world, premise: event.target.value })} /></label><label className="form-field">已确认规则 · 每行一条<textarea value={rules} onChange={event => setRules(event.target.value)} /></label><label className="form-field">写作风格<input value={world.tone} onChange={event => setWorld({ ...world, tone: event.target.value })} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" type="submit">确认世界底稿</button></div></form></Modal>;
}

function ManualObjectModal({ modal, onClose, onAccept }) {
  const [kind,setKind]=useState(modal.template==='故事事件'?'event':modal.template==='条件对话'?'dialogue':'character');
  const [name,setName]=useState('');
  const [role,setRole]=useState('');
  const [summary,setSummary]=useState('');
  return <Modal title="手动添加故事对象" subtitle="手动创建对象，之后可以在画布中建立关联。" onClose={onClose}><form onSubmit={event=>{event.preventDefault();onAccept({kind,name,role:role || kindLabels[kind],summary,...(kind==='event'?{day:0,enabled:true,requiresEvidence:false,affects:[]}:{} )});}}><label className="form-field">对象类型<select value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(kindLabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label className="form-field">名称<input required aria-label="新对象名称" value={name} onChange={e=>setName(e.target.value)}/></label><label className="form-field">身份 / 职责<input value={role} onChange={e=>setRole(e.target.value)}/></label><label className="form-field">内容概述<textarea value={summary} onChange={e=>setSummary(e.target.value)}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button type="submit" className="primary">添加到画布</button></div></form></Modal>;
}

export function App() { return <ReactFlowProvider><Director /></ReactFlowProvider>; }



