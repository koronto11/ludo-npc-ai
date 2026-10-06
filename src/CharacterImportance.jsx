import {t,useI18n} from './i18n';
import {characterImportance,characterImportanceLabels} from './characterImportanceModel';
import './characterImportance.css';

export function CharacterImportanceBadge({value}) {
  useI18n();
  const kind=characterImportance(value);
  return <span className={`character-importance importance-${kind}`} title={t('角色定位')}>{t(characterImportanceLabels[kind])}</span>;
}

export function CharacterImportanceOptions() {
  useI18n();
  return Object.entries(characterImportanceLabels).map(([value,label])=><option key={value} value={value}>{t(label)}</option>);
}
