import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const python = process.platform === 'win32' ? 'python' : 'python3';
const root = fileURLToPath(new URL('../', import.meta.url));
test('release candidates require signed provenance, matching signatures and bounded archives', () => {
  const program = `
import copy, hashlib, importlib.util, io, json, sys, types, zipfile
sys.dont_write_bytecode = True
sys.path.insert(0, 'scripts')
import candidate as c
real_gh = c.gh
commit, thumb = 'a' * 40, 'b' * 40
version, run_id = '0.1.0-alpha.1', '123'
installer = f'FBForge Connect_{version}_x64-setup.exe'
content = b'MZsynthetic-installer-not-executable'
checksum = hashlib.sha256(content).hexdigest()
manifest = dict(repository=c.REPOSITORY, version=version, commit=commit, platform='windows-x64',
    installer=installer, sha256=checksum, signing='authenticode', runId=run_id, validationRunId='100',
    certificateThumbprint=thumb, bytes=len(content))
report = [dict(file=name, sha256=checksum, certificateThumbprint=thumb,
    timestampCertificateThumbprint='c' * 40, verified=True)
    for name in [installer, 'fit-connect-integration-client.exe', 'uninstall.exe']]
def archive(m=None, signatures=None, extra=None):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as output:
        output.writestr(installer, content)
        output.writestr('build-info.json', json.dumps(manifest if m is None else m))
        output.writestr('signature-info.json', json.dumps(report if signatures is None else signatures))
        output.writestr('SHA256SUMS.txt', checksum + '  ' + installer + '\\n')
        if extra: output.writestr(extra, 'unexpected')
    return stream.getvalue()
def rejected(fn, reason):
    try: fn()
    except RuntimeError as error: assert str(error) == reason, str(error)
    else: raise AssertionError(reason)
def read(data): return c.read_candidate(data, commit, checksum, version, run_id)
files, parsed = read(archive())
assert files[installer] == content and parsed == manifest
# An immutable 0.1 baseline keeps its original executable name. A current
# release must have exactly the rebranded name in its signed-file report.
current_version = '0.2.0'
current_installer = f'FBForge Connect_{current_version}_x64-setup.exe'
current_manifest = dict(manifest, version=current_version, installer=current_installer)
def current_archive(binary):
    stream = io.BytesIO()
    signatures = copy.deepcopy(report)
    signatures[0]['file'] = current_installer
    signatures[1]['file'] = binary
    with zipfile.ZipFile(stream, 'w') as output:
        output.writestr(current_installer, content)
        output.writestr('build-info.json', json.dumps(current_manifest))
        output.writestr('signature-info.json', json.dumps(signatures))
        output.writestr('SHA256SUMS.txt', checksum + '  ' + current_installer + '\\n')
    return stream.getvalue()
def read_current(binary):
    return c.read_candidate(current_archive(binary), commit, checksum, current_version, run_id)
assert read_current('fbforge-connect.exe')[1] == current_manifest
rejected(lambda: read_current('fit-connect-integration-client.exe'), 'signature_files_mismatch')
rejected(lambda: read_current('../fbforge-connect.exe'), 'signature_files_mismatch')
for key, value, reason in [
    ('signing', 'unsigned', 'manifest_mismatch'),
    ('commit', 'd' * 40, 'manifest_mismatch'),
    ('sha256', 'e' * 64, 'manifest_mismatch'),
    ('runId', '124', 'manifest_run_mismatch'),
    ('validationRunId', '../123', 'invalid_validation_run'),
    ('certificateThumbprint', 'invalid', 'invalid_certificate'),
    ('bytes', 0, 'installer_size_mismatch'),
]:
    rejected(lambda: read(archive(dict(manifest, **{key: value}))), reason)
for key, value, reason in [
    ('verified', False, 'signature_not_verified'),
    ('certificateThumbprint', 'd' * 40, 'signature_signer_mismatch'),
    ('timestampCertificateThumbprint', '', 'signature_timestamp_missing'),
    ('sha256', 'e' * 64, 'signature_installer_mismatch'),
]:
    changed = copy.deepcopy(report)
    changed[0][key] = value
    rejected(lambda: read(archive(signatures=changed)), reason)
rejected(lambda: read(archive(signatures=report[:2])), 'signature_report_incomplete')
rejected(lambda: read(archive(extra='../escape.exe')), 'unexpected_archive_files')
run = dict(head_sha=commit, status='completed', conclusion='success', path='.github/workflows/sign-windows.yml',
           head_repository=dict(full_name=c.REPOSITORY), event='workflow_dispatch', head_branch='develop')
c.verified_run(run, commit, '.github/workflows/sign-windows.yml')
for key, value, reason in [
    ('event', 'pull_request', 'untrusted_run'),
    ('conclusion', 'failure', 'unverified_source'),
    ('head_repository', dict(full_name='outsider/fork'), 'untrusted_run'),
    ('path', '.github/workflows/windows.yml', 'wrong_workflow'),
]:
    rejected(lambda: c.verified_run(dict(run, **{key:value}), commit, '.github/workflows/sign-windows.yml'), reason)
blob = archive()
artifact = dict(id=9, name='windows-alpha-signed-setup', expired=False, size_in_bytes=len(blob),
                digest='sha256:' + hashlib.sha256(blob).hexdigest())
def api(path):
    if '/jobs?' in path: return dict(total_count=1, jobs=[dict(name='verify-package', conclusion='success')])
    if '/artifacts?' in path: return dict(total_count=1, artifacts=[artifact])
    if path.endswith('/100'): return dict(run, path='.github/workflows/windows.yml', event='push')
    return run
c.api, c.gh = api, lambda *args: blob
assert c.download_candidate(run_id)[2] == manifest
artifact['digest'] = 'sha256:' + '0' * 64
rejected(lambda: c.download_candidate(run_id), 'artifact_digest_mismatch')
original_run = c.subprocess.run
try:
    c.subprocess.run = lambda *args, **kwargs: types.SimpleNamespace(returncode=1, stderr=b'private details (HTTP 404)', stdout=b'')
    rejected(lambda: real_gh('api', 'synthetic'), 'github_operation_failed_http_404')
    c.subprocess.run = lambda *args, **kwargs: types.SimpleNamespace(returncode=1, stderr=b'private details', stdout=b'')
    rejected(lambda: real_gh('api', 'synthetic'), 'github_operation_failed')
finally:
    c.subprocess.run = original_run
spec = importlib.util.spec_from_file_location('attach', 'scripts/attach-candidate.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
draft = dict(draft=True, prerelease=True, published_at=None, target_commitish=commit, tag_name='v' + version)
a.check_draft(draft, commit, version)
for key, value, reason in [
    ('draft', False, 'release_is_not_a_draft'),
    ('prerelease', False, 'release_channel_mismatch'),
    ('published_at', '2026-10-19', 'release_is_published'),
    ('target_commitish', 'develop', 'draft_source_mismatch'),
    ('tag_name', 'v0.1.0', 'draft_version_mismatch'),
]:
    rejected(lambda: a.check_draft(dict(draft, **{key: value}), commit, version), reason)
a.check_draft(dict(draft, prerelease=False, tag_name='v0.1.1'), commit, '0.1.1')
rejected(lambda: a.check_draft(dict(draft, tag_name='v0.1.1'), commit, '0.1.1'), 'release_channel_mismatch')
print('candidate trust boundary passed')
`;
  assert.match(
    execFileSync(python, ['-c', program], { cwd: root, encoding: 'utf8' }),
    /trust boundary passed/,
  );
});

