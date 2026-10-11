export function dialogueTextTarget(graph,nodeId,optionId=null) {
  const node=graph?.nodes.find(row=>row.id===nodeId);
  const field=optionId?node?.options.find(row=>row.id===optionId):node;
  return node&&field?{dialogueId:graph.id,nodeId,optionId,text:field.text,label:node.label || node.id}:null;
}

export function markedTextRange(text,start,end) {
  // DOM selection uses UTF-16; the bridge protocol uses Unicode code points.
  const a=Math.max(0,Math.min(text.length,start)),b=Math.max(a,Math.min(text.length,end));
  if(a===b)return {start:0,end:Array.from(text).length};
  return {start:Array.from(text.slice(0,a)).length,end:Array.from(text.slice(0,b)).length};
}

export function capturedDialogueText(field,graph) {
  const target=dialogueTextTarget(graph,field?.dataset?.agentNode,field?.dataset?.agentOption || null);
  return target&&target.text===field.value?{...target,...markedTextRange(field.value,field.selectionStart,field.selectionEnd)}:null;
}

export function collaborationCardIds(graph,scope,selectedIds=[]) {
  if(!graph)return [];
  const selected=new Set(selectedIds);
  return graph.nodes.filter(node=>scope==='flow'||selected.has(node.id)).map(node=>node.id);
}

export function collaborationMarkBody(mark,instruction,scope,nodeIds,revision,context={}) {
  const common={expected_revision:revision,dialogue_id:mark.dialogueId,instruction,scope,
    level_id:context.levelId || null,appearance_id:context.appearanceId || null};
  return scope==='text'?{...common,node_id:mark.nodeId,option_id:mark.optionId,expected_text:mark.text,
    previous_text:mark.previousText,start:mark.start,end:mark.end}:
    {...common,node_ids:collaborationCardIds(mark.graph,scope,nodeIds),expected_nodes:mark.graph.nodes};
}

export function agentClientConfigurations(connection) {
  const {command,args}=connection;
  return {
    codex:`[mcp_servers.npcs_ai_studio]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}`,
    claude:JSON.stringify({mcpServers:{npcs_ai_studio:{type:'stdio',command,args}}},null,2),
  };
}
