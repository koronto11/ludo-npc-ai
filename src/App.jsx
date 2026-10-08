import { t, tm, useI18n } from './i18n';
import { CharacterEditor } from './CharacterEditor';
import { CharacterCreate } from './CharacterCreate';
import Brand from './Brand';
import {LanguageSwitch} from './LanguageSwitch';
import {HelpPanel} from './HelpPanel';
import {AboutPanel} from './AboutPanel';
import { TemplateLibrary } from './TemplateLibrary';
import { ExportPanel } from './ExportPanel';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CaretDown, CaretRight, CaretDoubleLeft, CaretDoubleRight, Check, CheckCircle, TreeStructure, User, Users, Flag, ChatText, FileText, Gear, Export, FolderOpen, FloppyDisk, X, ArrowCounterClockwise, ArrowClockwise, Eye, PencilSimple, WarningCircle, Sparkle, Trash, Rows, List, ArrowRight, Info, Globe, BookOpen, MagnifyingGlass, Cursor, Hand, Link, Plus, SquaresFour, ArrowsOut, Play, Circle, LockKey, Target } from '@phosphor-icons/react';
import { Graph, kindIcons, kindLabels } from './Graph';
import { Inspector } from './Inspector';
import { RuntimeTimeline } from './Rehearsal';
import {CharacterImportanceOptions} from './CharacterImportance';
import {characterImportanceLabels} from './characterImportanceModel';
import { LevelStoryWorkspace,LevelStoryCast } from './LevelStory';
import { useLevelStory } from './useLevelStory';
import { useRehearsal } from './useRehearsal';
import { Modal } from './Modal';
import { WorldEditor } from './WorldEditor';
import { WorldAssetEditor } from './WorldAssetEditor';
import { WorldAssetLibrary } from './WorldAssetLibrary';
import { WorkbenchMenu } from './WorkbenchMenu';
import {recordDialogueId,replayRecordInputs} from './dialoguePlayModel';
import {LibraryRow,LibraryActionMenu,LibraryUsageDialog,LibraryDeleteDialog,LibraryDeletedNotice} from './LibraryActions';
import {libraryUsages} from './libraryActionsModel';
import {libraryScope,librarySiblings} from './libraryOrderingModel';
import {useLibraryOrdering} from './useLibraryOrdering';

import { useLocalProject } from './useLocalProject';
import { FilePanel } from './FilePanel';
import { api } from './localApi';
import { useGenerationJobs, ModelConnections, GenerateModal, DraftReviewWorkspace } from './Generation';
import { LevelCanvas, PlaceCharactersModal } from './LevelCanvas';
import { CharacterOverview } from './CharacterOverview';
import { GenerationDock } from './GenerationDock';
import { RelationshipCanvas } from './RelationshipCanvas';
import { RelationModal } from './RelationModal';
import { RoleWorkbench } from './RoleWorkbench';
import { resolveRoleContext } from './roleDialogueTree';
import { SceneCrowdModal, SceneTextsModal } from './SceneCrowd';
import { useUnsavedNavigation, UnsavedNavigationBanner } from './UnsavedNavigation';

const makeId = prefix => `${prefix}-${crypto.randomUUID()}`;

