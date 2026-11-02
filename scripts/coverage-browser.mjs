import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import CoverageReport from 'monocart-coverage-reports';
import { createServer } from 'vite';
import {
  browserCoverageOptions,
  productSource,
  productFiles,
  assertCoverageInventory,
} from './coverage-options.mjs';

const output = resolve(process.env.FBFORGE_BROWSER_COVERAGE || 'coverage/browser');
const options = browserCoverageOptions(output);
await rm(resolve(output, 'scope.json'), { force: true });
// Coverage is a full measurement. Missing pinned public fixtures must not turn
// integration cases into silent skips, as the optional plain UI run permits.
const fixtures = spawnSync(process.execPath, ['scripts/fetch-public-schemas.mjs'], { stdio: 'inherit' });
if (fixtures.error || fixtures.status !== 0) process.exit(fixtures.status || 1);
await new CoverageReport(options).cleanCache();
const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, CI: 'true', FBFORGE_BROWSER_COVERAGE: output },
  },
);
if (result.error || result.status !== 0) process.exit(result.status || 1);

// Compile never-imported modules with the same Vue/TS transforms as tested modules.
// Include them as zero coverage instead of improving the score by omitting files.
const server = await createServer({
  configFile: resolve('frontend/vite.config.js'),
  server: { middlewareMode: true },
  logLevel: 'error',
});
try {
  const report = new CoverageReport({
    ...options,
    all: {
      dir: 'frontend/src',
      filter: (file) => productSource(coverageSource(file)),
      transformer: async (entry) => {
        const source = coverageSource(entry.url);
        const transformed = await server.transformRequest('/' + source.replace(/^frontend\//, ''));
        if (!transformed) throw new Error(`coverage_source_not_compiled: ${source}`);
        entry.source = transformed.code;
        entry.sourceMap = transformed.map;
      },
    },
  });
  const coverage = await report.generate();
  if (!coverage?.files?.length) throw new Error('browser_coverage_empty');
  assertCoverageInventory(
    coverage.files.map((file) => file.sourcePath),
    await productFiles(),
  );
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, 'scope.json'),
    JSON.stringify(
      {
        scope: 'Browser workflows · frontend/src JS, TS and Vue, including never-loaded files',
        excludes: ['declarations and type-only contracts', 'styles/assets', 'test fixtures', 'dependencies'],
        files: coverage.files.map((file) => file.sourcePath),
        summary: coverage.summary,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await server.close();
}
function coverageSource(value) {
  return value.replaceAll('\\', '/').replace(/^.*?(?=frontend\/src\/)/, '');
}
