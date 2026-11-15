// Read-only feasibility probe: verify upstream, expand into scratch, never run installer scripts.
import { mkdtemp, mkdir, readFile, writeFile, readdir, lstat, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { download, manifest, publicGpgArguments, run } from './component.mjs';
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('macos_arm64_required');
const expected = {
  url: 'https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.5.4/clamav-1.5.4.macos.universal.pkg',
  bytes: 166772489,
  sha256: 'df7fa753e2f9f67f3bc99b2a40a3be7ef559088c68ad6bdf66b4b5764e965bd6',
};
const root = await mkdtemp(join(tmpdir(), 'fbforge-macos-scanner-'));
try {
  const archive = await download(expected, root);
  const keyring = join(root, 'keyring');
  await mkdir(keyring, { mode: 0o700 });
  const args = publicGpgArguments(keyring, 'gpg');
  run('gpg', [...args, '--import', new URL('./talos-public-key.asc', import.meta.url).pathname]);
  run('curl', [
    '--fail',
    '--location',
    '--proto',
    '=https',
    '--proto-redir',
    '=https',
    '--max-time',
    '120',
    '--output',
    archive + '.sig',
    expected.url + '.sig',
  ]);
  const verification = run('gpg', [...args, '--status-fd', '1', '--verify', archive + '.sig', archive], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (!verification.stdout.includes(`[GNUPG:] VALIDSIG ${manifest.signerFingerprint} `))
    throw Error('scanner_build_signature_invalid');
  run('/usr/sbin/pkgutil', ['--check-signature', archive]);
  const expanded = join(root, 'expanded');
  run('/usr/sbin/pkgutil', ['--expand-full', archive, expanded]);
  const files = [];
  async function walk(directory) {
    for (const name of await readdir(directory)) {
      const path = join(directory, name),
        info = await lstat(path);
      if (info.isSymbolicLink()) {
        files.push({ path: path.slice(expanded.length + 1), symlink: true });
        continue;
      }
      if (info.isDirectory()) await walk(path);
      else if (info.isFile()) {
        const record = {
          path: path.slice(expanded.length + 1),
          bytes: info.size,
          sha256: createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        };
        if (/\/(clamd|freshclam|sigtool)$/.test(path)) {
          record.architecture = run('/usr/bin/file', [path], {
            stdio: ['ignore', 'pipe', 'inherit'],
            encoding: 'utf8',
          }).stdout.trim();
          record.dependencies = run('/usr/bin/otool', ['-L', path], {
            stdio: ['ignore', 'pipe', 'inherit'],
            encoding: 'utf8',
          }).stdout;
          record.signature =
            run('/usr/bin/codesign', ['--verify', '--strict', path], {
              stdio: ['ignore', 'pipe', 'pipe'],
              encoding: 'utf8',
            }).status === 0;
        }
        files.push(record);
      }
    }
  }
  await walk(expanded);
  const relocated = join(root, 'relocated');
  await mkdir(relocated);
  for (const group of ['programs', 'libraries']) {
    const source = join(expanded, `clamav-1.5.4.macos.universal-${group}.pkg/Payload/usr/local/clamav`);
    await cp(source, relocated, { recursive: true, dereference: true });
  }
  const execution = {};
  for (const program of ['bin/freshclam', 'bin/sigtool', 'sbin/clamd']) {
    execution[program] = run(join(relocated, program), ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).stdout.trim();
  }
  console.log('Relocated vendor executables:', JSON.stringify(execution));
  await mkdir('desktop/target/macos-probe', { recursive: true });
  await writeFile(
    'desktop/target/macos-probe/scanner-inventory.json',
    JSON.stringify({ source: expected, execution, files }, null, 2) + '\n',
  );
  console.log('Upstream macOS package verified and inventoried without system installation.');
} finally {
  await rm(root, { recursive: true, force: true });
}
