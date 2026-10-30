import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const component = fileURLToPath(new URL('../desktop/resources/scanner/component.zip', import.meta.url));
export async function prepareDesktop(
  args,
  { platform = process.platform, componentPath = component, stage = stageScanner } = {},
) {
  if (
    platform !== 'win32' ||
    args[0] !== 'build' ||
    args.some((arg) => ['--debug', '--help', '-h', '--version', '-V'].includes(arg))
  )
    return;
  try {
    const info = await stat(componentPath);
    if (info.isFile() && info.size > 0) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  console.log('Scanner-Komponente fehlt. Geprüftes Paket wird vor dem Installer-Build vorbereitet.');
  await stage();
  const result = await stat(componentPath);
  if (!result.isFile() || result.size === 0)
    throw new Error('Scanner-Paket wurde nicht erstellt. Installer-Build abgebrochen.');
}

function stageScanner() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./stage-scanner.mjs', import.meta.url))], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Scanner-Vorbereitung fehlgeschlagen (${code ?? 'Prozessabbruch'}). Installer-Build nicht gestartet.`,
            ),
          ),
    );
  });
}
