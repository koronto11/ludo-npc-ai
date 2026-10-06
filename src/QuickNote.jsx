import { t, tm, useI18n } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { NotePencil } from '@phosphor-icons/react';
import { Modal } from './Modal';

export function QuickNote({ local, characterId, name, value = '' }) {
  useI18n();
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef(null);
  const editing = draft !== null;
  useEffect(() => { if (editing) textarea.current?.focus(); }, [editing]);
  useEffect(() => {
    if (draft === null || draft === baseline) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, baseline]);
  const close = () => { if (!busy) { setDraft(null); setError(''); } };
  return <div className="quick-note nodrag nopan" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()} onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}>
    <button className={`quick-note-preview ${value ? '' : 'is-empty'}`} aria-label={t("编辑 {0} 的快速备注", [name])} title={value || t("记录一句提示，帮助回忆人物设定")} onClick={() => { setBaseline(value); setDraft(value); setError(''); }}><NotePencil size={14}/><span>{value || t("点击添加快速备注")}</span></button>
    {draft !== null && <Modal title={t("{0} · 快速备注", [name])} subtitle={t("人物总览与关系画布同步；仅供作者记录，不进入模型生成或剧情预演。")} onClose={close}>
      <form className="quick-note-editor" onSubmit={async e => {
        e.preventDefault(); if (busy) return;
        if (draft === baseline) { close(); return; }
        setBusy(true); setError('');
        try { await local.transact([{type:'set_character_note', character_id:characterId, note:draft, expected_note:baseline}]); setDraft(null); }
        catch (reason) { setError(reason.message); }
        finally { setBusy(false); }
      }}><label className="form-field">{t("快速备注")}<textarea ref={textarea} autoFocus disabled={busy} aria-label={t("{0} 的快速备注", [name])} maxLength={3000} rows={6} placeholder={t("例如：表面热情，实际替商会收集消息")} value={draft} onChange={e => setDraft(e.target.value)}/></label><small>{draft.length}{t("/3000 · 留空保存即可清除备注")}</small>{error && <p className="form-error" role="alert">{tm(error)}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={close}>{t("取消")}</button><button type="submit" className="primary" disabled={busy}>{busy ? t("保存中…") : t("保存备注")}</button></div></form>
    </Modal>}
  </div>;
}
