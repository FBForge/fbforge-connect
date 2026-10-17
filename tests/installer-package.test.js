import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyInstaller } from '../scripts/verify-installer.mjs';

const expected = {
  repository: 'FBForge/fbforge-connect',
  commit: 'a'.repeat(40),
  runId: '123456',
  version: '0.1.0-dev.8',
};

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'fbforge-installer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const content = Buffer.from('MZ synthetic installer, never executable');
  const build = {
    application: 'FBForge Connect',
    ...expected,
    platform: 'windows-x64',
    signing: 'unsigned',
    installer: 'FBForge Connect_0.1.0-dev.8_x64-setup.exe',
    bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
  const save = () => writeFile(join(directory, 'build-info.json'), JSON.stringify(build));
  await writeFile(join(directory, build.installer), content);
  await writeFile(join(directory, 'SHA256SUMS.txt'), `${build.sha256}  ${build.installer}\n`);
  await save();
  return { directory, build, save };
}

test('downloaded installer, checksum and expected CI provenance agree', async (t) => {
  const { directory, build } = await fixture(t);
  assert.deepEqual(await verifyInstaller(directory, expected), build);
  await writeFile(join(directory, 'SHA256SUMS.txt'), `${build.sha256}  ${build.installer}\r\n`);
  assert.deepEqual(await verifyInstaller(directory, expected), build);
});

test('same-size installer tampering and truncation are rejected', async (t) => {
  const { directory, build } = await fixture(t);
  const file = join(directory, build.installer);
  const content = await readFile(file);
  content[content.length - 1] ^= 1;
  await writeFile(file, content);
  await assert.rejects(verifyInstaller(directory, expected), /installer_checksum_mismatch/);
  await writeFile(file, content.subarray(0, -1));
  await assert.rejects(verifyInstaller(directory, expected), /installer_size_mismatch/);
});

test('matching checksum cannot substitute an unexpected repository, commit, run or version', async (t) => {
  const { directory } = await fixture(t);
  for (const [field, value] of Object.entries({
    repository: 'other/project',
    commit: 'b'.repeat(40),
    runId: '999',
    version: '0.1.0-alpha.1',
  }))
    await assert.rejects(verifyInstaller(directory, { ...expected, [field]: value }), /provenance_mismatch/);
  await assert.rejects(verifyInstaller(directory, {}), /expected_provenance_required/);
});

test('checksum file and ambiguous packages are rejected even when an installer matches', async (t) => {
  const { directory, build } = await fixture(t);
  await writeFile(join(directory, 'SHA256SUMS.txt'), `${'0'.repeat(64)}  ${build.installer}\n`);
  await assert.rejects(verifyInstaller(directory, expected), /checksum_manifest_mismatch/);
  await writeFile(join(directory, 'another-setup.exe'), 'unexpected');
  await assert.rejects(verifyInstaller(directory, expected), /ambiguous_package/);
});

test('manifest cannot traverse directories or claim a signed publisher', async (t) => {
  const { directory, build, save } = await fixture(t);
  const original = build.installer;
  for (const filename of ['../outside-setup.exe', '..\\outside-setup.exe', 'C:outside-setup.exe']) {
    build.installer = filename;
    await save();
    await assert.rejects(verifyInstaller(directory, expected), /invalid_manifest/);
  }
  build.installer = original;
  build.signing = 'signed';
  await save();
  await assert.rejects(verifyInstaller(directory, expected), /provenance_mismatch/);
});

test(
  'installer symlinks are not followed',
  { skip: process.platform === 'win32' ? 'Symlinks may require Windows developer privileges' : false },
  async (t) => {
    const { directory, build } = await fixture(t);
    await rm(join(directory, build.installer));
    await symlink('build-info.json', join(directory, build.installer));
    await assert.rejects(verifyInstaller(directory, expected), /invalid_file/);
  },
);
