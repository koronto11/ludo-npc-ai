// Compare only edited fields; preserve clock settings and later unrelated changes.
export const parseWorldRuleLines=text=>text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
export const worldRuleTexts=rows=>rows.map(row=>row.text.trim()).filter(Boolean);

export function worldEditorCommands(base, draft, latest) {
  if (base.project_id !== latest.project_id) throw new Error('世界底稿所属项目已变化，请重新打开编辑。');
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const fields = ['name','premise','rules','tone'];
  const changed = fields.filter(key => !equal(base.content.world[key], draft.world[key]));
  if (changed.some(key => !equal(base.content.world[key], latest.content.world[key])) ||
      (draft.name !== base.name && latest.name !== base.name)) {
    throw new Error('世界底稿已被其他页面修改，当前输入已保留，请核对最新内容后重新编辑。');
  }
  const commands=[];
  if (draft.name !== base.name) commands.push({type:'rename_project',name:draft.name});
  if (changed.length) commands.push({type:'replace_world',world:{...latest.content.world,...Object.fromEntries(changed.map(key=>[key,draft.world[key]]))}});
  return commands;
}

export function legacyRegionCommands(expected, latest) {
  if(expected==null)return [];
  if(latest.content.world.district!==expected)throw new Error('旧区域资料已被其他页面修改，请重新打开关卡设置。');
  return [{type:'replace_world',world:{...latest.content.world,district:''}}];
}
