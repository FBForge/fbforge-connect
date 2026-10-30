import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';

test('scanner release distribution binds engine, source, licenses and six database files to the reviewed manifest', () => {
  const output = execFileSync(
    'python3',
    [
      '-c',
      `
import importlib.util, io, json, hashlib, zipfile, sys
sys.path.insert(0, 'scripts')
spec = importlib.util.spec_from_file_location('scanner', 'scripts/scanner-candidate.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
def sha(b): return hashlib.sha256(b).hexdigest()
def zip_bytes(parts):
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w') as z:
        for name, value in parts.items(): z.writestr(name, value)
    return b.getvalue()
manifest = dict(version='1.5.4', source=dict(bytes=6,sha256=sha(b'source')), files=[
    dict(path='clamd.exe',bytes=5,sha256=sha(b'clean')),
    dict(path='COPYING.txt',bytes=7,sha256=sha(b'license'))])
package = {'engine/clamd.exe': b'clean', 'engine/COPYING.txt': b'license'}
for stem in ['main','daily','bytecode']:
    package['database/'+stem+'.cvd'] = b'ClamAV-VDB:time:42:0:0:hash:signature:builder:1:'.ljust(512,b' ')
    package['database/'+stem+'-42.cvd.sign'] = b'signature'
name = 'FBForge-Connect-ClamAV-1.5.4-windows-x64.zip'
parts = {name:zip_bytes(package), 'clamav-1.5.4.tar.gz':b'source', 'clamav-1.5.4.tar.gz.sig':b'signature',
         'component-manifest.json':json.dumps(manifest).encode(), 'talos-public-key.asc':b'key',
         'third-party-licenses/COPYING.txt':b'license','SOURCE-NOTICE.txt':b'notice'}
assert m.read_distribution(zip_bytes(parts),manifest,b'key') == name
def rejected(changed):
    try: m.read_distribution(zip_bytes(changed),manifest,b'key')
    except (RuntimeError,KeyError): return
    raise AssertionError('invalid distribution accepted')
for file in parts: rejected({k:v for k,v in parts.items() if k != file})
for file in ['clamav-1.5.4.tar.gz','component-manifest.json','talos-public-key.asc','third-party-licenses/COPYING.txt']:
    rejected(dict(parts,**{file:b'{}'}))
for file in package:
    bad = dict(package); del bad[file]
    rejected(dict(parts,**{name:zip_bytes(bad)}))
rejected(dict(parts,**{name:zip_bytes(dict(package, **{'engine/clamd.exe':b'wrong'}))}))
rejected(dict(parts,**{'../escape':b'wrong'}))
u = importlib.util.spec_from_file_location('upstream', 'scripts/scanner/check-upstream.py')
upstream = importlib.util.module_from_spec(u); u.loader.exec_module(upstream)
upstream.check('1.5.4',dict(tag_name='clamav-1.5.4',draft=False,prerelease=False))
for release in [dict(tag_name='clamav-1.5.5'),dict(tag_name='clamav-1.5.4',prerelease=True),dict(tag_name='unexpected')]:
    try: upstream.check('1.5.4',release)
    except RuntimeError: pass
    else: raise AssertionError('new or invalid upstream ignored')
print('scanner release checks passed')
`,
    ],
    { encoding: 'utf8' },
  );
  assert.match(output, /scanner release checks passed/);
});
