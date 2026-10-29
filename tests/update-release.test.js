import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('release metadata keeps the exact installer identity and rejects incomplete or changed updater packages', () => {
  const output = execFileSync(
    'python3',
    [
      '-c',
      `
import hashlib, importlib.util, io, json, pathlib, sys, zipfile
sys.dont_write_bytecode = True
sys.path.insert(0, 'scripts')
import candidate
spec=importlib.util.spec_from_file_location('updates','scripts/update-release.py')
updates=importlib.util.module_from_spec(spec); spec.loader.exec_module(updates)
fixture=json.loads(pathlib.Path('tests/fixtures/update-signature.json').read_text())
version='0.4.0'; installer=f'FBForge Connect_{version}_x64-setup.exe'
content=fixture['data'].encode(); checksum=hashlib.sha256(content).hexdigest()
commit='a'*40; thumb='b'*40
manifest=dict(repository=candidate.REPOSITORY,version=version,commit=commit,platform='windows-x64',
    installer=installer,sha256=checksum,signing='authenticode',runId='123',validationRunId='100',
    certificateThumbprint=thumb,bytes=len(content),updatePublicKeySha256='c'*64)
signatures=[dict(file=name,sha256=checksum,certificateThumbprint=thumb,
    timestampCertificateThumbprint='d'*40,verified=True) for name in [installer,'fbforge-connect.exe','uninstall.exe']]
metadata=updates.metadata(installer,version,fixture['signature'],'Fiktive Versionshinweise')
files={installer:content,'build-info.json':json.dumps(manifest).encode(),
    'signature-info.json':json.dumps(signatures).encode(),
    'SHA256SUMS.txt':(checksum+'  '+installer).encode(),
    installer+'.sig':fixture['signature'].encode(),'latest.json':json.dumps(metadata).encode()}
def archive(parts):
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w') as output:
        for name,data in parts.items(): output.writestr(name,data)
    return buffer.getvalue()
def read(parts): return candidate.read_candidate(archive(parts),commit,checksum,version,'123')
assert read(files)[1] == manifest
assert metadata['platforms']['windows-x86_64']['url'].endswith('/v0.4.0/FBForge.Connect_0.4.0_x64-setup.exe')
def rejected(parts):
    try: read(parts)
    except (RuntimeError,ValueError): return
    raise AssertionError('invalid update package accepted')
rejected({key:value for key,value in files.items() if key != 'latest.json'})
rejected(dict(files,**{installer+'.sig':b'changed'}))
for field,value in [('version','0.5.0'),('platforms',{}),('notes','x'*12001)]:
    changed=dict(metadata,**{field:value})
    rejected(dict(files,**{'latest.json':json.dumps(changed).encode()}))
for value in ['0.4.0-beta.1','0.4','latest','01.4.0']:
    try: updates.metadata(installer,value,fixture['signature'])
    except ValueError: pass
    else: raise AssertionError('invalid release version accepted')
print('updater release verification passed')
`,
    ],
    { encoding: 'utf8' },
  );
  assert.match(output, /updater release verification passed/);
});
