export function characterCreationCommands(document,draft,id) {
  const name=draft.name.trim();
  if(!name)throw new Error('人物姓名不能为空。');
  const entity={kind:'character',id,name,role:draft.role,importance:draft.importance,description:draft.description};
  const existing=document.content.characters.find(row=>row.id===id);
  if(existing){
    if(Object.entries(entity).some(([key,value])=>existing[key]!==value))throw new Error('人物已创建，请关闭此窗口后在人物档案中继续编辑。');
    return [];
  }
  const board=structuredClone(document.editor.canvases[0] || {id:'canvas-main',name:'人物与故事',nodes:[],edges:[]});
  const x=Math.max(400,...board.nodes.map(node=>node.position.x+310));
  board.nodes.push({entity:{kind:'character',id},position:{x,y:120},visible:true});
  return [{type:'create_entity',entity},{type:'put_canvas',canvas:board}];
}