function Director() {
  useI18n();
  const [selectedId, setSelectedId] = useState('');
  const [workspace, setWorkspace] = useState('关卡画布');
  const [levelId, setLevelId] = useState('');
  const [levelSettingsRequest,setLevelSettingsRequest]=useState(null);
  const [roleContext, setRoleContext] = useState(null);
  const [locatedAppearance, setLocatedAppearance] = useState('');
  const [locatedTrack,setLocatedTrack]=useState(null);
  const [libraryMenu,setLibraryMenu]=useState(null);
  const [libraryDeleted,setLibraryDeleted]=useState(null);
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
  const [activeMenu,setActiveMenu]=useState(null);
  const menu=activeMenu==='project';
  const setMenu=value=>setActiveMenu(value?'project':null);
  const closeMenu=useCallback(()=>setActiveMenu(null),[]);
  const [compactLayout,setCompactLayout]=useState(window.innerWidth<=1100);
  const [libraryVisible,setLibraryVisible]=useState(true);
  const [timelineVisible,setTimelineVisible]=useState(true);
  const [timelineExpanded,setTimelineExpanded]=useState(null);
  const [focusCanvas,setFocusCanvas]=useState(false);
  const [sessionKeys, setSessionKeys] = useState({});
  const toastTimer = useRef(null);
  const announce = useCallback(message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4500); }, []);
  const local = useLocalProject(announce);
  const rehearsal = useRehearsal(local, announce);
  const levelStory = useLevelStory(local,rehearsal,workspace==='情境预演',levelId,announce);
  const generation = useGenerationJobs(local, announce);
  const [draftDirty,setDraftDirty]=useState(false);
  const [reviewRequest,setReviewRequest]=useState(null);
  const [plotRequest,setPlotRequest] = useState(null);
  const [authorDirty, setAuthorDirty] = useState(false);
  const navigation = useUnsavedNavigation();
  const chooseWorkspace = value => { if (value === workspace) return; navigation.request(() => { setPlotRequest(null);if(value==='角色工作台'){enterWorkbench();return;}setWorkspace(value); },value); };
  const enterWorkbench = (level, appearance, actorId, dialogueId, options = {}) => {
    const content=local.project._document?.content;
    if(!content)return;
    const characterId = appearance?.character_id || actorId || content.characters.find(e=>e.id===selectedId)?.id || content.characters[0]?.id;
    const target=resolveRoleContext(content,characterId,{levelId:level?.id,appearanceId:appearance?.id,dialogueId,unscoped:options.unscoped});
    const scene=target.scene;
    if (!rehearsal.focusContext(scene?.level.id,scene?.track?.location_id,scene?.appearance.start_tick,options.create?'':target.graph?.id || '')) return;
    setRoleContext({levelId:scene?.level.id,appearanceId:scene?.appearance.id,dialogueId:options.create?undefined:target.graph?.id,...(options.create?{createDialogueNonce:makeId('new-dialogue')}:{} ),...(options.replayInputs?{replayInputs:options.replayInputs,replayNonce:makeId('play-replay')}:{} )});
    if(characterId)setSelectedId(characterId);setWorkspace('角色工作台');setSidebarOpen(false);
  };
  const openWorkbench = (level, appearance, actorId, dialogueId, options) => navigation.request(() => enterWorkbench(level,appearance,actorId,dialogueId,options),'角色工作台 / 出场场景');
  const locate = (identifier, appearanceId, actorId) => navigation.request(() => { setLocatedTrack(null);setLevelId(identifier);setLocatedAppearance(appearanceId || '');if(actorId)setSelectedId(actorId);setWorkspace('关卡画布'); },'关卡画布');
  const createLevel = () => navigation.request(() => {
    setWorkspace('关卡画布');setSidebarOpen(false);
    setLevelSettingsRequest({creating:true,nonce:makeId('new-level')});
  },'新建关卡');
  const viewRelations = actorId => navigation.request(() => {setSelectedId(actorId);setWorkspace('关系画布');setInspectorOpen(true);setInspectorTab('关系');},'关系画布');
  const placeCharacters = ids => { if(!local.project._document?.content.levels.length) { chooseWorkspace('关卡画布');announce(t("先创建一个关卡，再安排人物出场"));return; } setModal({type:'place',characterIds:ids}); };
  const openAuthoring = id => navigation.request(() => {const c=local.project._document?.content;const dialogue=c?.dialogues.find(d=>d.id===id);if(dialogue?.character_id){enterWorkbench(null,null,dialogue.character_id,dialogue.id);return;}const event=[...(c?.events || []),...(c?.rules || [])].find(row=>row.id===id);if(event?.scope)setLevelId(event.scope.level_id);setPlotRequest({nonce:makeId('plot-panel'),id:event?.id,global:!event?.scope,resources:!!id&&!event,resourcesId:id});setWorkspace('关卡画布');setSidebarOpen(false); },'剧情与文本资料');
  const openSceneContent = scope => navigation.request(()=>{
    const level=local.project._document.content.levels.find(l=>l.id===scope.level_id);
    const track=level?.tracks.find(t=>t.id===scope.track_id);
    if(!track){announce(t("原场景已移除，可以从资料库查看已采用内容"));return;}
    setModal({type:'scene-content',level,track});
  },'场景内容');
  const openReview = (taskId,draftId,options={}) => navigation.request(()=>{setModal(null);setReviewRequest({taskId:taskId || '',draftId:draftId || '',...options,nonce:makeId('review')});setWorkspace('草稿审核');},'本批草稿审核');
  const openStory = id => navigation.request(()=>{
    const actor=local.project.entities.find(row=>row.kind==='character'&&row.id===id);
    if(!actor){announce(t("这个人物已不存在，请重新选择"));return;}
    setModal({type:'generate',actor,storyOnly:true});
  },'生成人物故事');
  const openCharacter = id => navigation.request(()=>setModal({type:'character-profile',characterId:id}),'编辑人物档案');
  const openWorldAsset = item => navigation.request(()=>setModal({type:'world-asset',assetId:item.id,kind:item.kind}),'世界资料');
  const openDraftTarget = draft => navigation.request(()=>{
    setModal(null);const c=local.project._document.content;
    const graph=c.dialogues.find(g=>g.id===draft.target.id);
    if(graph?.character_id){const level=c.levels.find(l=>l.id===draft.scene_context?.level_id),appearance=level?.appearances.find(a=>a.id===draft.scene_context?.appearance_id);enterWorkbench(level,appearance,graph.character_id,graph.id);return;}
    openAuthoring(draft.target.id);
  },'已采用内容 / 编辑与试玩');
  const openFile = mode => navigation.request(() => { setModal({type:'file',mode});setMenu(false); },mode==='new'?'新建项目':mode==='recovery'?'备份恢复':mode==='organize'?'整理项目文件夹':'本地项目');
  const openWorldSection=kind=>navigation.request(()=>{
    setPlotRequest({nonce:makeId('world-resources'),global:true,resources:kind!=='rule',resourcesKind:kind});
    setWorkspace('关卡画布');setSidebarOpen(false);
  },kind==='rule'?'全局剧情规则':kind==='fact'?'世界事实':'故事变量');
  const openWorldLibrary=kind=>navigation.request(()=>setModal({type:'world-library',kind}),'世界资料');
  useEffect(()=>{const resize=()=>setCompactLayout(window.innerWidth<=1100);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const { project, setProject, saveState } = local;
  const patch = useCallback(update => { setProject(previous => typeof update === 'function' ? update(previous) : { ...previous, ...update }); }, []);
  const edit = useCallback((id, update) => patch(previous => ({ ...previous, entities: previous.entities.map(item => item.id === id ? { ...item, ...update } : item), ...(id === 'lighthouse' && update.text !== undefined ? { dialogue: { ...previous.dialogue, threatened: update.text } } : {}) })), [patch]);

  useEffect(() => { if (selectedId && !project.entities.some(e => e.id === selectedId)) setSelectedId(project.entities.find(e => e.kind === 'character')?.id || project.entities[0]?.id || ''); }, [project.entities, selectedId]);
  useEffect(() => { setLevelId('');setLevelSettingsRequest(null);setRoleContext(null);setLocatedAppearance('');setPlotRequest(null);setReviewRequest(null); },[project._document?.project_id]);
  const historyLocked = !!modal || authorDirty || draftDirty || local.historyBusy || !local.ready;
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
      const typing=event.target.closest?.('input,textarea,select,[contenteditable=true]');
      if (!typing && !historyLocked && (event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) {
        const direction=event.shiftKey || event.key.toLowerCase()==='y' ? 'redo' : 'undo';
        if(local.editHistory[direction]){event.preventDefault();local.historyEdit(direction);}
      }
      if (event.key === 'Escape') { setMenu(false); setSidebarOpen(false); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [local.flush, local.file.path, announce,historyLocked,local.editHistory,local.historyEdit]);

  const select = useCallback((id, focus = false) => navigation.request(() => { if(workspace==='角色工作台' && local.project._document?.content.characters.some(row=>row.id===id)){enterWorkbench(null,null,id);return;}setSelectedId(id); setInspectorOpen(true); setInspectorTab('设定'); setSidebarOpen(false); if (focus) setTimeout(() => document.querySelector('[aria-label="名称"]')?.focus(), 50); },'人物或资料'), [navigation.request,workspace,local.project._document]);
  const save = async () => { setMenu(false); if (!local.file.path) { setModal({ type: 'file', mode: 'save-as' }); return; } try { await local.flush(); announce(t("项目已保存到本地文件")); } catch (error) { announce(error.message); } };
  const showProjectFolder=async()=>{setMenu(false);try{await api(`/api/v2/projects/${local.identifier()}/open-folder`,{method:'POST'});}catch(error){announce(error.message);}};
  const download = () => navigation.request(()=>{setMenu(false);setModal({type:'export'});},'导出与交付');
  const openTemplates = (kind='all',source) => navigation.request(()=>setModal({type:'templates',kind,source}),'本地模板库');
  const templateApplied = (result,kind,place) => {
    if(kind==='character'){setSelectedId(result.created_id);setWorkspace('人物总览');setModal({type:'character-profile',characterId:result.created_id});return;}
    const graph=result.project.content.dialogues.find(g=>g.id===result.created_id);
    rehearsal.focusContext(place?.level.id,place?.level.tracks.find(t=>t.id===place.appearance.track_id)?.location_id,place?.appearance.start_tick,result.created_id);
    setSelectedId(graph.character_id);setRoleContext({levelId:place?.level.id,appearanceId:place?.appearance.id,dialogueId:result.created_id});setWorkspace('角色工作台');
  };
  const onPositions = useCallback(changes => patch(previous => ({ ...previous, entities: previous.entities.map(item => { const change = changes.find(change => change.id === item.id); return change ? { ...item, position: change.position } : item; }) })), [patch]);
  const dropEntity = (id, screenPosition) => { if (!id || !flow) return; const item = project.entities.find(item => item.id === id); if (!item) return; edit(id, { hidden: false, position: flow.screenToFlowPosition(screenPosition) }); select(id); announce(t("{0}已放入画布", [item.name])); };
  const connect = connection => { if (connection.source && connection.target && connection.source === connection.target) { announce(t("请选择另一个对象建立关系")); return; } setModal({ type: 'relation', connection }); };
  const addRelation = async (label, edge = null, details = {}) => {
    const connection = { ...(edge || modal.connection), ...details };
    const source = project.entities.find(row=>row.id===connection.source);
    const target = project.entities.find(row=>row.id===connection.target);
    if (!source || !target || source.id===target.id) throw new Error(t("请选择两个不同的对象"));
    const identifier = edge?.id || makeId('relation');
    const commands = [{type:'put_relation', relation:{id:identifier, source:{kind:source.kind,id:source.id}, target:{kind:target.kind,id:target.id}, label, category:connection.category==='event'?'story':connection.category || 'social', direction:connection.direction || 'forward', description:connection.description || ''}}];
    const savedDocument = await local.exportDocument();
    const board = savedDocument.editor.canvases[0];
    if (!edge && board && (connection.sourceHandle || connection.targetHandle)) commands.push({type:'put_canvas',canvas:{...board,edges:[...board.edges,{relation_id:identifier,source_handle:(connection.sourceHandle || 'right').replace(/-(in|out)$/, ''),target_handle:(connection.targetHandle || 'left').replace(/-(in|out)$/, '')}]}});
    await local.transact(commands);
    setModal(null); announce(edge ? t("关系已更新") : t("新关系已建立"));
  };
  const fit = () => flow?.fitView({ padding: .06, duration: 250 });
  const addDraft = draft => {
    const visible = project.entities.filter(item => !item.hidden);
    const position = { x: Math.max(400, ...visible.map(item => item.position.x + 310)), y: 120 };
    const item = { ...draft, id: makeId(draft.kind || 'character'), position, hidden: false };
    patch(previous => ({ ...previous, entities: [...previous.entities, item], tasks: modal.type === 'generate' ? [...previous.tasks, { id: makeId('task'), name: `${item.name} · 角色草稿`, status: 'completed', detail: '已审核并写入' }] : previous.tasks }));
    select(item.id); setModal(null); setWorkspace('关系画布'); announce(t("{0}已加入项目", [item.name])); setTimeout(fit, 100);
  };
  const libraryOrdering=useLibraryOrdering(local,announce);
  const orderedLibrary=scope=>librarySiblings(project,scope);
  const matches = item => `${item.name} ${item.role} ${item.summary || ''}`.includes(query.trim());
  const characters = project.entities.filter(item => item.kind === 'character' && !item.hidden && item.tier !== '背景角色');
  const residents = project.entities.filter(item => item.kind === 'character' && (item.hidden || item.tier === '背景角色'));
  const events = project.entities.filter(item => item.kind === 'event');
  const selected = project.entities.find(item => item.id === selectedId);
  const currentLevel = project._document?.content.levels.find(l=>l.id===levelId) || project._document?.content.levels[0];
  const previewId = selected?.kind === 'character' ? selectedId : project.entities.find(e => e.kind === 'character')?.id;
  const closeLibraryMenu=useCallback((restore=true)=>{setLibraryMenu(previous=>{if(restore)previous?.trigger?.focus();return null;});},[]);
  useEffect(()=>{setLibraryMenu(null);setLibraryDeleted(null);setLocatedTrack(null);},[project._document?.project_id]);
  useEffect(()=>{if(libraryDeleted&&project._document?.revision!==libraryDeleted.revision)setLibraryDeleted(null);},[project._document?.revision]);
  const editLibraryTarget=target=>{
    if(target.kind==='level')navigation.request(()=>{setModal(null);setLevelId(target.id);setWorkspace('关卡画布');setLevelSettingsRequest({nonce:makeId('level-settings')});},'关卡设置');
    else if(target.kind==='world')navigation.request(()=>setModal({type:'world'}),'世界底稿');
    else if(target.kind==='character')openCharacter(target.id);
    else if(['location','faction'].includes(target.kind))openWorldAsset(target);
    else openAuthoring(target.id);
  };
  const showLibraryUsages=target=>navigation.request(()=>setModal({type:'library-usage',target}),'使用位置');
  const openLibraryUsage=row=>navigation.request(()=>{
    setModal(null);
    if(['track','appearance'].includes(row.kind)){setLevelId(row.levelId);setLocatedAppearance(row.kind==='appearance'?row.id:'');setLocatedTrack({levelId:row.levelId,trackId:row.trackId,nonce:makeId('locate-track')});if(row.actorId)setSelectedId(row.actorId);setWorkspace('关卡画布');}
    else if(row.kind==='initial'){setPlotRequest({nonce:makeId('initial-state'),global:true,resources:true,resourcesKind:'initial'});setWorkspace('关卡画布');}
    else if(row.kind==='draft'||row.kind==='generation')openReview(row.kind==='generation'?row.id:null,row.kind==='draft'?row.id:null);
    else if(row.kind==='case'){setWorkspace('情境预演');levelStory.setPanel('records:'+row.id);}
    else if(row.kind==='relation'){const edge=project.relations.find(item=>item.id===row.id);setWorkspace('关系画布');if(edge)setModal({type:'relation',edge});}
    else editLibraryTarget(row);
    setSidebarOpen(false);
  },'查看关联资料');
  const deleteLibraryTarget=target=>navigation.request(()=>{
    if(generation.active){announce(t('请先取消或等待当前工程的生成任务'));return;}
    if(rehearsal.dirty){announce(t('当前分支有未保存输入，请先保存分支或点放弃修改'));return;}
    setModal({type:'library-delete',target});
  },'确认删除');
  const libraryActions=target=>{
    const action=(label,run,Icon,danger=false)=>({label,run,Icon,danger});
    if(target.kind==='group'){
      if(target.id==='world')return [action('编辑世界底稿',()=>editLibraryTarget({kind:'world'}),PencilSimple),action('管理地点与区域',()=>openWorldLibrary('location'),Globe),action('管理阵营',()=>openWorldLibrary('faction'),Flag)];
      if(['characters','residents'].includes(target.id))return [action('新建人物',()=>navigation.request(()=>setModal({type:'create-character',importance:target.id==='residents'?'background':'supporting'}),'创建人物'),Plus),action('管理全部人物',()=>chooseWorkspace('人物总览'),Users)];
      if(target.id==='events')return [action('新建剧情事件',()=>navigation.request(()=>{setWorkspace('关卡画布');setPlotRequest({nonce:makeId('new-event'),creating:true,kind:'event',global:!project._document.content.levels.length});},'剧情事件'),Plus),action('管理剧情事件',()=>openAuthoring(),Flag)];
      return [action('管理对白与文本',()=>openAuthoring(),ChatText)];
    }
    if(target.kind==='world')return [action('编辑世界底稿',()=>editLibraryTarget(target),PencilSimple),action('查看世界事实',()=>openWorldSection('fact'),BookOpen),action('查看故事变量',()=>openWorldSection('variable'),List)];
    const labels={level:'编辑关卡设置',character:'编辑人物档案',location:'编辑地点资料',faction:'编辑阵营资料',event:'编辑剧情事件',dialogue:project._document.content.dialogues.find(row=>row.id===target.id)?.character_id?'编辑／试玩对白':'编辑对白',text:'编辑文本'};
    const rows=[action(labels[target.kind]||'编辑',()=>editLibraryTarget(target),PencilSimple)];
    if(target.kind==='level')rows.unshift(action('打开关卡画布',()=>locate(target.id),SquaresFour));
    if(target.kind==='character'){rows.push(action('打开角色工作台',()=>openWorkbench(null,null,target.id),ChatText),action('查看人物关系',()=>viewRelations(target.id),Link));}
    if(target.kind==='event'){const event=project._document.content.events.find(row=>row.id===target.id);if(event?.scope)rows.push(action('定位所属关卡',()=>navigation.request(()=>{setLevelId(event.scope.level_id);setWorkspace('关卡画布');setPlotRequest({id:event.id,nonce:makeId('locate-event')});},'关卡画布'),Target));}
    if(libraryUsages(project._document,target).length)rows.push(action('查看使用位置',()=>showLibraryUsages(target),Target));
    const scope=target.library_scope;
    if(scope){const siblings=orderedLibrary(scope),index=siblings.findIndex(row=>row.id===target.id);rows.push({...action('上移',()=>libraryOrdering.move(scope,target.id,-1)),disabled:libraryOrdering.busy||index<=0},{...action('下移',()=>libraryOrdering.move(scope,target.id,1)),disabled:libraryOrdering.busy||index<0||index===siblings.length-1});}
    rows.push(action(target.kind==='level'?'删除关卡':target.kind==='character'?'删除人物':target.kind==='dialogue'?'删除对白':target.kind==='event'?'删除事件':target.kind==='text'?'删除文本':'删除资料',()=>deleteLibraryTarget(target),Trash,true));return rows;
  };
  const libraryRow=item=> <LibraryRow {...libraryOrdering.props(libraryScope(item),item.id)} menuTarget={libraryMenu?.target} key={item.id} target={{...item,library_scope:libraryScope(item)}} Icon={kindIcons[item.kind]} selected={selectedId===item.id} onMore={setLibraryMenu} draggable onDragStart={event=>event.dataTransfer.setData('application/ludo-entity',item.id)} onOpen={()=>{if(['event','dialogue','text','location','faction'].includes(item.kind)){editLibraryTarget(item);return;}if(['关卡画布','人物总览','草稿审核','情境预演'].includes(workspace)){openCharacter(item.id);return;}select(item.id);if(item.hidden)announce(t('将这个角色拖到画布，可显示其关系'));}}>{item.name}{item.kind==='character'&&item.role&&<small> · {item.role}</small>}</LibraryRow>;
  const groupHeader=(key,label,Icon,count)=><LibraryRow menuTarget={libraryMenu?.target} group target={{kind:'group',id:key,name:t(label)}} onMore={setLibraryMenu} onOpen={()=>setCollapsed(previous=>({...previous,[key]:!previous[key]}))}>{collapsed[key]?<CaretRight size={12}/>:<CaretDown size={12}/>}<Icon size={18}/><strong>{t(label)}</strong>{count!==undefined&&<small>{count}</small>}</LibraryRow>;

  const planningMode = ['关卡画布','人物总览','角色工作台'].includes(workspace);
  const reviewMode = workspace === '草稿审核';
  const showInspector = inspectorOpen && !planningMode && !reviewMode && !focusCanvas;
  const libraryShown=!focusCanvas&&(compactLayout?sidebarOpen:libraryVisible);
  const timelineCollapsed=timelineExpanded===null?planningMode&&timelineTab==='故事时间线':!timelineExpanded;
  const selectTimelineTab=tab=>{setTimelineTab(tab);setTimelineExpanded(true);};
  const toggleLibrary=()=>{setLibraryMenu(null);setFocusCanvas(false);if(compactLayout)setSidebarOpen(!libraryShown);else setLibraryVisible(!libraryShown);};
  const restoreLayout=()=>{setFocusCanvas(false);setLibraryVisible(true);setSidebarOpen(false);setInspectorOpen(window.innerWidth>760);setTimelineVisible(true);setTimelineExpanded(null);};
  return <main className={`director ${showInspector ? '' : 'inspector-hidden'} ${sidebarOpen && !focusCanvas ? 'sidebar-open' : ''} ${(!compactLayout&&!libraryVisible)||focusCanvas?'library-hidden':''} ${!timelineVisible||focusCanvas?'timeline-hidden':''} ${planningMode ? 'planning-mode' : ''} ${timelineCollapsed ? 'timeline-compact' : ''} ${reviewMode ? 'review-mode' : ''} ${workspace === '关系画布' ? 'relationship-mode' : ''}`}>
    <header className="app-bar">
      <Brand /><button className="icon-button help-mobile-button" aria-label={t("帮助")} onClick={()=>setModal({type:'help'})}><BookOpen size={18}/></button>
      <div className="app-menus">
        <WorkbenchMenu id="project" label={t("项目")} open={menu} onToggle={()=>setActiveMenu(menu?null:'project')} onClose={closeMenu}><button onClick={() => openFile('new')}><Plus />{t("新建本地项目")}</button><button onClick={() => openFile('open')}><FolderOpen />{t("打开本地项目")}</button><button onClick={save}><FloppyDisk />{t("保存项目")}<kbd>Ctrl S</kbd></button><button onClick={() => { setModal({ type: 'file', mode: 'save-as' }); setMenu(false); }}><FloppyDisk />{t("另存为…")}</button><button disabled={!local.file.path} onClick={() => openFile('recovery')}><ArrowCounterClockwise />{t("备份恢复")}</button><button disabled={!local.file.path} onClick={showProjectFolder}><FolderOpen />{t("打开项目文件夹")}</button><button disabled={!local.file.path||local.file.managed_folder} onClick={()=>openFile('organize')}><FolderOpen />{t("整理为项目文件夹")}</button><hr /><button onClick={download}><Export />{t("导出与交付")}</button></WorkbenchMenu>
        <WorkbenchMenu id="world" label={t("世界设定")} open={activeMenu==='world'} onToggle={()=>setActiveMenu(activeMenu==='world'?null:'world')} onClose={closeMenu}>
          <button disabled={!local.ready} onClick={()=>navigation.request(()=>setModal({type:'world'}),'世界底稿')}><BookOpen/><span>{t("世界底稿")}</span></button>
          <button disabled={!local.ready} onClick={()=>openWorldLibrary('location')}><Globe/><span>{t("地点与区域")}</span></button>
          <button disabled={!local.ready} onClick={()=>openWorldLibrary('faction')}><Flag/><span>{t("阵营")}</span></button><hr role="separator"/>
          <button disabled={!local.ready} onClick={()=>openWorldSection('fact')}><FileText/><span>{t("世界事实")}</span></button>
          <button disabled={!local.ready} onClick={()=>openWorldSection('variable')}><Gear/><span>{t("故事变量")}</span></button>
          <button disabled={!local.ready} onClick={()=>openWorldSection('rule')}><Flag/><span>{t("全局剧情规则")}</span></button>
        </WorkbenchMenu>
        <WorkbenchMenu id="view" label={t("视图")} open={activeMenu==='view'} onToggle={()=>setActiveMenu(activeMenu==='view'?null:'view')} onClose={closeMenu}>
          <button role="menuitemcheckbox" aria-checked={libraryShown} onClick={toggleLibrary}><span>{t("显示左侧资料库")}</span>{libraryShown&&<Check size={16}/>}</button>
          <button role="menuitemcheckbox" aria-checked={showInspector} disabled={planningMode||reviewMode} onClick={()=>{setFocusCanvas(false);setInspectorOpen(!showInspector);}}><span>{workspace==='情境预演'?t("显示场景人物面板"):t("显示右侧属性面板")}</span>{showInspector&&<Check size={16}/>}</button>
          {(planningMode||reviewMode)&&<small className="menu-hint">{t("当前页面使用自己的卡片详情面板。")}</small>}
          <button role="menuitemcheckbox" aria-checked={timelineVisible&&!focusCanvas&&!reviewMode} disabled={reviewMode} onClick={()=>{setFocusCanvas(false);setTimelineVisible(!(timelineVisible&&!focusCanvas));}}><span>{t("显示底部时间线")}</span>{timelineVisible&&!focusCanvas&&!reviewMode&&<Check size={16}/>}</button><hr role="separator"/>
          <button role="menuitemcheckbox" aria-checked={focusCanvas} onClick={()=>setFocusCanvas(!focusCanvas)}><span>{t("专注画布")}</span>{focusCanvas&&<Check size={16}/>}</button>
          <button onClick={restoreLayout}><ArrowCounterClockwise/><span>{t("恢复默认布局")}</span></button>
        </WorkbenchMenu>
        <button onClick={()=>setModal({type:'help'})}>{t("帮助")}</button>
        <button className="about-menu-button" onClick={()=>{closeMenu();setModal({type:'about'});}}>{t("关于")}</button>
      </div><div className="edit-history-actions" aria-label={t("编辑撤销与重做")}><button className="icon-button" aria-label={t("撤销上一步编辑")} title={local.editHistory.undo ? t("撤销：{0} · Ctrl Z", [tm(local.editHistory.undo)]) : t("本次打开后暂无可撤销编辑")} disabled={historyLocked||!local.editHistory.undo} onClick={()=>local.historyEdit("undo")}><ArrowCounterClockwise size={16}/></button><button className="icon-button" aria-label={t("重做编辑")} title={local.editHistory.redo ? t("重做：{0} · Ctrl Shift Z", [tm(local.editHistory.redo)]) : t("暂无可重做编辑")} disabled={historyLocked||!local.editHistory.redo} onClick={()=>local.historyEdit("redo")}><ArrowClockwise size={16}/></button></div><button className="project-title" title={local.file.path || t("尚未保存到本地文件")} onClick={() => setModal({ type: 'world' })}>{local.ready?project.name:t("正在连接本地项目…")}</button>
      <div className="app-bar-actions"><button className={`save-indicator ${saveState === '保存失败' ? 'danger' : ''}`} onClick={save}><Check size={14} />{tm(saveState)}</button><button className="model-status" onClick={() => setModal({ type: 'model' })}><Circle size={11} weight="fill" />{local.workspaceInfo?.model_profiles?.find(p=>p.id===local.workspaceInfo.active_profile_id)?.name ? t("模型配置 · {0} 个已启用", [local.workspaceInfo.model_profiles.filter(p=>p.enabled!==false&&!p.archived).length]) : t("模型配置 · 未启用")}</button><button className="compact-button" onClick={download}><Export size={15} />{t("导出")}</button><button className="icon-button" onClick={() => setModal({ type: 'model' })} aria-label={t("模型设置")}><Gear size={18} /></button><LanguageSwitch /></div>
    </header>
    <div className="context-bar">
      <div className="breadcrumb"><TreeStructure size={18} /><div className="breadcrumb-path"><button className="breadcrumb-world" title={t("编辑世界底稿")} onClick={()=>navigation.request(()=>setModal({type:'world'}),'世界底稿')}>{project.world.name}</button><small>/</small><button className="breadcrumb-level" title={t("打开关卡设置")} onClick={()=>navigation.request(()=>{setWorkspace('关卡画布');if(currentLevel){setLevelId(currentLevel.id);setLevelSettingsRequest({nonce:makeId('settings')});}},'关卡设置')}>{currentLevel?.name || t("未创建关卡")}</button></div><button className="icon-button library-toggle" onClick={toggleLibrary} title={t(libraryShown?'收起左侧面板':'展开左侧面板')} aria-label={t(libraryShown?'收起左侧面板':'展开左侧面板')} aria-expanded={libraryShown} aria-controls="author-library">{libraryShown?<CaretDoubleLeft size={16}/>:<CaretDoubleRight size={16}/>}</button></div>
      <nav className="workspace-tabs" aria-label={t("工作区")}>{['关卡画布', '人物总览', '角色工作台', '关系画布', '草稿审核', '情境预演'].map(name => <button key={name} className={workspace === name ? 'active' : ''} onClick={() => { if(name==='角色工作台'){openWorkbench(null,null,previewId);return;}chooseWorkspace(name); if (name === '关系画布') setInspectorTab('关系'); }}>{name==='情境预演'?t("全局预演"):t(name)}</button>)}</nav>
      <button className="mobile-rehearsal-button" title={t("全局预演")} aria-label={t("全局预演")} onClick={()=>chooseWorkspace("情境预演")}><Play size={18}/></button><div className="context-actions"><button className="primary" onClick={() => setModal({ type: 'generate', actor: null })}><Sparkle size={16} />{t("生成角色")}</button><button className="icon-button inspector-toggle" onClick={() => setInspectorOpen(!inspectorOpen)} aria-label={t("切换属性面板")}><Rows size={18} /></button></div>
    </div>
    {sidebarOpen && !focusCanvas && <div className="dock-scrim" onClick={() => setSidebarOpen(false)} />}
    <aside className="library" id="author-library">
      <div className="library-tabs"><button className={libraryTab === '资料' ? 'active' : ''} onClick={() => setLibraryTab('资料')}>{t("资料")}</button><button className={libraryTab === '模板' ? 'active' : ''} onClick={() => setLibraryTab('模板')}>{t("模板")}</button></div>
      <div className="library-search"><MagnifyingGlass size={16} /><input aria-label={t("搜索资料")} placeholder={t("搜索世界、角色与文本…")} value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label={t("清除搜索")}><X size={12} /></button>}</div>
      <div className="library-tree" {...libraryOrdering.treeProps}>
        {libraryTab === '模板' ? <div className="template-list">{[['人物设定模板','character'],['对白结构模板','dialogue'],['我的模板与归档','all']].map(([name,kind])=><button key={name} onClick={()=>openTemplates(kind)}><FileText size={19}/><span>{t(name)}<small>{t("选择结构、预览并创建")}</small></span><Plus size={16}/></button>)}</div> : <>
          <div className="library-planning-shortcuts"><div className="library-level-shortcut"><button onClick={()=>chooseWorkspace('关卡画布')}><SquaresFour size={16}/>{t("关卡与场景")}</button><button className="library-add-level" title={t("新建关卡")} aria-label={t("新建关卡")} disabled={!local.ready || !project._document || local.historyBusy} onClick={createLevel}><Plus size={18}/></button></div><button onClick={()=>chooseWorkspace('人物总览')}><Users size={16}/>{t("全部人物 ")}<small>{project.entities.filter(e=>e.kind==='character').length}</small></button></div>
          {project._document && !project._document.content.levels.length && <button className="library-first-level" disabled={!local.ready || local.historyBusy} onClick={createLevel}><Plus size={15}/>{t("创建第一个关卡")}</button>}
          {orderedLibrary('levels').map(level=><LibraryRow {...libraryOrdering.props('levels',level.id)} menuTarget={libraryMenu?.target} key={level.id} target={{...level,kind:'level',library_scope:'levels'}} Icon={Flag} selected={(levelId || project._document.content.levels[0]?.id)===level.id&&workspace==='关卡画布'} onMore={setLibraryMenu} onOpen={()=>locate(level.id)}>{level.name}<small> · {level.tracks.length}{t(" 场景")}</small></LibraryRow>)}
          {groupHeader('world', '世界底稿', Globe)}
          {!collapsed.world && <div className="library-children"><LibraryRow menuTarget={libraryMenu?.target} target={{kind:'world',id:'world',name:t('世界规则')}} Icon={BookOpen} onMore={setLibraryMenu} onOpen={()=>editLibraryTarget({kind:'world'})}>{t('世界规则')}</LibraryRow>{orderedLibrary('world').filter(matches).map(libraryRow)}</div>}
          {groupHeader('characters', '角色', Users, characters.length + residents.length)}
          {!collapsed.characters && <div className="library-children">{orderedLibrary('characters').filter(matches).map(libraryRow)}{groupHeader('residents', '背景居民', Users, residents.length)}{(!collapsed.residents || query) && orderedLibrary('residents').filter(matches).map(libraryRow)}</div>}
          {groupHeader('events', '故事事件', Flag, events.length)}
          {!collapsed.events && <div className="library-children">{orderedLibrary('events').filter(matches).map(libraryRow)}</div>}
          {groupHeader('texts', '对话与文本', ChatText, project.entities.filter(e => ['dialogue', 'text'].includes(e.kind)).length)}
          {!collapsed.texts && <div className="library-children">{orderedLibrary('texts').filter(matches).map(libraryRow)}<button className="library-row" onClick={() => openAuthoring()}><FileText size={16} /><span>{t("剧情与文本资料")}</span></button></div>}
          {query && !project.entities.some(matches) && <p className="muted-text search-empty">{t("没有匹配的资料")}</p>}
        </>}
      </div>
      {libraryDeleted&&<LibraryDeletedNotice name={libraryDeleted.name} busy={local.historyBusy} canUndo={['移除对象','移除关卡'].includes(local.editHistory.undo)} onRecovery={()=>openFile('recovery')} onUndo={()=>navigation.request(()=>local.historyEdit('undo'),'撤销删除')} onDismiss={()=>setLibraryDeleted(null)}/>}
      <GenerationDock document={project._document} jobs={generation.jobs} error={generation.error} onOpen={(status,showProgress)=>openReview(null,null,{status,showProgress})}/>
    </aside>
    <section className="central">
      <UnsavedNavigationBanner navigation={navigation}/>
      <div inert={navigation.prompt?.busy ? true : undefined} className={`main-workspace ${workspace === '关系画布' ? 'relationship-workspace' : ''}`}>
        {workspace === '关卡画布' ? <LevelCanvas onWorld={()=>setModal({type:"world"})} onCharacters={()=>chooseWorkspace("人物总览")} onNavigationHandlers={navigation.register} onNavigate={navigation.request} onDirtyChange={setAuthorDirty} local={local} levelId={levelId} initialSettingsRequest={levelSettingsRequest} onSettingsOpened={()=>setLevelSettingsRequest(null)} locatedAppearance={locatedAppearance} locatedTrack={locatedTrack} rehearsal={rehearsal} initialPlotRequest={plotRequest} onPlot={openAuthoring} onLevel={setLevelId} onSelect={select} onWorkbench={openWorkbench} onPlace={placeCharacters} onCrowd={(level,track,group,memberId)=>setModal({type:'crowd',level,track,group,memberId})} onNpcReview={draft=>setModal({type:'npc-review',request:{draftId:draft.id,taskId:draft.task_id,nonce:makeId('review')}})} onSceneContent={(level,track)=>openSceneContent({level_id:level.id,track_id:track.id})} announce={announce}/> : workspace === '人物总览' ? <CharacterOverview onEditProfile={openCharacter} onStory={openStory} local={local} selectedId={selectedId} onSelect={select} onLocate={locate} onWorkbench={openWorkbench} onRelation={viewRelations} onPlace={placeCharacters} onCreate={()=>setModal({type:'create-character'})} announce={announce}/> : workspace === '角色工作台' ? <RoleWorkbench onGlobalRecords={()=>navigation.request(()=>{setWorkspace("情境预演");levelStory.setPanel("records");},"关卡试玩记录")} onTemplate={id=>openTemplates('dialogue',id?{kind:'dialogue',id}:undefined)} onNavigationHandlers={navigation.register} onNavigate={navigation.request} local={local} rehearsal={rehearsal} characterId={previewId} context={roleContext} onWorkbench={openWorkbench} onLocate={locate} onRelation={viewRelations} onGenerate={openStory} announce={announce} onDirtyChange={setAuthorDirty}/> : workspace === '关系画布' ? <RelationshipCanvas onEditProfile={openCharacter} onStory={openStory} local={local} selectedId={selectedId} onSelect={(id,focus)=>{select(id,focus);if(!focus){setInspectorTab('关系');if(window.innerWidth<=760)setInspectorOpen(false);}}} onPositions={onPositions} onConnect={connect} onEdge={edge=>setModal({type:'relation',edge})} onReady={setFlow} onDropEntity={dropEntity} rehearsal={rehearsal} onWorkbench={id=>openWorkbench(null,null,id)} onLocate={locate} onSceneWorkbench={openWorkbench} onPlace={placeCharacters} onCreate={()=>setModal({type:'add'})} announce={announce}/> : workspace === '草稿审核' ? <DraftReviewWorkspace initialRequest={reviewRequest} onSceneContent={openSceneContent} onOpenTarget={openDraftTarget} onNavigationHandlers={navigation.register} onNavigate={navigation.request} local={local} generation={generation} announce={announce} onDirtyChange={setDraftDirty} onGenerate={() => setModal({type:'generate'})} onRetry={retry=>setModal({type:'generate',retry})}/> : <LevelStoryWorkspace local={local} onReplayCard={record=>{const graph=local.project._document.content.dialogues.find(g=>g.id===recordDialogueId(record));if(graph?.character_id)openWorkbench(null,null,graph.character_id,graph.id,{replayInputs:replayRecordInputs(record,graph.id)});}} onReload={()=>navigation.request(async()=>{try{await local.refresh(true);announce(t("已载入最新工程，正在重新计算预演。"));}catch(error){announce(error.message);}},"载入最新工程")} castOpen={showInspector} onOpenCast={()=>setInspectorOpen(true)} story={levelStory} onNavigationHandlers={navigation.register} onEdit={() => openAuthoring()} onLocate={openAuthoring} />}
      </div>
    </section>
    {!reviewMode && <RuntimeTimeline rehearsal={rehearsal} project={project} onSelect={select} tab={timelineTab} setTab={selectTimelineTab} collapsed={timelineCollapsed} onToggleCollapsed={()=>setTimelineExpanded(timelineCollapsed)} />}
    {showInspector && (workspace==='情境预演'?<LevelStoryCast story={levelStory} onClose={()=>setInspectorOpen(false)}/>:<Inspector onEditAsset={openWorldAsset} onEditProfile={openCharacter} local={local} onLocate={locate} onWorkbench={openWorkbench} rehearsal={rehearsal} onAuthoring={openAuthoring} project={project} selectedId={selectedId} onEdit={edit} onSelect={select} onClose={() => setInspectorOpen(false)} tab={inspectorTab} setTab={setInspectorTab} onGenerate={actor => setModal({ type: 'generate', actor })} onRemove={actor => setModal({ type: 'remove', actor })} />)}
    <footer className="status-bar"><button className="file-location" title={local.file.path || t("首次保存请选择文件")} onClick={() => openFile('open')}><FolderOpen size={12} />{local.file.path || t("尚未保存到文件")}</button><span>{t("世界底稿 v")}{project._document?.content_revision || project.world.revision}</span><span><CheckCircle size={12} />{t("通用预演 · 内容 v{0}", [rehearsal.result?.content_revision || project._document?.content_revision || 1])}</span><span>{selectedId ? t("已选中 1 个对象") : t("未选择对象")}</span><span className="status-spacer" /><span>{t("空格拖动画布 · 双击编辑 · Ctrl S 保存")}</span></footer>
    {local.failure && <div className="storage-error" role="alert"><WarningCircle size={18} /><span>{local.failure}</span><button onClick={save}>{t("重试保存")}</button><button onClick={() => setModal({ type: 'file', mode: 'save-as' })}>{t("另存副本")}</button>{!local.ready && <button onClick={() => window.location.reload()}>{t("重新连接")}</button>}</div>}
    {toast && <div className="toast" role="status"><Info size={18} /><span>{tm(toast)}</span><button className="icon-button" onClick={() => setToast(null)} aria-label={t("关闭提示")}><X size={14} /></button></div>}
    {libraryMenu&&project._document&&<LibraryActionMenu context={libraryMenu} actions={libraryActions(libraryMenu.target)} onClose={closeLibraryMenu}/>}
    {modal?.type==='library-usage'?<LibraryUsageDialog document={project._document} target={modal.target} onOpen={openLibraryUsage} onClose={()=>setModal(null)}/> : modal?.type==='library-delete'?<LibraryDeleteDialog local={local} target={modal.target} onOpen={openLibraryUsage} onClose={()=>setModal(null)} onDeleted={(target,result)=>{setLibraryDeleted({name:target.name,revision:result.revision});if(selectedId===target.id)setSelectedId('');if(target.kind==='level'){setLevelId(result.content.levels[0]?.id || '');setLocatedTrack(null);if(rehearsal.branch?.level_id===target.id)rehearsal.focusContext(result.content.levels[0]?.id || null,null,result.content.initial_state.tick);}announce(t('已删除“{0}”',[target.name]));}}/> : modal?.type === 'file' ? <FilePanel mode={modal.mode} local={{ ...local, organize: async (...args) => {if(generation.active)throw new Error(t("请先取消或等待当前工程的生成任务"));return local.organize(...args);}, switchProject: async (...args) => { if(generation.active) throw new Error(t("请先取消或等待当前工程的生成任务")); if(rehearsal.dirty || authorDirty || draftDirty) throw new Error(t("当前预演分支或剧情定义有未保存编辑，请先保存或放弃修改")); return local.switchProject(...args); } }} onClose={() => setModal(null)} onLoaded={() => { setSelectedId(''); setWorkspace('关卡画布'); setTimeout(fit, 150); }} announce={announce} /> : modal?.type==='place' ? <PlaceCharactersModal local={local} levelId={levelId} characterIds={modal.characterIds} onClose={()=>setModal(null)} onPlaced={id=>{setLevelId(id);setWorkspace('关卡画布');announce(t("人物出场已安排"));}}/> : modal?.type==='npc-review' ? <DraftReviewWorkspace detailOnly local={local} generation={generation} announce={announce} initialRequest={modal.request} onClosed={()=>setModal(null)} onSceneContent={openSceneContent} onOpenTarget={openDraftTarget} onNavigate={navigation.request} onNavigationHandlers={navigation.register} onDirtyChange={setDraftDirty} onRetry={retry=>setModal({type:'generate',retry})}/> : modal?.type==='crowd' ? <SceneCrowdModal local={local} level={modal.level} track={modal.track} group={modal.group} memberId={modal.memberId} sessionKeys={sessionKeys} onClose={()=>setModal(null)} onCreated={name=>announce(t("已创建 {0}，可以在组内逐人编辑台词", [name]))} onSubmitted={(job,mode)=>{if(mode==='pool')openReview(job.id);else announce(t("台词正在生成，完成后在 NPC 组内逐人审核"));}} onSettings={()=>setModelManagerOpen(true)}/> : modal?.type==='scene-content' ? <SceneTextsModal editor={project._document.editor} content={project._document.content} level={project._document.content.levels.find(l=>l.id===modal.level.id) || modal.level} track={modal.track} onClose={()=>setModal(null)} onGenerate={()=>setModal({type:'crowd',level:modal.level,track:modal.track})} onReview={openReview} onOpenTarget={openDraftTarget}/> : modal?.type==='model' ? <ModelConnections local={local} sessionKeys={sessionKeys} setSessionKeys={setSessionKeys} onClose={()=>setModal(null)} announce={announce}/> : modal?.type==='export' ? <ExportPanel local={local} initialLevelId={levelId||project._document.content.levels[0]?.id} onClose={()=>setModal(null)}/> : modal?.type==='templates' ? <TemplateLibrary local={local} initialKind={modal.kind} initialSource={modal.source} onClose={()=>setModal(null)} onApplied={templateApplied} announce={announce}/> : modal?.type==='world-library' ? <WorldAssetLibrary local={local} kind={modal.kind} onClose={()=>setModal(null)} onEdit={openWorldAsset}/> : modal?.type==='create-character' ? <CharacterCreate local={local} importance={modal.importance} onClose={()=>setModal(null)} onCreated={(id,name)=>{setSelectedId(id);setModal(null);setWorkspace('人物总览');announce(t('人物“{0}”已创建，可以安排出场或编辑档案。',[name]));}}/> : modal?.type==='character-profile' ? <CharacterEditor onTemplate={id=>openTemplates('character',{kind:'character',id})} key={modal.characterId} local={local} characterId={modal.characterId} onClose={()=>setModal(null)} announce={announce}/> : modal?.type==='generate' ? <GenerateModal storyOnly={modal.storyOnly} local={local} rehearsal={rehearsal} actor={modal.actor} retry={modal.retry} sessionKeys={sessionKeys} onClose={()=>setModal(null)} onSubmitted={job=>openReview(job.id)} onSettings={()=>setModelManagerOpen(true)} announce={announce}/> : modal && <ModalContent modal={modal} local={local} project={project} onClose={() => setModal(null)} onPatch={patch} onEdit={edit} onAccept={addDraft} onRelation={addRelation} onSelect={select} announce={announce} onHelp={()=>setModal({type:'help'})} />}
    {['generate','crowd'].includes(modal?.type)&&modelManagerOpen&&<ModelConnections local={local} sessionKeys={sessionKeys} setSessionKeys={setSessionKeys} onClose={()=>setModelManagerOpen(false)} announce={announce}/>}

  </main>;
}

function ModalContent({ modal, local, project, onClose, onPatch, onEdit, onAccept, onRelation, announce, onHelp }) {
  useI18n();

  if (modal.type === 'about') return <AboutPanel onClose={onClose} onHelp={onHelp}/>;

  if (modal.type === 'add') return <ManualObjectModal modal={modal} project={project} onClose={onClose} onAccept={onAccept} onEdit={onEdit} onPatch={onPatch} announce={announce} />;
  if (modal.type === 'world') return local.ready && project._document ? <WorldEditor local={local} onClose={onClose} /> : <Modal title={t('世界底稿')} onClose={onClose}><p className="loading-world">{t('正在连接本地项目…')}</p></Modal>;
  if (modal.type === 'world-asset') return <WorldAssetEditor key={modal.assetId} local={local} assetId={modal.assetId} kind={modal.kind} onClose={onClose}/>;
  if (modal.type === 'relation') return <RelationModal modal={modal} project={project} onClose={onClose} onRelation={onRelation} onPatch={onPatch} announce={announce} />;
  if (modal.type === 'remove') return <Modal title={t("删除“{0}”？", [modal.actor.name])} subtitle={t("关联关系将同时移除。")} onClose={onClose}><div className="modal-actions"><button className="secondary" onClick={onClose}>{t("取消")}</button><button className="primary" onClick={() => { onPatch(previous => ({ ...previous, entities: previous.entities.filter(item => item.id !== modal.actor.id).map(item => item.affects ? { ...item, affects: item.affects.filter(id => id !== modal.actor.id) } : item), relations: previous.relations.filter(edge => edge.source !== modal.actor.id && edge.target !== modal.actor.id) })); onClose(); announce(t("对象及其关联已删除")); }}>{t("删除对象")}</button></div></Modal>;
  return <HelpPanel onClose={onClose}/>;
}

function ManualObjectModal({ modal, onClose, onAccept }) {
  useI18n();
  const [kind,setKind]=useState(modal.template==='故事事件'?'event':modal.template==='条件对话'?'dialogue':'character');
  const [name,setName]=useState('');
  const [role,setRole]=useState('');
  const [summary,setSummary]=useState('');
  const [importance,setImportance]=useState('supporting');
  return <Modal title={t("手动添加故事对象")} subtitle={t("手动创建对象，之后可以在画布中建立关联。")} onClose={onClose}><form onSubmit={event=>{event.preventDefault();onAccept({kind,name,role:role || kindLabels[kind],summary,...(kind==='character'?{tier:characterImportanceLabels[importance]}:{}),...(kind==='event'?{day:0,enabled:true,affects:[]}:{} )});}}><label className="form-field">{t("对象类型")}<select value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(kindLabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label className="form-field">{t("名称")}<input required aria-label={t("新对象名称")} value={name} onChange={e=>setName(e.target.value)}/></label><label className="form-field">{t("身份 / 职责")}<input value={role} onChange={e=>setRole(e.target.value)}/></label><>{kind==='character'&&<label className="form-field">{t("角色定位")}<select aria-label={t("新人物角色定位")} value={importance} onChange={e=>setImportance(e.target.value)}><CharacterImportanceOptions/></select><small>{t("用于区分人物的叙事定位，与身份、分组分别管理。")}</small></label>}</><label className="form-field">{t("内容概述")}<textarea value={summary} onChange={e=>setSummary(e.target.value)}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t("取消")}</button><button type="submit" className="primary">{t("添加到画布")}</button></div></form></Modal>;
}

export function App() {
  useI18n(); return <ReactFlowProvider><Director /></ReactFlowProvider>; }
