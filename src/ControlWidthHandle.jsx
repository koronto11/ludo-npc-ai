import { t, useI18n } from './i18n';
import {widthLimits} from './controlWidths';

export function ControlWidthHandle({kind,name,width,locked,onResize,onResizeKey}) {
  useI18n();
  const label = kind==='group'?t('调整 NPC 组 {0} 宽度',[name]):t('调整剧情事件 {0} 宽度',[name]);
  return <div className="control-width-handle" role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={widthLimits[kind].min} aria-valuemax={widthLimits[kind].max} aria-valuenow={width} aria-disabled={locked} tabIndex={locked?-1:0} title={t("向左缩窄、向右拉宽 · 方向键调整宽度")} onPointerDown={onResize} onKeyDown={e=>{if(!locked && ['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();onResizeKey(e.key==='ArrowLeft'?-20:20);}}}><i/></div>;
}
