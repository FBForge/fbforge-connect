import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeProductReport } from './coverage-native-product.mjs';

const target = process.argv[2];
if (!['contracts', 'desktop'].includes(target)) throw new Error('coverage_native_target_required');
const manifest = target === 'contracts' ? 'desktop/native-contracts/Cargo.toml' : 'desktop/Cargo.toml';
const output = resolve(`coverage/native-${target}`);
await mkdir(output, { recursive: true });
await rm(resolve(output, 'scope.json'), { force: true });
// Instrumented objects never enter the production build cache or installer.
const targetDirectory = await mkdtemp(join(tmpdir(), 'fbforge-coverage-'));
function cargo(args) {
  const result = spawnSync(
    'cargo',
    [
      '+1.99.0',
      'llvm-cov',
      ...args,
      '--manifest-path',
      manifest,
      '--ignore-filename-regex',
      'native-contracts[/\\\\](examples[/\\\\]|lib[.]rs)',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        LLVM_COV_FLAGS: '',
        CARGO_LLVM_COV_FLAGS: '',
        CARGO_LLVM_COV_TARGET_DIR: targetDirectory,
      },
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(`native_coverage_command_failed: ${result.status ?? result.error?.code}`);
}
try {
  cargo(['--locked', '--html', '--output-dir', output]);
  cargo(['report', '--json', '--summary-only', '--output-path', resolve(output, 'summary.json')]);
  cargo(['report', '--lcov', '--output-path', resolve(output, 'raw.lcov')]);
} finally {
  await rm(targetDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
const report = JSON.parse(await readFile(resolve(output, 'summary.json'), 'utf8'));
if (!report.data?.[0]?.totals?.lines?.count || !report.data[0].files.length)
  throw new Error('native_coverage_empty');
await nativeProductReport(output, process.platform, process.arch, target);
