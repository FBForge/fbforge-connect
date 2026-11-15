// Distribution gate only. Never signs, modifies, launches or publishes the application.
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('macos_arm64_required');
const [input, output, ...flags] = process.argv.slice(2);
if (!input || !output || flags.some((flag) => flag !== '--distribution'))
  throw Error('usage: verify-bundle.mjs APPLICATION.app INVENTORY.json [--distribution]');
const root = await realpath(input);
const destination = resolve(output);
const destinationParent = await realpath(resolve(destination, '..'));
if (destinationParent === root || destinationParent.startsWith(root + sep))
  throw Error('macos_inventory_must_be_outside_bundle');
if (!root.endsWith('.app') || !(await lstat(root)).isDirectory()) throw Error('macos_bundle_required');
function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 60000 });
  if (result.error || result.status !== 0) throw Error(`macos_bundle_check_failed:${program}`);
  return result.stdout + result.stderr;
}
const executable = join(root, 'Contents/MacOS/fbforge-connect');
const java = join(root, 'Contents/Resources/resources/engine/runtime/bin/java');
for (const path of [executable, java]) {
  const info = await lstat(path);
  if (!info.isFile() || !(info.mode & 0o100)) throw Error('macos_executable_missing');
}
const files = [];
async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      const target = await realpath(path);
      if (!target.startsWith(root + sep)) throw Error('macos_bundle_external_symlink');
      continue;
    }
    if (info.isDirectory()) await walk(path);
    else if (info.isFile()) {
      const kind = run('/usr/bin/file', ['--brief', path]);
      if (!kind.includes('Mach-O')) continue;
      const architectures = run('/usr/bin/lipo', ['-archs', path]).trim().split(/\s+/);
      if (architectures.length !== 1 || architectures[0] !== 'arm64')
        throw Error('macos_bundle_architecture_mismatch');
      files.push({
        path: relative(root, path),
        bytes: info.size,
        sha256: createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
        architectures,
      });
    } else throw Error('macos_bundle_special_file');
  }
}
await walk(root);
const distribution = flags.includes('--distribution');
if (distribution) {
  const team = process.env.FBFORGE_APPLE_TEAM_ID;
  if (!/^[A-Z0-9]{10}$/.test(team || '')) throw Error('macos_team_id_required');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', root]);
  for (const path of [root, ...files.map((file) => join(root, file.path))]) {
    const identity = run('/usr/bin/codesign', ['--display', '--verbose=4', path]);
    if (!identity.split('\n').includes(`TeamIdentifier=${team}`)) throw Error('macos_signer_mismatch');
    if (!/flags=.*runtime/.test(identity)) throw Error('macos_hardened_runtime_missing');
  }
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', root]);
  run('/usr/bin/xcrun', ['stapler', 'validate', root]);
}
await writeFile(
  destination,
  JSON.stringify(
    {
      format: 1,
      target: 'darwin-aarch64',
      distributionVerified: distribution,
      files,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx', mode: 0o600 },
);
console.log(`Verified ${files.length} native arm64 files; distribution gate: ${distribution}.`);
