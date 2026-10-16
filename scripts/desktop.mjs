import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../desktop/', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url));
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { cwd: directory, stdio: 'inherit' });
child.on('error', () => { console.error('Tauri CLI konnte nicht gestartet werden. Bitte npm ci ausführen.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
