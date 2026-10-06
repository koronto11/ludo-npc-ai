import { t, useI18n } from './i18n';
import { Flag } from '@phosphor-icons/react';
import { ControlWidthHandle } from './ControlWidthHandle';

export function PlotEventCard({event, state, time, locked, style, onDrag, onOpen, onPreview, onResize, onResizeKey}) {
  useI18n();
  const status = t(event.enabled ? ({occurred:'已发生', blocked:'等待条件', scheduled:'尚未到时'}[state?.status] || '待预演') : '已停用');
  return <article data-testid={`plot-event-${event.id}`} data-control-key={`event:${event.id}`} className={`plot-event-card ${event.enabled?'':'disabled-event'}`} style={style}>
    <header>
      <button className="plot-event-grip" aria-label={t("移动事件 {0}", [event.name])} title={t("{0} · {1} · {2}；点击编辑；上下排列，左右调整时间，跨场景移动", [event.name, time, status])} disabled={locked} onPointerDown={onDrag} onClick={onOpen}>
        <Flag size={15}/><span><strong>{event.name}</strong><small>{time} · {status}</small></span>
      </button>
    </header>
    <div className="plot-event-actions"><button disabled={locked} onClick={onOpen}>{t("条件 / 效果")}</button><button disabled={locked} onClick={onPreview}>{t("预演")}</button></div>
    <ControlWidthHandle kind="event" name={event.name} width={style.width} locked={locked} onResize={onResize} onResizeKey={onResizeKey}/>
  </article>;
}
