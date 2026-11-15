import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('a combined feed preserves Windows and binds the Mac package to its exact version and target', () => {
  const result = execFileSync(
    'python3',
    [
      '-B',
      '-c',
      `
import importlib.util
spec = importlib.util.spec_from_file_location('updates', 'scripts/update-release.py')
u = importlib.util.module_from_spec(spec); spec.loader.exec_module(u)
v = '0.5.0'; sig = 'YWJjZA=='
w = u.metadata(f'FBForge Connect_{v}_x64-setup.exe', v, sig)
m = u.macos_metadata(f'FBForge.Connect_{v}_aarch64.app.tar.gz', v, sig)
c = u.combined_metadata(w, m)
assert set(c['platforms']) == {'windows-x86_64', 'darwin-aarch64'}
assert c['platforms']['windows-x86_64'] == w['platforms']['windows-x86_64']
assert c['platforms']['darwin-aarch64']['url'].endswith('/v0.5.0/FBForge.Connect_0.5.0_aarch64.app.tar.gz')
def rejects(action):
    try: action()
    except ValueError: return
    raise AssertionError('invalid metadata accepted')
for name in ['other.app.tar.gz', 'FBForge.Connect_0.4.0_aarch64.app.tar.gz', 'FBForge.Connect_0.5.0_x64.app.tar.gz']:
    rejects(lambda: u.macos_metadata(name, v, sig))
rejects(lambda: u.combined_metadata(w, u.macos_metadata('FBForge.Connect_0.6.0_aarch64.app.tar.gz', '0.6.0', sig)))
m['platforms']['darwin-aarch64']['url'] = 'https://example.invalid/replacement'
rejects(lambda: u.combined_metadata(w, m))
print('passed')
`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.trim(), 'passed');
});
