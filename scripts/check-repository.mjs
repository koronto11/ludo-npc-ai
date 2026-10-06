import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const inventory = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
if (inventory.status !== 0) throw new Error('Cannot read repository inventory');
const files = [...new Set(inventory.stdout.split('\0').filter(name => name && existsSync(resolve(root, name))))];
const publishedPaths = new Set(files);
const errors = [];
for (const name of files) {
  if (/(^|\/)(?:\.local-data|\.local-projects|\.local-build|\.local-archive|node_modules|dist|\.venv|release)(\/|$)/.test(name)
      || /(^|\/)credentials\.json(?:\.lock)?$/.test(name)
      || /(^|\/)\.env(?!\.example$)/.test(name)) errors.push(`Private/generated file tracked: ${name}`);
  if (statSync(resolve(root, name)).size > 50 * 1024 * 1024) errors.push(`Oversized file: ${name}`);
  if (extname(name) !== '.md' || name.startsWith('licenses/')) continue;
  const text = readFileSync(resolve(root, name), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
  const links = [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)].map(match => match[1]);
  links.push(...[...text.matchAll(/<(?:img|a)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]));
  for (const link of links) {
    if (/^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(link)) continue;
    const target = link.replace(/^<|>$/g, '').split(/[?#]/, 1)[0];
    if (!target) continue;
    const absolute = resolve(dirname(resolve(root, name)), decodeURIComponent(target));
    const localPath = relative(root, absolute).replaceAll('\\', '/');
    const inRepository = localPath !== '..' && !localPath.startsWith('../') && !isAbsolute(localPath);
    const published = publishedPaths.has(localPath) || files.some(file => file.startsWith(`${localPath}/`));
    if (!inRepository || !existsSync(absolute) || !published) errors.push(`Broken or unpublished local link: ${name} -> ${target}`);
  }
}
const license = readFileSync(resolve(root, 'LICENSE'), 'utf8').replaceAll('\r\n', '\n');
if (!license.startsWith('MIT License\n')) errors.push('Expected approved MIT license');
for (const name of ['backend/LICENSE', 'skills/npcs-ai-studio-zh/LICENSE', 'skills/npcs-ai-studio-en/LICENSE']) {
  if (!existsSync(resolve(root, name)) || readFileSync(resolve(root, name), 'utf8').replaceAll('\r\n', '\n') !== license.replaceAll('\r\n', '\n')) errors.push(`Stale project license copy: ${name}`);
}
const frontend = readFileSync(resolve(root, 'licenses/frontend.md'), 'utf8');
for (const marker of ['## @fontsource/inter ', '## @fontsource/noto-sans-sc ', 'SIL OPEN FONT LICENSE', 'Copyright']) {
  if (!frontend.includes(marker)) errors.push(`Missing font notice: ${marker}`);
}
for (const name of files.filter(name => name.startsWith('docs/verification/') && name.endsWith('.json'))) {
  const text = readFileSync(resolve(root, name), 'utf8');
  if (/[A-Za-z]:[\\/]+(?:Users|Code)[\\/]+/.test(text)) errors.push(`Unredacted machine path: ${name}`);
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Repository checks passed (${files.length} files; local links, license copies, font notices and private data boundaries)`);
