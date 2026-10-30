import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareDesktop } from './prepare-desktop.mjs';

const directory = fileURLToPath(new URL('../desktop/', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url));
const args = process.argv.slice(2);
await prepareDesktop(args);
// Windows ships NSIS only; the updater selects its explicit target. Preserve byte-exact
// executable provenance instead of patching its per-bundle updater marker.
if (process.platform === 'win32' && args[0] === 'build' && !args.includes('--no-binary-patching'))
  args.splice(1, 0, '--no-binary-patching');
const child = spawn(process.execPath, [cli, ...args], { cwd: directory, stdio: 'inherit' });
child.on('error', () => {
  console.error('Tauri CLI konnte nicht gestartet werden. Bitte npm ci ausführen.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
