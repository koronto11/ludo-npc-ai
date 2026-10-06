export const relationCategories = { social:'人物关系', event:'故事关联', dialogue:'对白关联' };

export function directAssociates(relations, id) {
  const ids = new Set([id]);
  for (const edge of relations) {
    if (edge.source === id) ids.add(edge.target);
    if (edge.target === id) ids.add(edge.source);
  }
  return ids;
}

export function visibleRelationshipEntities(project, filters = {}) {
  const { query = '', kind = '', group = '', levelId = '', trackId = '', category = '' } = filters;
  const term = query.trim().toLocaleLowerCase();
  const level = project._document?.content.levels.find(row => row.id === levelId);
  const appearances = level?.appearances.filter(row => !trackId || row.track_id === trackId) || [];
  const actors = new Set(appearances.map(row => row.character_id));
  const locations = new Set(level?.tracks.filter(row => !trackId || row.id === trackId).map(row => row.location_id) || []);
  const linked = new Set(project.relations.filter(edge => !category || edge.category === category).flatMap(edge => [edge.source,edge.target]));
  return project.entities.filter(item => !item.hidden && (!kind || item.kind === kind)
    && (!group || item.kind === 'character' && item.tags?.includes(group))
    && (!levelId || item.kind === 'character' && actors.has(item.id) || item.kind === 'location' && locations.has(item.id))
    && (!category || linked.has(item.id))
    && (!term || `${item.name} ${item.role} ${item.quickNote || ''} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(term)));
}

export function visibleRelationshipEdges(project, entities, category = '') {
  const ids = new Set(entities.map(row => row.id));
  return project.relations.filter(edge => ids.has(edge.source) && ids.has(edge.target) && (!category || edge.category === category));
}
