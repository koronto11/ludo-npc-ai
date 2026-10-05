import { useMemo, useState } from 'react';
import { ReactFlow, Background, BackgroundVariant, Handle, Position, MiniMap, MarkerType, ConnectionMode } from '@xyflow/react';
import { User, MapPin, Flag, Buildings, ChatText, FileText, DotsSixVertical, LockKey } from '@phosphor-icons/react';
import { runtimeCharacterState, clockLabel } from './Rehearsal';
import '@xyflow/react/dist/style.css';

export const kindIcons = { character: User, location: MapPin, event: Flag, faction: Buildings, dialogue: ChatText, text: FileText };
export const kindLabels = { character: '角色', location: '地点', event: '事件', faction: '阵营', dialogue: '对话', text: '非对话文本' };

function TextNode({ data, selected }) {
  const { entity: item, state } = data;
  const TypeIcon = kindIcons[item.kind];
  const isEve = item.id === 'eve';
  return <article className={`text-node node-${item.kind} ${selected ? 'selected' : ''} ${isEve ? 'featured' : ''}`} data-testid={`card-${item.id}`}>
    {Object.entries({ left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }).map(([side, position]) =>
      <Handle key={side} type="source" id={side} position={position} />)}
    <header className="node-heading">
      <TypeIcon size={24} weight={item.kind === 'character' ? 'fill' : 'regular'} />
      <div><strong>{item.name}</strong><small>{item.kind === 'event' ? clockLabel(item.day, data.clockUnit) : `${item.role}${item.tier === '关键角色' ? ' · 关键角色' : ''}`}</small></div>
      <div className="node-tools">{item.locked && <LockKey size={14} />}<DotsSixVertical size={16} /></div>
    </header>
    <div className="node-body">
      {isEve ? <><p>目标：{item.goal}</p><p>已知：{state?.knowledge || item.knows}</p><p>当前：{state?.behavior}</p></> : <p>{item.kind === 'character' ? state?.behavior || item.summary || item.goal : item.summary || '双击补充内容'}</p>}
      
      {item.kind === 'dialogue' && <div className="node-options">{(item.graphNodes?.[0]?.options || []).slice(0, 2).map(option => <span key={option.id}>{option.text}</span>)}</div>}
    </div>
    {isEve && <footer>{data.dialogueCount} 个对话图 · {data.relationCount} 条关系</footer>}
  </article>;
}
function GroupNode({ data }) { return <div className={`graph-group ${data.variant || ''}`}><span>{data.label}</span></div>; }
const nodeTypes = { text: TextNode, group: GroupNode };
const groups = [
  { id: 'group-life', type: 'group', position: { x: 30, y: 72 }, style: { width: 382, height: 496 }, data: { label: '码头生活' }, selectable: false, draggable: false, connectable: false, zIndex: -1 },
  { id: 'group-clues', type: 'group', position: { x: 810, y: 37 }, style: { width: 350, height: 193 }, data: { label: '失踪案线索' }, selectable: false, draggable: false, connectable: false, zIndex: -1 },
  { id: 'group-events', type: 'group', position: { x: 866, y: 220 }, style: { width: 294, height: 316 }, data: { label: '事件影响', variant: 'event-group' }, selectable: false, draggable: false, connectable: false, zIndex: -1 },
];

export function Graph({ project, selectedId, onSelect, onPatch, onConnect, onEdge, onReady, tool, onDropEntity, onDragState, rehearsal }) {
  const [dimensions, setDimensions] = useState({});
  const nodes = useMemo(() => [...(project.entities.some(e => e.id === 'eve') ? groups : []), ...project.entities.filter(item => !item.hidden).map(item => ({
    id: item.id, type: 'text', position: item.position, selected: selectedId === item.id, measured: dimensions[item.id],
    data: { entity: item, state: runtimeCharacterState(project._document, rehearsal?.result, item.id), clockUnit:project.world.clock_unit, dialogueCount:project._document?.content.dialogues.filter(d=>d.character_id===item.id).length || 0, relationCount: project.relations.filter(edge => edge.source === item.id || edge.target === item.id).length },
  }))].map(node => node.type === 'group' ? { ...node, measured: dimensions[node.id] } : node), [project, selectedId, dimensions, rehearsal?.result]);
  const edges = useMemo(() => project.relations.map(edge => {
    const color = edge.category === 'event' ? '#d4a46b' : edge.category === 'dialogue' ? '#bf919b' : '#b4aaa0';
    return { ...edge, sourceHandle: edge.sourceHandle?.replace(/-(in|out)$/, ''), targetHandle: edge.targetHandle?.replace(/-(in|out)$/, ''), type: 'default', style: { stroke: color, strokeWidth: 1.3 }, labelStyle: { fill: color, fontSize: 13 }, labelBgStyle: { fill: '#24211e', fillOpacity: .95 }, labelBgPadding: [5, 3], labelBgBorderRadius: 3, markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 } };
  }), [project.relations]);
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
    onNodeDragStart={() => onDragState?.(true)} onNodeDragStop={() => onDragState?.(false)}
    onInit={onReady} onNodeClick={(_, node) => onSelect(node.id)} onNodeDoubleClick={(_, node) => onSelect(node.id, true)}
    onNodesChange={changes => {
      const measured = changes.filter(change => change.type === 'dimensions' && change.dimensions);
      if (measured.length) setDimensions(previous => {
        if (measured.every(change => previous[change.id]?.width === change.dimensions.width && previous[change.id]?.height === change.dimensions.height)) return previous;
        return { ...previous, ...Object.fromEntries(measured.map(change => [change.id, change.dimensions])) };
      });
      const positions = changes.filter(change => change.type === 'position' && change.position);
      if (positions.length) onPatch(positions);
    }}
    onConnect={onConnect} onEdgeDoubleClick={(_, edge) => onEdge(edge)}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
    onDrop={event => { event.preventDefault(); onDropEntity(event.dataTransfer.getData('application/ludo-entity'), { x: event.clientX, y: event.clientY }); }}
    fitView fitViewOptions={{ padding: .06, minZoom: .35, maxZoom: 1.15 }} minZoom={.25} maxZoom={1.8}
    panOnDrag={tool === 'pan' ? true : [1, 2]} panActivationKeyCode="Space" selectionOnDrag={tool !== 'pan'}
    nodesDraggable={tool !== 'pan'} connectionMode={ConnectionMode.Loose}
    deleteKeyCode={null}
    ariaLabelConfig={{ 'node.a11yDescription.default': '按回车选中角色，使用方向键移动节点', 'controls.zoomin.ariaLabel': '放大画布', 'controls.zoomout.ariaLabel': '缩小画布' }}>
    <Background variant={BackgroundVariant.Dots} gap={14} size={.7} color="#514638" />
    <MiniMap pannable zoomable position="bottom-right" nodeColor={node => node.type === 'group' ? 'transparent' : node.data.entity?.kind === 'event' ? '#9b744c' : node.data.entity?.kind === 'dialogue' ? '#986973' : '#8f7f6d'} nodeStrokeWidth={0} maskColor="rgba(32,29,26,.55)" />
  </ReactFlow>;
}
