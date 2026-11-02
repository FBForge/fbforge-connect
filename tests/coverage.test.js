import test from 'node:test';
import assert from 'node:assert/strict';
import {
  productSource,
  coverageSourcePath,
  assertCoverageInventory,
  browserCoverageOptions,
} from '../scripts/coverage-options.mjs';
import { engineCoverage } from '../scripts/coverage-engine.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('coverage includes runtime modules and Vue, excludes only non-product or type-only sources', () => {
  for (const path of [
    'frontend/src/contracts.ts',
    'frontend/src/native.ts',
    'frontend/src/App.vue',
    'C:\\app\\frontend\\src\\send\\form.js',
  ])
    assert.equal(productSource(path), true);
  for (const path of [
    'frontend/src/contracts.d.ts',
    'frontend/src/style.css',
    'tests/fake.js',
    'node_modules/vue/index.js',
  ])
    assert.equal(productSource(path), false);
  assert.equal(
    coverageSourcePath('Sender.vue', { distFile: 'frontend/src/send/Sender.vue' }),
    'frontend/src/send/Sender.vue',
  );
  assert.equal(
    coverageSourcePath('/src/send/useSendAddressing.ts?t=123'),
    'frontend/src/send/useSendAddressing.ts',
  );
});
test('coverage fails closed when an unloaded module disappears from the denominator', () => {
  const expected = ['frontend/src/loaded.js', 'frontend/src/unloaded.vue'];
  assert.throws(() => assertCoverageInventory([expected[0]], expected), /coverage_inventory_invalid/);
  assert.throws(
    () => assertCoverageInventory([...expected, expected[0]], expected),
    /coverage_inventory_invalid/,
  );
  assert.throws(() => assertCoverageInventory(['tests/fake.js'], expected), /coverage_inventory_invalid/);
  assert.throws(() => assertCoverageInventory([], []), /coverage_inventory_invalid/);
  assert.doesNotThrow(() => assertCoverageInventory(expected, expected));
});
test('browser collection admits only product scripts from the exact test server', () => {
  const filter = browserCoverageOptions('coverage/browser').entryFilter;
  for (const url of ['http://127.0.0.1:1420/src/App.vue', 'http://127.0.0.1:1420/src/native.ts?t=42'])
    assert.equal(filter({ url }), true);
  for (const url of [
    '',
    'not a URL',
    'http://evil.invalid/src/App.vue',
    'http://127.0.0.1:1420/tests/fake.js',
    'http://127.0.0.1:1420/src/App.vue?vue&type=style',
  ])
    assert.equal(filter({ url }), false);
});
test('Java aggregation rejects missing modules and empty reports, and reads root totals', () => {
  const groups = ['contract', 'adapter-support', 'adapter-v2', 'adapter-v3', 'engine-host']
    .map((name) => `<group name="${name}"><counter type="LINE" missed="0" covered="1"/></group>`)
    .join('');
  const xml = `<report>${groups}<counter type="LINE" missed="30" covered="70"/><counter type="CLASS" missed="1" covered="9"/></report>`;
  assert.equal(engineCoverage(xml).LINE.pct, 70);
  assert.equal(engineCoverage(xml).LINE.total, 100);
  assert.throws(() => engineCoverage('<report/>'), /modules_missing/);
  assert.throws(() => engineCoverage(`<report>${groups}</report>`), /coverage_empty/);
  assert.throws(
    () => engineCoverage(xml.replace('<group name="adapter-support">', '<group name="other">')),
    /modules_missing/,
  );
});

async function summaryFixture(run, scope = 'native-contracts') {
  const directory = await mkdtemp(join(tmpdir(), 'connect-coverage-'));
  try {
    await mkdir(join(directory, 'coverage', scope), { recursive: true });
    await run(async (report) => {
      await writeFile(join(directory, 'coverage', scope, 'scope.json'), JSON.stringify(report));
      return spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../scripts/coverage-summary.mjs', import.meta.url)), scope],
        {
          cwd: directory,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
        },
      );
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const nativeReport = (platform, covered) => ({
  scope: `Native ${platform}`,
  platform,
  architecture: 'x64',
  summary: {
    lines: { count: 100, covered, percent: covered },
    branches: { count: 0, covered: 0, percent: 0 },
  },
});
test('native reports declare their platform and respect its independently measured minimum', async () => {
  await summaryFixture(async (run) => {
    assert.equal((await run(nativeReport('linux', 58))).status, 0);
    const below = await run(nativeReport('linux', 56));
    assert.notEqual(below.status, 0);
    assert.match(below.stderr, /coverage_below_baseline/);
    assert.match((await run(nativeReport('win32', 72))).stderr, /coverage_below_baseline/);
    assert.equal((await run(nativeReport('win32', 74))).status, 0);
    const missing = nativeReport('win32', 82);
    delete missing.platform;
    assert.match((await run(missing)).stderr, /coverage_native_platform_missing/);
  });
  await summaryFixture(async (run) => {
    assert.equal((await run(nativeReport('win32', 31))).status, 0);
    assert.match((await run(nativeReport('win32', 29))).stderr, /coverage_below_baseline/);
  }, 'native-desktop');
});
test('reported percentages must agree with finite covered and total counters', async () => {
  await summaryFixture(async (run) => {
    const inflated = nativeReport('win32', 5);
    inflated.summary.lines.percent = 100;
    assert.match((await run(inflated)).stderr, /coverage_metric_invalid/);
    inflated.summary.lines.covered = 120;
    assert.match((await run(inflated)).stderr, /coverage_metric_invalid/);
    const empty = nativeReport('win32', 0);
    empty.summary.lines.count = 0;
    assert.match((await run(empty)).stderr, /coverage_empty/);
  });
});
