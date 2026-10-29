import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const powershell =
  process.env.FITCONNECT_TEST_PWSH || (process.platform === 'win32' ? 'powershell.exe' : null);
const script = new URL('../scripts/setup-update-signing.ps1', import.meta.url);
test('update signer pins its independent CLI and leaves an UNC checkout before invoking cmd', async () => {
  const source = await readFile(script, 'utf8');
  assert.ok(source.indexOf('Push-Location $working') < source.indexOf('& npx.cmd'));
  assert.ok(source.includes('--package "@tauri-apps/cli@$cliVersion"'));
  assert.ok(source.includes('update_private_key_requires_local_windows_path'));
  assert.ok(source.includes('update_key_already_exists'));
});
test(
  'PowerShell signer setup writes only the public key and rejects private keys inside the checkout',
  { skip: !powershell },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'connect-signing-test-'));
    try {
      const repository = join(root, 'checkout with spaces');
      await mkdir(join(repository, 'scripts'), { recursive: true });
      await mkdir(join(repository, 'desktop'));
      await copyFile(script, join(repository, 'scripts', 'setup-update-signing.ps1'));
      await writeFile(
        join(repository, 'package.json'),
        JSON.stringify({ devDependencies: { '@tauri-apps/cli': '2.12.3' } }),
      );
      const harness = join(root, 'harness.ps1');
      await writeFile(
        harness,
        `param($Repository,$KeyFile)
$ErrorActionPreference='Stop'
$env:OS='Windows_NT'
$env:LOCALAPPDATA=Split-Path -Parent $KeyFile
function global:npx.cmd {
  if ((Get-Location).Path -eq $Repository) { throw 'unc_checkout_used_for_cmd' }
  if (($args[0..5] -join '|') -ne '--yes|--package|@tauri-apps/cli@2.12.3|tauri|signer|generate') { throw 'wrong_signer' }
  [IO.File]::WriteAllText($args[7], 'synthetic-private')
  [IO.File]::WriteAllText($args[7]+'.pub', 'synthetic-public')
  $global:LASTEXITCODE=0
}
& (Join-Path $Repository 'scripts/setup-update-signing.ps1') -KeyPath $KeyFile
if ([IO.File]::ReadAllText((Join-Path $Repository 'desktop/update-public-key.txt')).Trim() -ne 'synthetic-public') { throw 'public_key_missing' }
foreach($bad in @($Repository,(Join-Path $Repository 'private.key'))) {
 try { & (Join-Path $Repository 'scripts/setup-update-signing.ps1') -KeyPath $bad; throw 'guard_missing' }
 catch { if ($_.Exception.Message -ne 'update_private_key_must_be_outside_repository') { throw } }
}
try { & (Join-Path $Repository 'scripts/setup-update-signing.ps1') -KeyPath $KeyFile; throw 'overwrite_guard_missing' }
catch { if ($_.Exception.Message -ne 'update_key_already_exists') { throw } }
`,
      );
      const result = spawnSync(
        process.env.FITCONNECT_TEST_PWSH,
        ['-NoProfile', '-File', harness, repository, join(root, 'private.key')],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!result.stdout.includes('synthetic-private'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
