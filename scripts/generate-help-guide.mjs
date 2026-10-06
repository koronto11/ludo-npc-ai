import fs from 'node:fs';
import {helpSections} from '../src/helpContent.js';
for(const language of ['zh','en']){
 const heading=language==='en'?'NPCs AI Studio · User guide':'NPCs AI Studio · 完整使用帮助';
 const text=`# ${heading}\n\n`+helpSections.map((section,index)=>{
  const s=section[language];
  return `## ${index+1}. ${s.title}\n\n${s.intro}\n\n`+s.steps.map((line,i)=>`${i+1}. ${line}`).join('\n')+'\n\n'+(s.code?`\`\`\`text\n${s.code}\n\`\`\`\n\n`:'')+s.notes.map(note=>`- ${note}`).join('\n')+'\n';
 }).join('\n');
 const file=`docs/user-guide-${language}.md`;
 if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')!==text)throw Error(`Guide drift: ${file}`);}else fs.writeFileSync(file,text);
}
console.log('Bilingual help guides synchronized');
