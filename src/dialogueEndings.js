export const isDialogueEnding = node => node?.node_type === 'ending';

export function removeDialogueNode(graph, id) {
  if (graph.nodes.length <= 1 || !graph.nodes.some(node => node.id === id)) return null;
  const nodes = graph.nodes.filter(node => node.id !== id).map(node => ({
    ...node,
    options: node.options.map(option => option.target_node_id === id ? {...option,target_node_id:null} : option),
  }));
  return {nodes,entry_node_id:graph.entry_node_id === id ? nodes[0].id : graph.entry_node_id,
    entry_routes:graph.entry_routes.filter(route => route.node_id !== id)};
}
