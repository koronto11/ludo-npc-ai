export const characterImportanceLabels = {key:'关键角色',supporting:'支线角色',background:'背景角色'};

// The relationship view retains the legacy, localized tier field.
export function characterImportance(value) {
  if (Object.hasOwn(characterImportanceLabels, value)) return value;
  return Object.entries(characterImportanceLabels).find(([,label])=>label===value)?.[0] || 'supporting';
}