test('CI selects affected modules without building installers for documentation changes', () => {
  const program = `
import importlib.util, json, os, pathlib, subprocess, sys, tempfile
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('changes', 'scripts/ci/changed-components.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
assert m.components(['README.md', 'ROADMAP.md']) == dict(frontend=False, engine=False, native=False)
assert m.components(['frontend/src/App.vue']) == dict(frontend=True, engine=False, native=False)
assert m.components(['engine/host/pom.xml']) == dict(frontend=True, engine=True, native=False)
assert m.components(['desktop/src/vault.rs']) == dict(frontend=True, engine=False, native=True)
assert all(m.components(['.github/workflows/checks.yml']).values())
assert all(m.components(['scripts/windows-signing.psm1']).values())
assert all(m.components(['.npmrc']).values())
for path in ['licenses/frontend.txt', '.prettierignore', '.editorconfig']:
    assert m.components([path]) == dict(frontend=True, engine=False, native=False)
script = str(pathlib.Path('scripts/ci/changed-components.py').resolve())
with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory)
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL, text=True).strip()
    git('init', '-b', 'main')
    git('config', 'user.name', 'CI Fixture')
    git('config', 'user.email', 'ci@example.invalid')
    (root / 'README.md').write_text('First version')
    git('add', 'README.md')
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Initial fixture')
    previous = git('rev-parse', 'HEAD')
    (root / 'README.md').write_text('Updated documentation')
    git('add', 'README.md')
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Update fixture')
    event, output = root / 'event.json', root / 'output.txt'
    for before, expected in [(previous, False), ('f' * 40, True), ('0' * 40, True)]:
        event.write_text(json.dumps({'before': before}))
        output.write_text('')
        env = dict(os.environ, GITHUB_EVENT_NAME='push', GITHUB_REF='refs/heads/main', GITHUB_REPOSITORY='FBForge/fbforge-connect', GITHUB_EVENT_PATH=str(event), GITHUB_OUTPUT=str(output), GITHUB_STEP_SUMMARY=str(root / 'summary.md'))
        subprocess.run([sys.executable, script], cwd=root, env=env, check=True)
        assert output.read_text().splitlines()[:3] == [f'{name}={str(expected).lower()}' for name in ['frontend', 'engine', 'native']]
print('component selection passed')
`;
  assert.match(execFileSync(python, ['-c', program], { cwd: root, encoding: 'utf8' }), /selection passed/);
});
