import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

// A larger cohesive module can be reviewed explicitly here instead of being split mechanically.
const reviewedLimits = new Map();
const roots = [
  'frontend/src',
  'desktop/src',
  ...['contract', 'host', 'adapter-v2', 'adapter-v3'].map((name) => `engine/${name}/src/main/java`),
];
const extensions = new Set(['.vue', '.js', '.ts', '.css', '.rs', '.java']);
let failed = false;
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (entry.isFile() && extensions.has(extname(path))) {
      const lines = (await readFile(path, 'utf8')).trimEnd().split('\n').length;
      if (lines > (reviewedLimits.get(path.replaceAll('\\', '/')) || 500)) {
        console.error(
          `${path}: ${lines} Zeilen. Zuständigkeiten prüfen oder eine begründete Ausnahme hinterlegen.`,
        );
        failed = true;
      }
    }
  }
}
await Promise.all(roots.map(check));
if (failed) process.exitCode = 1;
