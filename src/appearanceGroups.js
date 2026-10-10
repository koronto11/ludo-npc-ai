// Scene-local grouping reuses the existing NPC group contract. It never copies profiles.
export function appearanceGroupStyle(content, level, group) {
  // New manual groups have a stable creation prefix, independent of later roles or generation.
  if (group.id.startsWith('appearance-group-')) return 'appearance';
  const members = level.appearances.filter(a => a.npc_group_id === group.id);
  const ids = new Set(members.map(a => a.id));
  const crowdSource = (content.generation_history || []).some(job => (job.items || []).some(item =>
    item.scene_context?.level_id === level.id && item.scene_context.mode === 'people' && ids.has(item.scene_context.appearance_id)));
  if (crowdSource || !members.length || members.every(a => a.behavior === '背景闲聊')) return 'npc';
  // Compatibility for the first manual-group implementation, which used the older prefix.
  return members.every(a => content.characters.find(c => c.id === a.character_id)?.importance === 'background') ? 'npc' : 'appearance';
}

export function groupMemberIds(level, groupId) {
  return level.appearances.filter(a => a.npc_group_id === groupId).map(a => a.id).sort();
}

export function appearanceGroupLevel(level, {id, name, trackId, memberIds, dissolve = false}) {
  const groups = level.npc_groups || [];
  const original = groups.find(g => g.id === id);
  if (dissolve) {
    if (!original) throw new Error('出场组已不存在，请重新打开。');
    return {...level, npc_groups:groups.filter(g => g.id !== id), appearances:level.appearances.map(a => a.npc_group_id === id ? {...a, npc_group_id:null} : a)};
  }
  if (!name.trim()) throw new Error('请填写出场组名称。');
  if (!level.tracks.some(t => t.id === trackId)) throw new Error('请选择有效的场景。');
  const selected = new Set(memberIds);
  if (selected.size !== memberIds.length || selected.size < (original ? 1 : 2)) throw new Error(original ? '至少保留一位成员；移出全部人物请使用解散组。' : '请选择至少两次人物出场。');
  for (const memberId of selected) {
    const a = level.appearances.find(row => row.id === memberId);
    if (!a || a.track_id !== trackId) throw new Error('只能组合同一场景中的人物出场。');
    if (a.npc_group_id && a.npc_group_id !== id) throw new Error('人物已属于其他出场组，请先移出原组。');
  }
  if (original && original.track_id !== trackId) throw new Error('请通过组设置或整体拖动切换场景。');
  if (!original && groups.length >= 1000) throw new Error('本关卡的组数量已达到上限。');
  return {...level,
    npc_groups:original ? groups.map(g => g.id === id ? {...g, name:name.trim()} : g) : [...groups, {id, name:name.trim(), track_id:trackId, description:'', tags:[]}],
    appearances:level.appearances.map(a => selected.has(a.id) ? {...a, npc_group_id:id} : a.npc_group_id === id ? {...a, npc_group_id:null} : a),
  };
}

export function assertGroupMembershipUnchanged(base, current, groupId) {
  if (JSON.stringify(groupMemberIds(base, groupId)) !== JSON.stringify(groupMemberIds(current, groupId))) throw new Error('组成员已被其他编辑修改，当前输入已保留，请重新打开后核对。');
}

export function groupIntervalSummary(level, groupId) {
  const rows = level.appearances.filter(a => a.npc_group_id === groupId);
  return {start:rows.length ? Math.min(...rows.map(a => a.start_tick)) : 0,
    end:rows.length ? Math.max(...rows.map(a => a.end_tick)) : 0,
    mixed:rows.some(a => a.start_tick !== rows[0].start_tick || a.end_tick !== rows[0].end_tick)};
}
