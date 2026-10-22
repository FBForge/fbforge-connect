import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('upgrade acceptance selects a signed baseline and retains the candidate verification boundary', () => {
  const source = fileURLToPath(new URL('../scripts/load-upgrade-baseline.py', import.meta.url));
  const program = `
import importlib.util, os, pathlib, sys, tempfile
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(sys.argv[1]).parent))
spec = importlib.util.spec_from_file_location('upgrade', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
def candidate(run):
    calls.append(run)
    return b'', {'setup.exe': b'fixture'}, {'installer': 'setup.exe', 'certificateThumbprint': 'f' * 40}
module.download_candidate = candidate
def listing(path):
    assert path.endswith('/sign-windows.yml/runs?status=success&per_page=20')
    return {'workflow_runs': [
        {'id': 2, 'head_branch': 'feature/other', 'event': 'workflow_dispatch', 'status': 'completed', 'conclusion': 'success'},
        {'id': 3, 'head_branch': 'main', 'event': 'pull_request', 'status': 'completed', 'conclusion': 'success'},
        {'id': 4, 'head_branch': 'develop', 'event': 'workflow_dispatch', 'status': 'completed', 'conclusion': 'success'},
    ]}
module.api = listing
with tempfile.TemporaryDirectory() as root:
    output = pathlib.Path(root, 'environment')
    os.environ.update(GITHUB_REPOSITORY=module.REPOSITORY, RUNNER_TEMP=root,
                      GITHUB_ENV=str(output), UPGRADE_RUN='', UPGRADE_LATEST='true')
    module.main()
    assert calls == ['4']
    assert 'FITCONNECT_PREVIOUS_SIGNER=' + 'f' * 40 in output.read_text()
    assert next(pathlib.Path(root).glob('fbforge-upgrade-*/setup.exe')).read_bytes() == b'fixture'
    # Explicit manual selection wins over automatic baseline discovery.
    os.environ['UPGRADE_RUN'] = '8'
    module.main()
    assert calls == ['4', '8']
    # No successful trusted baseline must fail closed, before downloading anything.
    os.environ['UPGRADE_RUN'] = ''
    module.api = lambda path: {'workflow_runs': []}
    try: module.main()
    except RuntimeError as error: assert str(error) == 'upgrade_baseline_missing'
    else: raise AssertionError('missing baseline accepted')
    assert calls == ['4', '8']
    # The full candidate verifier remains responsible for all provenance checks.
    module.api = listing
    def invalid(run): raise RuntimeError('artifact_digest_mismatch')
    module.download_candidate = invalid
    try: module.main()
    except RuntimeError as error: assert str(error) == 'artifact_digest_mismatch'
    else: raise AssertionError('invalid baseline accepted')
print('upgrade baseline checks passed')
`;
  const result = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', program, source], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.match(result, /upgrade baseline checks passed/);
});
