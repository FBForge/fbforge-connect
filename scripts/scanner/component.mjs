// Build tooling only; none of these commands or filesystem paths are exposed to the renderer.
import { readFile, mkdir, lstat, copyFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
export const manifest = JSON.parse(
  await readFile(new URL('../../desktop/scanner-component.json', import.meta.url), 'utf8'),
);
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    timeout: 600000,
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) throw new Error('scanner_build_command_failed');
  return result;
}
export async function verifyFile(path, expected) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expected.bytes)
    throw new Error('scanner_build_hash_mismatch');
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  if (digest.digest('hex') !== expected.sha256) throw new Error('scanner_build_hash_mismatch');
}
export async function download(expected, directory) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, new URL(expected.url).pathname.split('/').at(-1));
  try {
    await verifyFile(path, expected);
    return path;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  run(process.platform === 'win32' ? 'curl.exe' : 'curl', [
    '--fail',
    '--location',
    '--proto',
    '=https',
    '--proto-redir',
    '=https',
    '--connect-timeout',
    '15',
    '--max-time',
    '600',
    '--retry',
    '2',
    '--output',
    path,
    expected.url,
  ]);
  await verifyFile(path, expected);
  return path;
}
export async function verifyEngine(root) {
  for (const file of manifest.files) await verifyFile(join(root, file.path), file);
}
export async function copyEngine(input, output) {
  await verifyEngine(input);
  for (const item of manifest.files) {
    const target = join(output, item.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(input, item.path), target);
  }
}
export function databaseVersion(header) {
  const fields = header.subarray(0, 512).toString('ascii').split(':');
  if (fields[0] !== 'ClamAV-VDB' || !/^\d+$/.test(fields[2]) || !/^\d+$/.test(fields[8].trim()))
    throw new Error('scanner_database_invalid');
  return fields[2];
}
export async function databaseFiles(root) {
  const names = [];
  for (const stem of ['main', 'daily', 'bytecode']) {
    const name = `${stem}.cvd`,
      file = join(root, name),
      stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 512 || stat.size > 400 * 1024 * 1024)
      throw new Error('scanner_database_invalid');
    // Read only the header rather than allocating another complete database copy.
    let header;
    for await (const chunk of createReadStream(file, { start: 0, end: 511 }))
      header = header ? Buffer.concat([header, chunk]) : chunk;
    const signature = `${stem}-${databaseVersion(header)}.cvd.sign`;
    const signatureStat = await lstat(join(root, signature));
    if (!signatureStat.isFile() || signatureStat.isSymbolicLink() || signatureStat.size > 65536)
      throw new Error('scanner_database_invalid');
    names.push(name, signature);
  }
  return names;
}
