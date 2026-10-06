import {t,tm} from './i18n.js';
// Editors return true only after their draft has been saved or discarded.
export async function resolveNavigation(editors, decision, navigate) {
  if (decision === 'cancel') return false;
  if (!['save', 'discard'].includes(decision)) throw new Error(t("未知的离开方式"));
  if (editors.some(editor => editor.busy)) throw new Error(t("当前编辑正在保存，请稍后再试"));
  for (const editor of editors) {
    if (await editor[decision]() !== true) throw new Error(t("未完成保存，已保留当前编辑。请检查内容后重试。"));
  }
  navigate();
  return true;
}
