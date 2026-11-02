import { spawnSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { productFiles, assertCoverageInventory } from './coverage-options.mjs';

const output = resolve(process.env.FBFORGE_NODE_COVERAGE || 'coverage/node');
await rm(resolve(output, 'scope.json'), { force: true });
const result = spawnSync(
  process.execPath,
  [
    'node_modules/c8/bin/c8.js',
    '--reports-dir',
    output,
    process.execPath,
    '--experimental-strip-types',
    '--test',
    'tests/*.test.js',
  ],
  { stdio: 'inherit' },
);
if (result.error || result.status !== 0) process.exit(result.status || 1);
const report = JSON.parse(await readFile(resolve(output, 'coverage-summary.json'), 'utf8'));
assertCoverageInventory(
  Object.keys(report).filter((key) => key !== 'total'),
  await productFiles('frontend/src', false),
);
if (!report.total?.lines?.total) throw new Error('node_coverage_empty');
await writeFile(
  resolve(output, 'scope.json'),
  JSON.stringify(
    {
      scope: 'Node unit tests · all frontend/src runtime JS and TS, including never-loaded files',
      excludes: [
        'Vue components (measured separately in browser)',
        'declarations and type-only contracts',
        'tests',
        'dependencies',
      ],
      summary: report.total,
    },
    null,
    2,
  ) + '\n',
);
