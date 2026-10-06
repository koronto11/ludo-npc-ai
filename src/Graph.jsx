import {CharacterImportanceBadge} from './CharacterImportance';
import {localizeLabels} from './i18n.js';
import { t, useI18n } from './i18n';
import { useMemo, useState } from 'react';
import { ReactFlow, Background, BackgroundVariant, Handle, Position, MiniMap, MarkerType, ConnectionMode, Panel } from '@xyflow/react';
import { User, MapPin, Flag, Buildings, ChatText, FileText, DotsThree, LockKey, Link, Tag } from '@phosphor-icons/react';
import { QuickNote } from './QuickNote';
import { runtimeCharacterState, clockLabel } from './Rehearsal';
import '@xyflow/react/dist/style.css';
import { appearancesFor } from './planning';

export const kindIcons = { character: User, location: MapPin, event: Flag, faction: Buildings, dialogue: ChatText, text: FileText };
export const kindLabels = localizeLabels({ character: '角色', location: '地点', event: '事件', faction: '阵营', dialogue: '对话', text: '非对话文本' });

function TextNode({ data, selected }) {
  useI18n();
  const { entity: item, state } = data;
  const TypeIcon = kindIcons[item.kind];
  return <article className={`text-node node-${item.kind} ${selected ? 'selected' : ''} ${data.highlighted ? 'associated' : ''} ${data.compact ? 'compact-node' : ''}`} data-testid={`card-${item.id}`}>
    {Object.entries({ left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }).map(([side, position]) =>
      <Handle key={side} type="source" id={side} position={position} />)}
    <header className="node-heading">
      <TypeIcon size={24} weight={item.kind === 'character' ? 'fill' : 'regular'} />
      <div className="node-identity"><strong>{item.name}</strong><small>{item.kind === 'event' ? clockLabel(item.day, data.clockUnit) : item.role || kindLabels[item.kind]}</small>{item.kind==='character'&&<CharacterImportanceBadge value={item.tier}/>}</div>
      <div className="node-tools">{item.locked && <LockKey size={14} />}<button className="nodrag nopan node-more" aria-label={t("{0} 的更多操作", [item.name])} onClick={e => { e.stopPropagation(); data.onActions(item, e.currentTarget.getBoundingClientRect()); }}><DotsThree size={18}/></button></div>
    </header>
    <div className="node-body">
      {item.kind === 'character' ? <><button className="node-group-tags nodrag nopan" aria-label={t("管理 {0} 的分组", [item.name])} title={(item.tags || []).join('、') || t("管理人物分组")} onClick={e => { e.stopPropagation(); data.onGroups(item.id); }}><Tag size={12}/><span>{item.tags?.slice(0,2).join(' · ') || t("添加分组")}{item.tags?.length > 2 ? ` +${item.tags.length - 2}` : ''}</span></button><QuickNote local={data.local} characterId={item.id} name={item.name} value={item.quickNote}/>{state?.behavior && state.behavior !== '尚未设置行为' && <p className="node-runtime" title={state.behavior}>{t("预演 · ")}{state.behavior}</p>}</> : <p>{item.summary || t("双击补充内容")}</p>}
      
      {item.kind === 'dialogue' && <div className="node-options">{(item.graphNodes?.[0]?.options || []).slice(0, 2).map(option => <span key={option.id}>{option.text}</span>)}</div>}
    </div>
    {item.kind === 'character' && <footer className="node-stats nodrag nopan"><button aria-label={t("查看 {0} 的出场", [item.name])} onClick={e => { e.stopPropagation(); data.onAppearances(item.id); }}><MapPin size={13}/><span>{data.appearanceCount}{t(" 出场")}</span></button><button aria-label={t("查看 {0} 的对白", [item.name])} onClick={e => { e.stopPropagation(); data.onWorkbench?.(item.id); }}><ChatText size={13}/><span>{data.dialogueCount}{t(" 对白")}</span></button><button aria-label={t("查看 {0} 的关系", [item.name])} onClick={e => { e.stopPropagation(); data.onRelations(item.id); }}><Link size={13}/><span>{data.relationCount}{t(" 关系")}</span></button></footer>}
  </article>;
}
function GroupNode({ data }) {
  useI18n(); return <div className={`graph-group ${data.variant || ''}`}><span>{data.label}</span></div>; }
const nodeTypes = { text: TextNode, group: GroupNode };
const groups = [
  { id: 'group-life', type: 'group', position: { x: 30, y: 72 }, style: { width: 382, height: 496 }, data: { label: '码头生活' }, selectable: false, draggable: false, connectable: false, zIndex: -1 },
  { id: 'group-clues', type: 'group', position: { x: 810, y: 37 }, style: { width: 350, height: 193 }, data: { label: '失踪案线索' }, selectable: false, draggable: false, connectable: false, zIndex: -1 },
  { id: 'group-events', type: 'group', position: { x: 866, y: 220 }, style: { width: 294, height: 316 }, data: { label: '事件影响', variant: 'event-group' }, selectable: false, draggable: false, connectable: false, zIndex: -1 },
];

