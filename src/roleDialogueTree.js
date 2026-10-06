import {t,tm} from './i18n.js';
import { appearancesFor, dialoguesFor } from './planning.js';

export const occurrenceKey = row => `${row.level.id}:${row.appearance.id}`;

export function roleDialogueTree(content, characterId) {
  const owned = content.dialogues.filter(graph => graph.character_id === characterId);
  const scenes = appearancesFor(content,characterId).map(row => ({...row,key:occurrenceKey(row),inherited:!row.appearance.dialogue_ids.length,dialogues:dialoguesFor(content,row.appearance)}));
  const uses = new Map();
  const explicit = new Set(scenes.flatMap(row=>row.appearance.dialogue_ids));
  for (const scene of scenes) for (const graph of scene.dialogues) uses.set(graph.id,(uses.get(graph.id) || 0)+1);
  const common = owned.filter(graph=>!explicit.has(graph.id) && (!scenes.length || uses.has(graph.id)));
  const unlinked = owned.filter(graph=>scenes.length && !uses.has(graph.id));
  return {scenes,common,unlinked,uses,dialogueCount:new Set([...owned,...scenes.flatMap(row=>row.dialogues)].map(graph=>graph.id)).size};
}

// Keep scene and graph selection together; never open another scene's graph as a fallback.
export function resolveRoleContext(content, characterId, options = {}) {
  const tree = roleDialogueTree(content,characterId);
  const graph = content.dialogues.find(row=>row.id===options.dialogueId && (!row.character_id || row.character_id===characterId));
  if (options.unscoped) return {scene:null,graph};
  const explicit = tree.scenes.find(row=>row.level.id===options.levelId && row.appearance.id===options.appearanceId);
  if (explicit) return {scene:explicit,graph:explicit.dialogues.find(row=>row.id===graph?.id) || explicit.dialogues[0]};
  if (graph) return {scene:tree.scenes.find(row=>row.dialogues.some(row=>row.id===graph.id)) || null,graph};
  const scene = tree.scenes.find(row=>row.dialogues.length) || tree.scenes[0] || null;
  return {scene,graph:scene?.dialogues[0] || (!scene ? tree.common[0] || tree.unlinked[0] : undefined)};
}

export function addAppearanceDialogues(content, level, appearance, ids) {
  const candidates = content.dialogues.filter(graph=>!graph.character_id || graph.character_id===appearance.character_id);
  if (!ids.length || ids.some(id=>!candidates.some(graph=>graph.id===id))) throw new Error(t("请选择这个人物可使用的对白"));
  const existing = dialoguesFor(content,appearance).map(graph=>graph.id);
  return {...level,appearances:level.appearances.map(row=>row.id===appearance.id ? {...row,dialogue_ids:[...new Set([...existing,...ids])]} : row)};
}
