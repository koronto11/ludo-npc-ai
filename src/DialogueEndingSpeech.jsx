import {t,useI18n} from './i18n';

export function DialogueEndingSpeech({ending,content}) {
  useI18n();
  if(!ending?.text?.trim())return null;
  return <article className="preview-speech ending-speech" aria-label={t('NPC 收尾台词')}>
    <div><strong>{content.characters.find(actor=>actor.id===ending.speaker_id)?.name || t('旁白')}</strong><small>{ending.label || t('结束节点')}</small></div>
    <blockquote>{ending.text}</blockquote>
  </article>;
}
