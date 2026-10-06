// The v2 document stays authoritative. The existing panels receive a projection;
// edits become typed commands, preserving facts, rules, branches and other canvases.
const collections = { character: 'characters', location: 'locations', faction: 'factions', event: 'events', dialogue: 'dialogues', text: 'texts' };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);
const importance = { key: '关键角色', supporting: '支线角色', background: '背景角色' };

export function projectView(document, profile = {}) {
  const { content, editor } = document;
  const board = editor.canvases[0];
  const positions = new Map((board?.nodes || []).map(node => [node.entity.id, node]));
  const facts = new Map(content.facts.map(f => [f.id, f]));
  const entities = Object.entries(collections).flatMap(([kind, collection]) => content[collection].map((row, index) => {
    const placed = positions.get(row.id);
    return { id: row.id, kind, name: row.name, role: row.role || { event: '故事事件', dialogue: '条件对话', text: '非对话文本' }[kind] || '',
      position: placed?.position || { x: 80 + index % 3 * 330, y: 80 + Math.floor(index / 3) * 220 }, hidden: placed ? !placed.visible : true,
      summary: kind === 'character' ? row.story || row.description : kind === 'text' ? row.body : row.description,
      ...(kind === 'character' ? { tier: importance[row.importance], tags: row.tags, quickNote: editor.character_notes?.[row.id] || '', goal: row.goals.join('\n'), boundary: row.boundary, unknown: row.uncertainties.join('\n'), knows: (content.initial_state.characters[row.id]?.known_fact_ids || []).map(id => facts.get(id)?.description || facts.get(id)?.name || '').join('\n'), locked: row.confirmed_fields.length > 0 } : {}),
      ...(kind === 'event' ? { day: row.scheduled_at, enabled: row.enabled, affects: row.affected_character_ids } : {}),
      ...(kind === 'dialogue' ? { characterId: row.character_id, entryNodeId: row.entry_node_id, text: row.nodes.find(n => n.id === row.entry_node_id)?.text || '', graphNodes: clone(row.nodes) } : {}),
      ...(kind === 'text' ? { text: row.body } : {}),
    };
  }));
  const handles = new Map((board?.edges || []).map(e => [e.relation_id, e]));
  const visibleIds = new Set(entities.map(e => e.id));
  return { version: 2, name: document.name, world: { ...content.world, revision: document.content_revision }, entities,
    relations: content.relations.filter(r => visibleIds.has(r.source.id) && visibleIds.has(r.target.id)).map(r => ({ id: r.id, source: r.source.id, target: r.target.id, label: r.label, description: r.description || '', direction: r.direction || 'forward', category: r.category === 'story' ? 'event' : r.category, sourceHandle: handles.get(r.id)?.source_handle || 'right', targetHandle: handles.get(r.id)?.target_handle || 'left' })),
    modelProfile: { endpoint: profile.endpoint || '', model: profile.model || '' },
    tasks: content.generation_history.map(r => ({ id: r.id, name: r.name, status: r.status, detail: r.detail })), _document: document,
  };
}

export function viewSignature(view) {
  const { _document, ...fields } = view;
  return JSON.stringify(fields);
}

