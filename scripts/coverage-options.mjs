import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';

export function productSource(value) {
  const path = value.replaceAll('\\', '/').split('?')[0];
  return /(?:^|\/)frontend\/src\/.+\.(?:js|ts|vue)$/.test(path) && !path.endsWith('.d.ts');
}

export function coverageSourcePath(value, info = {}) {
  let path = value.replaceAll('\\', '/').split('?')[0];
  if (!path.includes('/') && info.distFile)
    path = info.distFile.slice(0, info.distFile.lastIndexOf('/') + 1) + path;
  const match = /(?:^|\/)(?:frontend\/)?src\/(.+)$/.exec(path);
  return match ? `frontend/src/${match[1]}` : path;
}

export async function productFiles(directory = 'frontend/src', vue = true) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await productFiles(path, vue)));
    else if (productSource(path) && (vue || !path.endsWith('.vue'))) files.push(path);
  }
  return files.sort();
}

export function assertCoverageInventory(actual, expected) {
  const normalized = actual.map((path) => coverageSourcePath(path));
  const missing = expected.filter((path) => !normalized.includes(path));
  const unexpected = normalized.filter((path) => !expected.includes(path));
  if (
    !expected.length ||
    missing.length ||
    unexpected.length ||
    new Set(normalized).size !== normalized.length
  )
    throw new Error(
      `coverage_inventory_invalid: missing=${missing.join(',')} unexpected=${unexpected.join(',')}`,
    );
}

export function browserCoverageOptions(outputDir) {
  return {
    name: 'FBForge Connect · Browser coverage',
    outputDir: resolve(outputDir),
    reports: ['v8', 'v8-json', 'json-summary', 'lcovonly', 'console-summary'],
    v8Ignore: false,
    sourcePath: coverageSourcePath,
    sourceFilter: productSource,
    entryFilter: (entry) => {
      if (!URL.canParse(entry.url)) return false;
      const url = new URL(entry.url);
      return (
        url.origin === 'http://127.0.0.1:1420' &&
        url.pathname.startsWith('/src/') &&
        /\.(?:js|ts|vue)$/.test(url.pathname) &&
        url.searchParams.get('type') !== 'style'
      );
    },
  };
}