export function Graph({ project, selectedId, onSelect, onPatch, onConnect, onEdge, onReady, tool, onDropEntity, onDragState, rehearsal, onWorkbench, local, visibleIds, category, highlightedIds, onActions, onGroups, onAppearances, onRelations, onViewport, fitPadding = .18 }) {
  useI18n();
  const [dimensions, setDimensions] = useState({});
  const [compact, setCompact] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const nodes = useMemo(() => [...(project.entities.some(e => e.id === 'eve') && !visibleIds ? groups : []), ...project.entities.filter(item => !item.hidden && (!visibleIds || visibleIds.has(item.id))).map(item => ({
    id: item.id, type: 'text', position: item.position, selected: selectedId === item.id, measured: dimensions[item.id],
    style: { opacity: highlightedIds && !highlightedIds.has(item.id) ? .25 : 1 },
    data: { entity: item, local, compact, highlighted:highlightedIds?.has(item.id), onActions, onGroups, onAppearances, onRelations, state: runtimeCharacterState(project._document, rehearsal?.result, item.id), clockUnit:project.world.clock_unit, onWorkbench, appearanceCount:project._document ? appearancesFor(project._document.content,item.id).length : 0, dialogueCount:project._document?.content.dialogues.filter(d=>d.character_id===item.id).length || 0, relationCount: project.relations.filter(edge => edge.source === item.id || edge.target === item.id).length },
  }))].map(node => node.type === 'group' ? { ...node, measured: dimensions[node.id] } : node), [project, selectedId, dimensions, rehearsal?.result, local, compact, visibleIds, highlightedIds, onActions, onGroups, onAppearances, onRelations, onWorkbench]);
  const edges = useMemo(() => project.relations.filter(edge => (!visibleIds || visibleIds.has(edge.source) && visibleIds.has(edge.target)) && (!category || edge.category === category)).map(edge => {
    const color = edge.category === 'event' ? '#d4a46b' : edge.category === 'dialogue' ? '#bf919b' : '#b4aaa0';
    const relevant = !highlightedIds || edge.source === selectedId || edge.target === selectedId;
    const arrow = { type: MarkerType.ArrowClosed, color, width: 16, height: 16 };
    return { ...edge, ariaLabel:`${project.entities.find(e=>e.id===edge.source)?.name} ${edge.direction === 'both' ? '与' : '至'} ${project.entities.find(e=>e.id===edge.target)?.name}：${edge.label}`, sourceHandle: edge.sourceHandle?.replace(/-(in|out)$/, ''), targetHandle: edge.targetHandle?.replace(/-(in|out)$/, ''), type: 'default', style: { stroke: color, strokeWidth: highlightedIds && relevant ? 2.5 : 1.5, opacity:relevant ? 1 : .16 }, labelStyle: { fill: color, fontSize: 13 }, labelBgStyle: { fill: '#24211e', fillOpacity: .95 }, labelBgPadding: [5, 3], labelBgBorderRadius: 3, markerEnd: arrow, markerStart:edge.direction === 'both' ? arrow : undefined };
  }), [project.relations, project.entities, visibleIds, category, highlightedIds, selectedId]);
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
    onNodeDragStart={() => onDragState?.(true)} onNodeDragStop={() => onDragState?.(false)}
    onInit={onReady} onNodeClick={(_, node) => onSelect(node.id)} onNodeDoubleClick={(_, node) => onSelect(node.id, true)}
    onMove={(_, viewport) => { setCompact(viewport.zoom < .55); onViewport?.(viewport); }}
    onNodeContextMenu={(event,node) => { event.preventDefault(); onActions(node.data.entity,{left:event.clientX, bottom:event.clientY}); }}
    onNodesChange={changes => {
      const measured = changes.filter(change => change.type === 'dimensions' && change.dimensions);
      if (measured.length) setDimensions(previous => {
        if (measured.every(change => previous[change.id]?.width === change.dimensions.width && previous[change.id]?.height === change.dimensions.height)) return previous;
        return { ...previous, ...Object.fromEntries(measured.map(change => [change.id, change.dimensions])) };
      });
      const positions = changes.filter(change => change.type === 'position' && change.position);
      if (positions.length) onPatch(positions);
    }}
    onConnect={onConnect} onEdgeClick={(_, edge) => onEdge(edge)} onEdgeDoubleClick={(_, edge) => onEdge(edge)}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
    onDrop={event => { event.preventDefault(); onDropEntity(event.dataTransfer.getData('application/ludo-entity'), { x: event.clientX, y: event.clientY }); }}
    fitView fitViewOptions={{ padding: fitPadding, minZoom: .35, maxZoom: 1 }} minZoom={.25} maxZoom={1.8}
    panOnDrag={tool === 'pan' ? true : [1, 2]} panActivationKeyCode="Space" selectionOnDrag={tool !== 'pan'}
    nodesDraggable={tool !== 'pan'} connectionMode={ConnectionMode.Loose}
    deleteKeyCode={null}
    ariaLabelConfig={{ 'node.a11yDescription.default': '按回车选中角色，使用方向键移动节点', 'controls.zoomin.ariaLabel': '放大画布', 'controls.zoomout.ariaLabel': '缩小画布' }}>
    <Background variant={BackgroundVariant.Dots} gap={14} size={.7} color="#514638" />
    <Panel position="bottom-right" style={{bottom:showMap?76:0}}><button className="canvas-overview-toggle" aria-label={t("画布概览")} aria-pressed={showMap} onClick={()=>setShowMap(v=>!v)}>{showMap?t("收起概览"):t("画布概览")}</button></Panel>
    {showMap && <MiniMap pannable zoomable position="bottom-right" nodeColor={node => node.type === 'group' ? 'transparent' : node.data.entity?.kind === 'event' ? '#9b744c' : node.data.entity?.kind === 'dialogue' ? '#986973' : '#8f7f6d'} nodeStrokeWidth={0} maskColor="rgba(32,29,26,.55)" />}
  </ReactFlow>;
}