export function commandsFromView(document, view) {
  const before = projectView(document, view.modelProfile);
  const commands = [];
  const data = document.content;
  const initial = clone(data.initial_state);
  const allRows = Object.values(collections).flatMap(key => data[key]);
  const registry = new Map(allRows.map(r => [r.id, r]));
  const entityIds = new Set(view.entities.map(e => e.id));
  const baseline = new Map(before.entities.map(e => [e.id, e]));
  const patch = (row, next) => {
    const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) => !equal(row[key], value)));
    if (Object.keys(changes).length) commands.push({ type: 'patch_entity', target: { kind: row.kind, id: row.id }, changes });
  };
  if (view.name !== document.name) commands.push({ type: 'rename_project', name: view.name });
  const { revision, ...world } = view.world;
  if (!equal(world, data.world)) commands.push({ type: 'replace_world', world });
  for (const item of view.entities) {
    const row = registry.get(item.id);
    const old = baseline.get(item.id);
    const next = row ? clone(row) : { id: item.id, kind: item.kind, name: item.name };
    next.name = item.name;
    if (item.kind === 'character') {
      next.role = item.role || ''; if (!row || item.goal !== old.goal) next.goals = (item.goal || '').split('\n').filter(Boolean); next.boundary = item.boundary || '';
      next.importance = { '关键角色': 'key', '背景角色': 'background' }[item.tier] || 'supporting';
      // Preserve distinct description/story when the displayed summary was not edited.
      if (!row || item.summary !== old.summary) next.story = item.summary || '';
      if (!row || item.unknown !== old.unknown) next.uncertainties = (item.unknown || '').split('\n').filter(Boolean);
      if (!row || !!item.locked !== !!old.locked) next.confirmed_fields = item.locked ? ['name', 'role', 'goals', 'boundary', 'uncertainties'] : [];
      if (!row || item.knows !== old.knows) {
        const state = initial.characters[item.id] || { location_id: null, behavior: '', known_fact_ids: [] };
        if (state.known_fact_ids.length > 1) throw new Error('这个角色关联多条事实，请保留认知内容；详细事实编辑将在剧情批次接入');
        if (item.knows?.trim()) {
          let factId = state.known_fact_ids[0];
          if (factId) patch(data.facts.find(f => f.id === factId), { description: item.knows });
          else {
            factId = `knowledge-${item.id.slice(0, 70)}`;
            while (registry.has(factId) || data.facts.some(f => f.id === factId)) factId += '-note';
            commands.push({ type: 'create_entity', entity: { kind: 'fact', id: factId, name: `${item.name}已知`, description: item.knows, available_at: initial.tick } });
          }
          state.known_fact_ids = [factId];
        } else state.known_fact_ids = [];
        initial.characters[item.id] = state;
      }
    } else if (item.kind === 'text') next.body = item.summary || '';
    else {
      next.description = item.summary || '';
      if (['location', 'faction'].includes(item.kind)) next.role = item.role || '';
      if (item.kind === 'event') {
        next.scheduled_at = item.day ?? 0; next.enabled = item.enabled !== false; next.affected_character_ids = item.affects || [];
      }
      if (item.kind === 'dialogue') {
        next.character_id = item.characterId || null;
        next.entry_node_id ??= 'speech';
        next.nodes = clone(item.graphNodes || row?.nodes || [{ id: 'speech', text: item.text || item.summary || '' }]);
        if (row && item.text !== old.text) next.nodes.find(n => n.id === next.entry_node_id).text = item.text;
      }
    }
    if (row) patch(row, next);
    else commands.push({ type: 'create_entity', entity: next });
  }
  for (const old of before.entities) if (!entityIds.has(old.id)) {
    commands.push({ type: 'delete_entity', target: { kind: old.kind, id: old.id } });
    delete initial.characters[old.id];
  }
  if (!equal(initial, data.initial_state)) commands.push({ type: 'set_initial_state', state: initial });
  const relations = new Map(data.relations.map(r => [r.id, r]));
  for (const edge of view.relations) {
    const source = view.entities.find(e => e.id === edge.source);
    const target = view.entities.find(e => e.id === edge.target);
    const relation = { ...(relations.get(edge.id) || {}), id: edge.id, source: { kind: source.kind, id: source.id }, target: { kind: target.kind, id: target.id }, label: edge.label, description: edge.description || '', direction: edge.direction || 'forward', category: edge.category === 'event' ? 'story' : edge.category || 'social' };
    const previous = relations.get(edge.id);
    const normalized = previous ? { ...previous, description: previous.description || '', direction: previous.direction || 'forward' } : undefined;
    if (!equal(relation, normalized)) commands.push({ type: 'put_relation', relation });
  }
  const displayedRelations = new Set(before.relations.map(e => e.id));
  for (const edge of data.relations) if (displayedRelations.has(edge.id) && !view.relations.some(e => e.id === edge.id)) commands.push({ type: 'delete_relation', relation_id: edge.id });
  const previousBoard = document.editor.canvases[0];
  const board = previousBoard ? clone(previousBoard) : { id: 'canvas-main', name: '人物与故事', nodes: [], edges: [] };
  const nodeFor = e => ({ entity: { kind: e.kind, id: e.id }, position: e.position, visible: !e.hidden });
  const oldNodeIds = new Set(board.nodes.map(n => n.entity.id));
  board.nodes = [...board.nodes.flatMap(n => { const e = view.entities.find(e => e.id === n.entity.id); return e ? [nodeFor(e)] : baseline.has(n.entity.id) ? [] : [n]; }), ...view.entities.filter(e => !oldNodeIds.has(e.id) && (!e.hidden || !baseline.has(e.id))).map(nodeFor)];
  const edgeFor = e => ({ relation_id: e.id, source_handle: (e.sourceHandle || 'right').replace(/-(in|out)$/, ''), target_handle: (e.targetHandle || 'left').replace(/-(in|out)$/, '') });
  const oldLayoutIds = new Set((board.edges || []).map(e => e.relation_id));
  board.edges = [...(board.edges || []).flatMap(e => { const edge = view.relations.find(r => r.id === e.relation_id); return edge ? [edgeFor(edge)] : displayedRelations.has(e.relation_id) ? [] : [e]; }), ...view.relations.filter(e => !oldLayoutIds.has(e.id) && (!displayedRelations.has(e.id) || e.sourceHandle !== before.relations.find(r => r.id === e.id)?.sourceHandle || e.targetHandle !== before.relations.find(r => r.id === e.id)?.targetHandle)).map(edgeFor)];
  // Do not create a board merely by opening a blank file.
  if ((previousBoard || board.nodes.length) && !equal(board, previousBoard)) commands.push({ type: 'put_canvas', canvas: board });
  for (const task of view.tasks) if (!data.generation_history.some(r => r.id === task.id)) commands.push({ type: 'put_generation_record', record: { ...task, mode: 'simulated' } });
  return commands;
}
