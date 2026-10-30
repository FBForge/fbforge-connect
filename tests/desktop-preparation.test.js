import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareDesktop } from '../scripts/prepare-desktop.mjs';

test('a missing Windows scanner is staged once for online and offline installer entry points', async () => {
  for (const args of [
    ['build'],
    ['build', '--config', 'tauri.offline.conf.json'],
    ['build', '--config', 'local-signing.json', '--', '--locked'],
  ]) {
    const root = await mkdtemp(join(tmpdir(), 'connect-prepare-'));
    try {
      const componentPath = join(root, 'component.zip');
      let stages = 0;
      const stage = async () => {
        stages++;
        await writeFile(componentPath, 'synthetic staged package');
      };
      await prepareDesktop(args, { platform: 'win32', componentPath, stage });
      await prepareDesktop(args, { platform: 'win32', componentPath, stage });
      assert.equal(stages, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
test('development and unrelated commands never download a scanner', async () => {
  for (const [platform, args] of [
    ['linux', ['build']],
    ['win32', ['dev']],
    ['win32', ['build', '--debug']],
    ['win32', ['info']],
    ['win32', ['build', '--help']],
  ]) {
    await prepareDesktop(args, { platform, stage: async () => assert.fail('unexpected scanner download') });
  }
});
test('a failed stage or an empty package aborts preparation instead of reaching the installer build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'connect-prepare-'));
  const componentPath = join(root, 'component.zip');
  try {
    await assert.rejects(
      prepareDesktop(['build'], {
        platform: 'win32',
        componentPath,
        stage: async () => {
          throw new Error('signature check failed');
        },
      }),
      /signature check failed/,
    );
    await assert.rejects(
      prepareDesktop(['build'], {
        platform: 'win32',
        componentPath,
        stage: async () => writeFile(componentPath, ''),
      }),
      /Scanner-Paket wurde nicht erstellt/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
