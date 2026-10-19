import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const sections = ['Frontend dependency licenses', 'Generated from package-lock.json. Do not edit manually.'];
for (const [directory, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  // Optional PDF.js canvas binaries are Node-only and never shipped in the WebView.
  if (!directory || entry.dev || entry.optional) continue;
  if (!directory.startsWith('node_modules/') || directory.split('/').includes('..'))
    throw new Error('Invalid dependency directory');
  const folder = join(root, directory);
  const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  if (pkg.version !== entry.version) throw new Error(`Dependency version mismatch: ${pkg.name}`);
  const files = (await readdir(folder))
    .filter((name) => /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(name))
    .sort();
  if (!files.length) throw new Error(`Missing license text: ${pkg.name}`);
  if (pkg.name === 'pdfjs-dist')
    files.push('standard_fonts/LICENSE_FOXIT', 'standard_fonts/LICENSE_LIBERATION');
  sections.push(`\n${'='.repeat(72)}\n${pkg.name}@${pkg.version}\n${entry.license}`);
  for (const file of files) {
    const text = (await readFile(join(folder, file), 'utf8'))
      .replaceAll('\r\n', '\n')
      .replace(/[\t ]+$/gm, '')
      .trimEnd();
    sections.push(`\n--- ${file} ---\n\n${text}`);
  }
}
const output = sections.join('\n') + '\n';
const destination = join(root, 'licenses/frontend.txt');
if (process.argv.length === 3 && process.argv[2] === '--check') {
  if ((await readFile(destination, 'utf8')).replaceAll('\r\n', '\n') !== output)
    throw new Error('Frontend-Lizenzhinweise veraltet. Bitte npm run licenses:update ausführen.');
} else if (process.argv.length === 2) {
  await writeFile(destination, output);
} else throw new Error('Usage: node scripts/frontend-licenses.mjs [--check]');
