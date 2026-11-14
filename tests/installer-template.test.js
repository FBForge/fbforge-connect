import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { productName } from '../frontend/src/product.js';

test('guarded installer preserves branding, legacy identity and exact scanner additions', async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [template, provenance, pkg, config, page, cargo, lock, upstream] = await Promise.all([
    read('desktop/installer/installer.nsi'),
    read('desktop/installer/upstream.json'),
    read('package.json'),
    read('desktop/tauri.conf.json'),
    read('frontend/index.html'),
    read('desktop/Cargo.toml'),
    read('package-lock.json'),
    read('desktop/installer/upstream-installer.nsi.txt'),
  ]);
  const source = JSON.parse(provenance),
    app = JSON.parse(config);
  assert.equal(JSON.parse(pkg).devDependencies['@tauri-apps/cli'], source.version);
  assert.equal(JSON.parse(pkg).name, 'fbforge-connect');
  assert.equal(JSON.parse(lock).name, 'fbforge-connect');
  assert.equal(JSON.parse(lock).packages[''].name, 'fbforge-connect');
  assert.match(cargo, /^name = "fbforge-connect"$/m);
  assert.equal(createHash('sha256').update(upstream).digest('hex'), source.sha256);
  assert.ok(template.includes('FIT-Connect Test-Client'));
  assert.ok(template.includes('Software\\fitconnect\\FIT-Connect Test-Client'));
  const scannerBlocks = template.match(
    /^[ \t]*; FBForge scanner begin[^\n]*\n[\s\S]*?^[ \t]*; FBForge scanner end[^\n]*\n/gm,
  );
  assert.equal(scannerBlocks.length, 6);
  assert.equal(
    createHash('sha256').update(scannerBlocks.join('')).digest('hex'),
    '7666c9a2eb754407938b61a87ffa907477af195fa1f9fa44921ea2007e704e30',
  );
  assert.equal(app.productName, productName);
  assert.equal(app.bundle.publisher, 'FBForge');
  assert.ok(app.app.windows[0].title.startsWith(productName));
  assert.ok(page.includes(`<title>${productName}</title>`));
  assert.equal(app.identifier, 'org.fitconnect.integration-client');
  assert.equal(app.bundle.windows.nsis.template, 'installer/installer.nsi');
  assert.equal(app.bundle.windows.nsis.installerHooks, 'installer/compatibility.nsh');
});
