// Build a complete optional scanner component; official code and databases stay outside Git.
import { readFile, writeFile, mkdir, mkdtemp, rm, rename, copyFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest, run, download, verifyEngine, copyEngine, databaseFiles } from './scanner/component.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const cache = resolve(argument('--cache') || join(root, '.cache/scanner'));
const databaseInput = argument('--database-directory');
const sigtoolInput = argument('--sigtool');
await mkdir(cache, { recursive: true });
const archive = await download(manifest.archive, cache),
  source = await download(manifest.source, cache);
await mkdir(join(root, 'desktop/resources'), { recursive: true });
const scratch = await mkdtemp(join(root, 'desktop/resources/.stage-scanner-'));
const target = join(root, 'desktop/resources/scanner');
const staging = join(scratch, 'component');
const dist = join(root, 'desktop/target/scanner-dist');
try {
  const gpg =
    argument('--gpg') ||
    (process.platform === 'win32'
      ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/usr/bin/gpg.exe')
      : 'gpg');
  const keyring = join(scratch, 'gpg');
  await mkdir(keyring, { mode: 0o700 });
  const key = fileURLToPath(new URL('./scanner/talos-public-key.asc', import.meta.url));
  run(gpg, ['--homedir', keyring, '--batch', '--import', key]);
  for (const file of [archive, source]) {
    const url = (file === archive ? manifest.archive.url : manifest.source.url) + '.sig';
    const signature = file + '.sig';
    try {
      await access(signature);
    } catch {
      run(process.platform === 'win32' ? 'curl.exe' : 'curl', [
        '--fail',
        '--location',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        '--max-time',
        '120',
        '--output',
        signature,
        url,
      ]);
    }
    const result = run(
      gpg,
      ['--homedir', keyring, '--batch', '--status-fd', '1', '--verify', signature, file],
      { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
    );
    if (!result.stdout.includes(`[GNUPG:] VALIDSIG ${manifest.signerFingerprint} `))
      throw new Error('scanner_build_signature_invalid');
  }
  const extracted = join(scratch, 'extracted');
  await mkdir(extracted);
  if (process.platform === 'win32')
    run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Expand-Archive -LiteralPath $env:FBFC_SCANNER_ARCHIVE -DestinationPath $env:FBFC_SCANNER_EXTRACT -Force',
      ],
      { env: { ...process.env, FBFC_SCANNER_ARCHIVE: archive, FBFC_SCANNER_EXTRACT: extracted } },
    );
  else run('unzip', ['-q', archive, '-d', extracted]);
  const engine = join(staging, 'engine');
  await copyEngine(join(extracted, `clamav-${manifest.version}.win.x64`), engine);
  const database = join(staging, 'database');
  await mkdir(database, { recursive: true });
  const sigtool = sigtoolInput ? resolve(sigtoolInput) : join(engine, 'sigtool.exe');
  const verifyDatabase = async (directory) => {
    const names = await databaseFiles(directory);
    for (const name of names.filter((name) => name.endsWith('.cvd')))
      run(sigtool, ['--verify', join(directory, name), '--cvdcertsdir', join(engine, 'certs')], {
        cwd: engine,
      });
    return names;
  };
  const cachedDatabase = join(cache, 'database');
  let currentCache = false;
  if (!databaseInput) {
    try {
      const stamp = JSON.parse(await readFile(join(cache, 'database-cache.json'), 'utf8')).verifiedAt;
      if (Number.isSafeInteger(stamp) && stamp <= Date.now() && Date.now() - stamp < 86400000) {
        for (const name of await verifyDatabase(cachedDatabase))
          await copyFile(join(cachedDatabase, name), join(database, name));
        currentCache = true;
      }
    } catch {
      /* A missing or invalid cache never substitutes for verified official databases. */
    }
  }
  if (databaseInput) {
    for (const name of await databaseFiles(resolve(databaseInput)))
      await copyFile(join(resolve(databaseInput), name), join(database, name));
  } else if (!currentCache) {
    if (process.platform !== 'win32') throw new Error('scanner_build_database_directory_required');
    const configuration = join(scratch, 'freshclam.conf');
    const quote = (path) => {
      if (/[\r\n"]/.test(path)) throw new Error('scanner_build_path_invalid');
      return `"${path}"`;
    };
    await writeFile(
      configuration,
      `DatabaseDirectory ${quote(database)}\nCVDCertsDirectory ${quote(join(engine, 'certs'))}\nDatabaseMirror database.clamav.net\nScriptedUpdates no\nConnectTimeout 10\nReceiveTimeout 30\nMaxAttempts 2\n`,
    );
    run(join(engine, 'freshclam.exe'), ['--config-file', configuration], { cwd: engine, timeout: 300000 });
  }
  const databases = await verifyDatabase(database);
  if (!databaseInput && !currentCache) {
    await mkdir(cachedDatabase, { recursive: true });
    for (const name of databases) await copyFile(join(database, name), join(cachedDatabase, name));
    await writeFile(join(cache, 'database-cache.json'), JSON.stringify({ verifiedAt: Date.now() }));
  }
  await verifyEngine(engine);
  await mkdir(dist, { recursive: true });
  const packagePath = join(dist, `FBForge-Connect-ClamAV-${manifest.version}-windows-x64.zip`);
  await rm(packagePath, { force: true });
  run(
    'cargo',
    [
      '+1.99.0',
      'run',
      '--locked',
      '--manifest-path',
      join(root, 'desktop/native-contracts/Cargo.toml'),
      '--example',
      'scanner-package',
      '--',
      staging,
      packagePath,
    ],
    { cwd: root },
  );
  const sourceTarget = join(dist, `clamav-${manifest.version}.tar.gz`);
  await copyFile(source, sourceTarget);
  await copyFile(source + '.sig', sourceTarget + '.sig');
  await copyFile(key, join(dist, 'talos-public-key.asc'));
  const notices = join(dist, 'third-party-licenses');
  await mkdir(notices, { recursive: true });
  for (const item of manifest.files.filter(
    (file) => file.path === 'COPYING.txt' || file.path.startsWith('COPYING/'),
  )) {
    await copyFile(join(engine, item.path), join(notices, item.path.split('/').at(-1)));
  }
  await writeFile(
    join(dist, 'SOURCE-NOTICE.txt'),
    `Optional ClamAV ${manifest.version}, unmodified official Windows binaries.\nClamAV license and bundled-library notices accompany this package.\nMatching ClamAV source archive and its original Talos signature are included.\nUpstream Windows build instructions: https://github.com/Cisco-Talos/clamav/blob/clamav-${manifest.version}/INSTALL.md\nUpstream dependency build tooling: https://github.com/Cisco-Talos/clamav-mussels-cookbook\nEngine and per-file hashes: component-manifest.json\n`,
  );
  await writeFile(join(dist, 'component-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const payload = join(scratch, 'payload');
  await mkdir(payload);
  await copyFile(packagePath, join(payload, 'component.zip'));
  await writeFile(join(payload, '.keep'), '');
  const backup = target + '.previous';
  await rm(backup, { recursive: true, force: true });
  try {
    await rename(target, backup);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await rename(payload, target);
  } catch (error) {
    try {
      await rename(backup, target);
    } catch {
      /* A missing previous target has nothing to restore. */
    }
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
  console.log(`ClamAV ${manifest.version}: pinned engine, signed databases and offline component staged.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
