import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { productName } from '../frontend/src/product.js';

test('renamed installer preserves the legacy upgrade identity with only two reviewed upstream changes', async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [template, provenance, pkg, config, page, cargo, lock] = await Promise.all([
    read('desktop/installer/installer.nsi'),
    read('desktop/installer/upstream.json'),
    read('package.json'),
    read('desktop/tauri.conf.json'),
    read('frontend/index.html'),
    read('desktop/Cargo.toml'),
    read('package-lock.json'),
  ]);
  const source = JSON.parse(provenance),
    app = JSON.parse(config);
  assert.equal(JSON.parse(pkg).devDependencies['@tauri-apps/cli'], source.version);
  assert.equal(JSON.parse(pkg).name, 'fbforge-connect');
  assert.equal(JSON.parse(lock).name, 'fbforge-connect');
  assert.equal(JSON.parse(lock).packages[''].name, 'fbforge-connect');
  assert.match(cargo, /^name = "fbforge-connect"$/m);
  const original = template
    .replace(
      '!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FIT-Connect Test-Client"',
      '!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${PRODUCTNAME}"',
    )
    .replace(
      '!define MANUPRODUCTKEY "Software\\fitconnect\\FIT-Connect Test-Client"',
      '!define MANUPRODUCTKEY "${MANUKEY}\\${PRODUCTNAME}"',
    );
  assert.equal(createHash('sha256').update(original).digest('hex'), source.sha256);
  assert.equal(app.productName, productName);
  assert.equal(app.bundle.publisher, 'FBForge');
  assert.ok(app.app.windows[0].title.startsWith(productName));
  assert.ok(page.includes(`<title>${productName}</title>`));
  assert.equal(app.identifier, 'org.fitconnect.integration-client');
  assert.equal(app.bundle.windows.nsis.template, 'installer/installer.nsi');
  assert.equal(app.bundle.windows.nsis.installerHooks, 'installer/compatibility.nsh');
});
