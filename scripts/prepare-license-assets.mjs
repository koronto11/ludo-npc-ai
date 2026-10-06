import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'ASSET-LICENSING.md', 'licenses/frontend.md', 'licenses/backend.md'];
export function prepareLicenseAssets(sourceRoot = root, destination = join(root, 'dist/client/licenses')) {
  for (const name of files) {
    if (!existsSync(join(sourceRoot, name))) throw new Error(`Missing distribution notice: ${name}`);
  }
  for (const name of files) {
    const target = join(destination, name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(sourceRoot, name), target);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareLicenseAssets();
  console.log('Prepared project, asset and third-party license payloads');
}
