import {t,tm} from './i18n.js';
// Groups remain character tags, so existing project files and scene generation agree.
export const characterGroups = characters => [...new Set(characters.flatMap(row => row.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
export function groupName(value) {
  const name = value.trim();
  if (!name || [...name].length > 150) throw new Error(t("分组名称需为 1–150 个字符"));
  return name;
}
export function groupCommands(characters, operation) {
  const ids = operation.ids ? new Set(operation.ids) : null;
  if (ids && [...ids].some(id => !characters.some(row => row.id === id))) throw new Error(t("所选人物已不存在，请重新选择"));
  const changes = operation.type === 'membership' ? Object.entries(operation.changes).map(([name, checked]) => [groupName(name), checked]) : [];
  const source = ['rename', 'remove', 'move'].includes(operation.type) ? groupName(operation.source) : '';
  const target = ['rename', 'move'].includes(operation.type) ? groupName(operation.target) : '';
  if (!['membership', 'rename', 'remove', 'move'].includes(operation.type)) throw new Error(t("未知分组操作"));
  if (operation.type === 'move' && source === target) throw new Error(t("目标分组与原分组相同"));
  const commands = [];
  for (const row of characters) {
    if (ids && !ids.has(row.id)) continue;
    let tags = [...row.tags];
    if (operation.type === 'membership') {
      for (const [name, checked] of changes) tags = checked ? [...new Set([...tags, name])] : tags.filter(tag => tag !== name);
    } else if (tags.includes(source)) {
      tags = operation.type === 'remove' ? tags.filter(tag => tag !== source) : [...new Set(tags.map(tag => tag === source ? target : tag))];
    }
    if (tags.length > 100) throw new Error(t("{0} 的分组已达到 100 个，请先移出部分分组", [row.name]));
    if (JSON.stringify(tags) !== JSON.stringify(row.tags)) commands.push({ type: 'patch_entity', target: { kind: 'character', id: row.id }, changes: { tags } });
  }
  if (commands.length > 500) throw new Error(t("单次分组操作最多涉及 500 人，本次未保存；请缩小选择范围"));
  return commands;
}
export function undoGroupCommands(characters, entry) {
  for (const after of entry.after) {
    const row = characters.find(actor => actor.id === after.id);
    if (!row || JSON.stringify(row.tags) !== JSON.stringify(after.tags)) throw new Error(t("人物分组已被其他操作修改，无法直接撤销；请重新管理分组"));
  }
  return entry.before.map(row => ({ type: 'patch_entity', target: { kind: 'character', id: row.id }, changes: { tags: row.tags } }));
}
