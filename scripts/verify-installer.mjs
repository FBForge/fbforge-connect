import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// This checks file consistency and its expected CI origin, not a publisher signature.
export async function verifyInstaller(directory, expected) {
  if (
    !expected ||
    !/^[a-f0-9]{40}$/.test(expected.commit ?? '') ||
    !/^[1-9][0-9]*$/.test(expected.runId ?? '') ||
    !/^[\w.-]+\/[\w.-]+$/.test(expected.repository ?? '') ||
    typeof expected.version !== 'string' ||
    !expected.version
  )
    throw new Error('installer_expected_provenance_required');

  const regularFile = async (name, limit = Infinity) => {
    const info = await lstat(join(directory, name));
    if (!info.isFile() || info.size > limit) throw new Error('installer_invalid_file');
    return info;
  };
  await regularFile('build-info.json', 64 * 1024);
  await regularFile('SHA256SUMS.txt', 4096);
  const build = JSON.parse(await readFile(join(directory, 'build-info.json'), 'utf8'));
  if (
    !build ||
    build.application !== 'FBForge Connect' ||
    build.platform !== 'windows-x64' ||
    build.signing !== 'unsigned' ||
    Object.entries(expected).some(([field, value]) => build[field] !== value)
  )
    throw new Error('installer_provenance_mismatch');

  if (
    typeof build.installer !== 'string' ||
    /[\\/:\x00-\x1f]/.test(build.installer) ||
    !build.installer.endsWith('-setup.exe') ||
    !/^[a-f0-9]{64}$/.test(build.sha256 ?? '') ||
    !Number.isSafeInteger(build.bytes) ||
    build.bytes <= 0
  )
    throw new Error('installer_invalid_manifest');

  const installers = (await readdir(directory)).filter((name) => /\.exe$/i.test(name));
  if (installers.length !== 1 || installers[0] !== build.installer)
    throw new Error('installer_ambiguous_package');
  const info = await regularFile(build.installer);
  if (info.size !== build.bytes) throw new Error('installer_size_mismatch');
  const sums = await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8');
  if (sums !== `${build.sha256}  ${build.installer}\n` && sums !== `${build.sha256}  ${build.installer}\r\n`)
    throw new Error('installer_checksum_manifest_mismatch');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(directory, build.installer))) hash.update(chunk);
  if (hash.digest('hex') !== build.sha256) throw new Error('installer_checksum_mismatch');
  return build;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, commit, runId, repository] = process.argv.slice(2);
  if (!directory || process.argv.length !== 6)
    throw new Error('Usage: node scripts/verify-installer.mjs DIRECTORY COMMIT RUN_ID OWNER/REPOSITORY');
  const { version } = JSON.parse(await readFile(new URL('../desktop/tauri.conf.json', import.meta.url)));
  const build = await verifyInstaller(directory, { commit, runId, repository, version });
  console.log(`Installer verified: ${build.installer}\nSHA256: ${build.sha256}\nSigning: unsigned`);
}
