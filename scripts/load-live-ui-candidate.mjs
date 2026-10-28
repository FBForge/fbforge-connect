// CI-only: select an independently validated installer for real desktop UI tests.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, appendFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

const requireCheck = (value, code) => {
  if (!value) throw new Error(code);
};
const repository = 'FBForge/fbforge-connect';
try {
  requireCheck(process.env.GITHUB_REPOSITORY === repository, 'ui_repository_denied');
  requireCheck(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'ui_event_denied');
  const runId = process.env.UI_VALIDATION_RUN;
  requireCheck(/^[1-9][0-9]{0,18}$/.test(runId || ''), 'ui_validation_run_invalid');
  const run = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/runs/${runId}`]));
  requireCheck(
    run.status === 'completed' &&
      run.conclusion === 'success' &&
      run.path === '.github/workflows/windows.yml' &&
      run.head_repository?.full_name === repository &&
      ['main', 'release/0.2.0'].includes(run.head_branch),
    'ui_validation_not_trusted',
  );
  const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'fbforge-ui-candidate-'));
  execFileSync(
    'gh',
    [
      'run',
      'download',
      runId,
      '--repo',
      repository,
      '--name',
      'windows-alpha-unsigned-setup',
      '--dir',
      directory,
    ],
    { stdio: 'pipe' },
  );
  const manifest = JSON.parse(
    (await readFile(join(directory, 'build-info.json'), 'utf8')).replace(/^\uFEFF/, ''),
  );
  const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
  requireCheck(
    manifest.repository === repository &&
      manifest.application === 'FBForge Connect' &&
      manifest.platform === 'windows-x64' &&
      manifest.version === version &&
      manifest.commit === run.head_sha &&
      String(manifest.runId) === runId &&
      manifest.installer === basename(manifest.installer) &&
      manifest.installer === `FBForge Connect_${version}_x64-setup.exe` &&
      manifest.signing === 'unsigned',
    'ui_manifest_invalid',
  );
  const installer = join(directory, manifest.installer);
  const size = (await stat(installer)).size;
  requireCheck(size > 0 && size <= 160 * 1024 * 1024, 'ui_installer_size_invalid');
  const bytes = await readFile(installer);
  requireCheck(
    bytes.length === manifest.bytes && createHash('sha256').update(bytes).digest('hex') === manifest.sha256,
    'ui_installer_digest_mismatch',
  );
  await appendFile(
    process.env.GITHUB_ENV,
    `FBFORGE_UI_INSTALLER=${installer}\nFBFORGE_UI_SOURCE_SHA=${run.head_sha}\nFBFORGE_UI_VERSION=${version}\n`,
  );
  console.log(`Real desktop UI candidate: validated run ${runId}, source ${run.head_sha}`);
} catch (error) {
  console.error(/^[a-z_]+$/.test(error.message) ? error.message : 'ui_candidate_load_failed');
  process.exitCode = 1;
}
