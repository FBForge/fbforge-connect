import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { gpgPath, publicGpgArguments, manifest } from '../scripts/scanner/component.mjs';

const executable =
  process.env.FITCONNECT_TEST_GPG ||
  (process.platform === 'win32'
    ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/usr/bin/gpg.exe')
    : 'gpg');

async function fixture(context, operation) {
  const probe = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (probe.error?.code === 'ENOENT' && process.env.CI !== 'true') {
    context.skip('GnuPG is required for the scanner packaging integration test');
    return;
  }
  assert.equal(probe.status, 0, 'Scanner packaging CI must provide GnuPG');
  const directory = await mkdtemp(join(tmpdir(), 'fbforge-scanner gpg-'));
  try {
    const args = [
      ...publicGpgArguments(directory, executable),
      '--agent-program',
      gpgPath(join(directory, 'intentionally-missing-agent.exe'), executable),
    ];
    const invoke = (...operation) =>
      spawnSync(executable, [...args, ...operation], { encoding: 'utf8', timeout: 15000 });
    await operation({ directory, invoke });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('scanner public-key import and fingerprint lookup work with an unavailable GPG agent', async (context) => {
  await fixture(context, async ({ invoke }) => {
    const key = fileURLToPath(new URL('../scripts/scanner/talos-public-key.asc', import.meta.url));
    const imported = invoke('--import', gpgPath(key, executable));
    assert.equal(imported.status, 0, imported.stderr);
    const listed = invoke('--with-colons', '--fingerprint', '--list-keys');
    assert.equal(listed.status, 0, listed.stderr);
    const fingerprints = listed.stdout
      .split('\n')
      .filter((line) => line.startsWith('fpr:'))
      .map((line) => line.split(':')[9]);
    assert.ok(fingerprints.includes(manifest.signerFingerprint));
  });
});

test('agent-free scanner verification still rejects invalid key material and detached signatures', async (context) => {
  await fixture(context, async ({ directory, invoke }) => {
    const key = join(directory, 'invalid.asc');
    const signature = join(directory, 'invalid.sig');
    const payload = join(directory, 'payload.txt');
    await writeFile(key, 'not an OpenPGP public key');
    await writeFile(signature, 'not an OpenPGP signature');
    await writeFile(payload, 'fictitious component');
    assert.notEqual(invoke('--import', gpgPath(key, executable)).status, 0);
    const verified = invoke(
      '--status-fd',
      '1',
      '--verify',
      gpgPath(signature, executable),
      gpgPath(payload, executable),
    );
    assert.notEqual(verified.status, 0);
    assert.ok(!verified.stdout.includes('[GNUPG:] VALIDSIG '));
  });
});
