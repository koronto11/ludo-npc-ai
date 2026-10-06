export function projectDirectoryName(name) {
  let value=Array.from(name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/^[ .]+|[ .]+$/g,'')).slice(0,90).join('').replace(/[ .]+$/g,'') || '未命名项目';
  if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(value.split('.')[0]))value+='-项目';
  return value;
}
