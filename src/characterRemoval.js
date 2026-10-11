import { libraryDeleteBlockers, libraryDeleteCommands } from './libraryActionsModel.js';

export function characterRemovalBlockers(document, ids) {
  return [...new Set(ids)].flatMap(id => libraryDeleteBlockers(document, {kind:'character', id})
    .map(row => ({...row, characterId:id})));
}

// One atomic batch, with a single latest-state update so other characters survive.
export function characterRemovalCommands(base, ids, latest) {
  const selected = [...new Set(ids)];
  if (!selected.length) throw new Error('请先选中人物。');
  if (selected.length > 499) throw new Error('一次最多删除 499 个人物，请分批处理。');
  const commands = selected.flatMap(id => libraryDeleteCommands(base, {kind:'character', id}, latest))
    .filter(command => command.type !== 'set_initial_state');
  const characters = {...latest.content.initial_state?.characters};
  let changed = false;
  for (const id of selected) if (Object.hasOwn(characters, id)) { delete characters[id]; changed = true; }
  if (changed) commands.push({type:'set_initial_state', state:{...latest.content.initial_state, characters}});
  return commands;
}

export function characterDeleteKey(event) {
  const editable = event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
  return event.key==='Delete' && !event.defaultPrevented && !event.repeat && !event.isComposing
    && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    && (!editable || editable.matches('input[type="checkbox"]'));
}
