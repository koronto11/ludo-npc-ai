// Build shared counts once instead of scanning the full project for every card.
export function castIndex(content) {
  const appearances=new Map(),dialogues=new Map();
  for(const level of content.levels||[]) {
    const tracks=new Map(level.tracks.map(track=>[track.id,track]));
    for(const appearance of level.appearances) {
      const rows=appearances.get(appearance.character_id)||[];
      rows.push({level,appearance,track:tracks.get(appearance.track_id)});
      appearances.set(appearance.character_id,rows);
    }
  }
  for(const graph of content.dialogues||[]) {
    const rows=dialogues.get(graph.character_id)||[];rows.push(graph);dialogues.set(graph.character_id,rows);
  }
  return {appearances,dialogues};
}
export function castPage(rows,requested,size=60) {
  const pages=Math.max(1,Math.ceil(rows.length/size));
  const page=Math.max(1,Math.min(pages,requested));
  return {page,pages,rows:rows.slice((page-1)*size,page*size),start:rows.length?(page-1)*size+1:0,end:Math.min(page*size,rows.length)};
}
