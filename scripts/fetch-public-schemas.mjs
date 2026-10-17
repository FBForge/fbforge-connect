// Test-only public standards data. Never bundled or retrieved by the product renderer.
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'frontend/test-fixtures/.public-schema-cache');
const digest = (data) => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(await readFile(join(root, 'tests/public-schemas/manifest.json'), 'utf8'));
if (!Array.isArray(manifest) || manifest.length !== 2) throw Error('public_schema_manifest_invalid');
await mkdir(directory, { recursive: true });
for (const item of manifest) {
  const url = new URL(item.url);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'schema.fim.fitko.net' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith('/immutable/schemas/') ||
    !/^[a-z0-9.-]+$/.test(item.file) ||
    !/^[a-f0-9]{64}$/.test(item.sha256)
  )
    throw Error('public_schema_manifest_invalid');
  const target = join(directory, item.file);
  try {
    if (digest(await readFile(target)) === item.sha256) {
      console.log(item.file + ': pinned public schema cached');
      continue;
    }
  } catch {
    // A missing cache is expected on a fresh runner.
  }
  if (process.argv.includes('--offline')) throw Error('public_schema_cache_missing');
  const response = await fetch(url, {
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error('public_schema_http_failed');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 2 * 1024 * 1024) throw Error('public_schema_size_limit');
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  if (digest(data) !== item.sha256) throw Error('public_schema_integrity_failed');
  const temporary = target + '.tmp';
  try {
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(item.file + ': immutable public schema SHA-256 verified');
}
