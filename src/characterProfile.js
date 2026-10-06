import {t,tm} from './i18n.js';
import {characterImportanceLabels} from './characterImportanceModel.js';
export const characterFields = ['name','role','importance','description','story','personality','voice','goals','boundary','uncertainties'];
export const characterLists = new Set(['personality','goals','uncertainties']);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function profileChanges(base, draft, latest) {
  if (!latest || latest.id !== base.id) throw new Error(t("人物已移除，请关闭后重新选择"));
  const changes = {};
  for (const field of [...characterFields,'confirmed_fields']) {
    if (equal(base[field],draft[field])) continue;
    if (!equal(base[field],latest[field])) throw new Error(t("这个字段已被其他编辑修改，请重新打开人物档案后核对"));
    changes[field] = characterLists.has(field)?draft[field].map(v=>v.trim()).filter(Boolean):draft[field];
  }
  if ('name' in changes) {
    changes.name=changes.name.trim();
    if (!changes.name) throw new Error(t("人物名称不能为空"));
  }
  if ('importance' in changes && !Object.hasOwn(characterImportanceLabels,changes.importance)) throw new Error(t('请选择有效的角色定位'));
  return changes;
}
