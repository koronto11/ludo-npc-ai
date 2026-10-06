import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareLicenseAssets } from '../scripts/prepare-license-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryRoot = join(root, '.local-build/license-tests');
mkdirSync(temporaryRoot, { recursive: true });
const cleanup = path => {
  const child = relative(temporaryRoot, resolve(path));
  assert.ok(child && !isAbsolute(child) && !child.startsWith('..'), 'Cleanup must stay within license test directory');
  rmSync(path, { recursive: true, force: true });
};
test('distribution preserves complete notices and the relative license links they use', () => {
  const target = mkdtempSync(join(temporaryRoot, 'package-'));
  try {
    prepareLicenseAssets(root, target);
    for (const name of ['LICENSE', 'ASSET-LICENSING.md', 'THIRD_PARTY_NOTICES.md', 'licenses/frontend.md', 'licenses/backend.md']) {
      assert.deepEqual(readFileSync(join(target, name)), readFileSync(join(root, name)));
    }
    const fonts = readFileSync(join(target, 'licenses/frontend.md'), 'utf8');
    assert.match(fonts, /Copyright 2016 The Inter Project Authors/);
    assert.match(fonts, /SIL OPEN FONT LICENSE/);
  } finally { cleanup(target); }
});

test('a missing source notice fails before producing a partial license package', () => {
  const area = mkdtempSync(join(temporaryRoot, 'missing-'));
  const output = join(area, 'output');
  try {
    assert.throws(() => prepareLicenseAssets(area, output), /Missing distribution notice/);
    assert.equal(existsSync(output), false);
  } finally { cleanup(area); }
});
