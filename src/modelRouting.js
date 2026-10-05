export const modelPurposes = {character:'角色设定',story:'人物故事',dialogue:'对话分支',text:'非对话文本'};
export const enabledModels = info => (info?.model_profiles || []).filter(p=>p.enabled!==false&&!p.archived);
export function defaultModel(info,purpose) {
  const enabled=enabledModels(info);
  return enabled.find(p=>p.id===info?.purpose_defaults?.[purpose]) || enabled.find(p=>p.id===info?.active_profile_id) || enabled[0] || null;
}
export function generationModel(info,purpose,override) {
  return override ? enabledModels(info).find(p=>p.id===override) || null : defaultModel(info,purpose);
}
