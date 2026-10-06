import { t, tm, useI18n } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WarningCircle, FloppyDisk, ArrowRight } from '@phosphor-icons/react';
import { resolveNavigation } from './navigationGuard';
import './unsavedNavigation.css';

export function useNavigationEditor(register, handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!register) return;
    const token = {};
    register(token, () => latest.current);
    return () => register(token, null);
  }, [register]);
}

export function useUnsavedNavigation() {
  const editors = useRef(new Map());
  const pending = useRef(null);
  const processing = useRef(false);
  const [prompt, setPrompt] = useState(null);
  const register = useCallback((token, read) => {
    if (read) editors.current.set(token, read);
    else editors.current.delete(token);
  }, []);
  const request = useCallback((navigate, destination) => {
    if (processing.current) return;
    const drafts = [...editors.current.values()].map(read => read()).filter(editor => editor.dirty);
    if (!drafts.length) { pending.current = null; setPrompt(null); navigate(); return; }
    const next = { navigate, destination, names:drafts.map(editor => editor.name).filter(Boolean).join('、') };
    pending.current = next;
    setPrompt({ ...next, busy:false, error:'' });
  }, []);
  const resolve = useCallback(async decision => {
    if (!pending.current || processing.current) return;
    if (decision === 'cancel') { pending.current = null; setPrompt(null); return; }
    processing.current = true;
    const next = pending.current;
    setPrompt(previous => ({ ...previous, busy:true, error:'' }));
    try {
      const drafts = [...editors.current.values()].map(read => read()).filter(editor => editor.dirty);
      await resolveNavigation(drafts, decision, next.navigate);
      pending.current = null;
      setPrompt(null);
    } catch (error) {
      setPrompt(previous => ({ ...previous, busy:false, error:error.message }));
    } finally { processing.current = false; }
  }, []);
  return { prompt, register, request, resolve };
}

export function UnsavedNavigationBanner({ navigation }) {
  useI18n();
  const panel = useRef(null);
  const { prompt, resolve } = navigation;
  useEffect(() => { if (prompt) panel.current?.focus(); }, [prompt?.navigate]);
  if (!prompt) return null;
  return <section ref={panel} tabIndex={-1} className="unsaved-navigation" aria-label={t("未保存编辑的离开选项")} onKeyDown={event => { if (event.key === 'Escape' && !prompt.busy) { event.stopPropagation(); resolve('cancel'); } }}>
    <WarningCircle size={24}/><div className="unsaved-navigation-copy"><strong>{t("有未保存的编辑，是否离开？")}</strong><p>{prompt.names}{t(" · 即将前往")}{t(prompt.destination || "其他页面")}</p>{prompt.error && <p className="unsaved-navigation-error" role="alert">{tm(prompt.error)}</p>}</div>
    <div className="unsaved-navigation-actions"><button className="secondary unsaved-discard" disabled={prompt.busy} onClick={() => resolve('discard')}>{t("不保存并跳转")}<ArrowRight size={14}/></button><button className="primary" disabled={prompt.busy} onClick={() => resolve('save')}><FloppyDisk size={15}/>{prompt.busy?t("处理中…"):t("保存并跳转")}</button><button className="secondary" disabled={prompt.busy} onClick={() => resolve('cancel')}>{t("取消")}</button></div>
  </section>;
}
