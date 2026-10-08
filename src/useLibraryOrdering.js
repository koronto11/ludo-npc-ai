import {useEffect,useRef,useState} from 'react';
import {t} from './i18n';
import {librarySiblings,libraryOrderCommands} from './libraryOrderingModel';

const SORT_MIME='application/x-npcs-library-order';

export function useLibraryOrdering(local,announce) {
  const drag=useRef(null), frame=useRef(0), pointer=useRef(null), saving=useRef(false);
  const [busy,setBusy]=useState(false),[marker,setMarker]=useState(null),[dragId,setDragId]=useState(null);
  const stop=()=>{drag.current=null;pointer.current=null;cancelAnimationFrame(frame.current);setMarker(null);setDragId(null);};
  useEffect(()=>{stop();},[local.project._document?.project_id]);
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
  useEffect(()=>{const cancel=e=>{if(e.key==='Escape')stop();};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel);},[]);
  const save=async(base,scope,id,target,after)=>{
    if(saving.current)return;
    saving.current=true;setBusy(true);
    try{await local.transact(latest=>libraryOrderCommands(base,latest,scope,id,target,after));announce(t('资料排列已保存'));}
    catch(error){announce(error.message);}
    finally{saving.current=false;setBusy(false);}
  };
  const scroll=()=>{
    const point=pointer.current;
    if(!drag.current||!point)return;
    const box=point.tree.getBoundingClientRect(), edge=36;
    const speed=point.y<box.top+edge?-Math.ceil((box.top+edge-point.y)/4):point.y>box.bottom-edge?Math.ceil((point.y-box.bottom+edge)/4):0;
    if(speed)point.tree.scrollTop+=Math.max(-14,Math.min(14,speed));
    frame.current=requestAnimationFrame(scroll);
  };
  const start=(e,scope,id)=>{
    if(busy||!local.ready){e.preventDefault();return;}
    e.stopPropagation();stop();
    drag.current={scope,id,base:local.project._document};setDragId(id);
    e.dataTransfer.setData(SORT_MIME,id);e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setDragImage(e.currentTarget.closest('.library-action-row'),10,15);
    frame.current=requestAnimationFrame(scroll);
  };
  const over=(e,scope,id)=>{
    if(!drag.current||!e.dataTransfer.types.includes(SORT_MIME))return;
    pointer.current={tree:e.currentTarget.closest('.library-tree'),y:e.clientY};
    if(drag.current.scope!==scope||drag.current.id===id){e.dataTransfer.dropEffect='none';setMarker(null);return;}
    e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';
    const box=e.currentTarget.getBoundingClientRect();setMarker({scope,id,after:e.clientY>=box.top+box.height/2});
  };
  const drop=(e,scope,id)=>{
    const from=drag.current;if(!from)return;
    e.preventDefault();e.stopPropagation();
    const box=e.currentTarget.getBoundingClientRect(),after=e.clientY>=box.top+box.height/2;
    stop();if(from.scope===scope&&from.id!==id)save(from.base,scope,from.id,id,after);
  };
  const move=(scope,id,direction)=>{
    const rows=librarySiblings(local.project,scope),index=rows.findIndex(row=>row.id===id),target=rows[index+direction];
    if(target)save(local.project._document,scope,id,target.id,direction>0);
  };
  const props=(scope,id)=>({sortScope:scope,sortDisabled:busy||!local.ready,sorting:dragId===id,insertion:marker?.scope===scope&&marker.id===id?(marker.after?'after':'before'):null,onSortStart:e=>start(e,scope,id),onSortEnd:stop,onSortOver:e=>over(e,scope,id),onSortDrop:e=>drop(e,scope,id),onSortKey:e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();move(scope,id,e.key==='ArrowUp'?-1:1);}}});
  const treeProps={onDragOver:e=>{if(!drag.current)return;pointer.current={tree:e.currentTarget,y:e.clientY};setMarker(null);},onDragLeave:e=>{if(!e.currentTarget.contains(e.relatedTarget)){setMarker(null);pointer.current=null;}},onDrop:e=>{if(drag.current){e.preventDefault();stop();}}};
  return {props,move,busy,treeProps};
}
