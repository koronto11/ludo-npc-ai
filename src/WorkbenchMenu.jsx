import {Children,cloneElement,isValidElement,useLayoutEffect,useRef} from 'react';

export function WorkbenchMenu({id,label,open,onToggle,onClose,children}) {
  const root=useRef(null),trigger=useRef(null),panel=useRef(null);
  const items=()=>[...(panel.current?.querySelectorAll('button:not(:disabled)') || [])];
  const close=(focus=false)=>{onClose();if(focus)trigger.current?.focus();};
  useLayoutEffect(()=>{
    if(!open)return;
    items()[0]?.focus();
    const outside=e=>{if(!root.current?.contains(e.target))onClose();};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open,onClose]);
  const key=e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
    if(e.key==='Tab'){onClose();return;}
    const buttons=items(),index=buttons.indexOf(document.activeElement);
    if(!buttons.length)return;
    let next;
    if(e.key==='ArrowDown')next=(index+1)%buttons.length;
    if(e.key==='ArrowUp')next=(index+buttons.length-1)%buttons.length;
    if(e.key==='Home')next=0;
    if(e.key==='End')next=buttons.length-1;
    if(next!==undefined){e.preventDefault();buttons[next].focus();}
  };
  return <div className="workbench-menu" ref={root}>
    <button ref={trigger} className="workbench-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-menu`} onClick={onToggle} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(!open)onToggle();else items()[e.key==='ArrowUp'?items().length-1:0]?.focus();}}}>{label}</button>
    {open&&<div ref={panel} id={`${id}-menu`} role="menu" aria-label={label} className="dropdown-menu workbench-menu-panel" onKeyDown={key}>
      {Children.map(children,child=>isValidElement(child)&&child.type==='button'?cloneElement(child,{role:child.props.role || 'menuitem',tabIndex:-1,onClick:e=>{close(true);child.props.onClick?.(e);}}):child)}
    </div>}
  </div>;
}
