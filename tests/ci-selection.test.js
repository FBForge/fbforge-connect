import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const python = process.platform === 'win32' ? 'python' : 'python3';
const root = fileURLToPath(new URL('../', import.meta.url));
const load = `
import importlib.util, json, os, pathlib, subprocess, sys, tempfile, types
sys.dont_write_bytecode = True
def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value
m=module('selection','scripts/ci/changed-components.py')
r=module('release_check','scripts/ci/release-check.py')
repo='FBForge/fbforge-connect'
`;
function check(program) {
  return execFileSync(python, ['-c', load + program], { cwd: root, encoding: 'utf8' });
}

test('documentation stays light, code checks run automatically and full markers are optional', () => {
  assert.match(
    check(`
empty=dict(frontend=False,engine=False,native=False)
for path in ['README.md','SECURITY.md','THIRD_PARTY_NOTICES.md','LICENSE','docs/guide/topics.js','docs/guide/images/send.png']:
    assert m.components([path]) == empty, path
    p=m.plan({},'push','refs/heads/fix/example',[path],repo)
    assert not any(p[n] for n in m.NAMES)
for ref in ['refs/heads/main','refs/heads/fix/example','refs/heads/release/0.3.0']:
    p=m.plan({},'push',ref,['frontend/src/App.vue'],repo)
    assert p['frontend'] and not p['engine'] and not p['native']
    assert p['mode']=='affected'
for event in [{}, {'head_commit':{'message':'docs: wording'}}]:
    p=m.plan(event,'push','refs/heads/main',['README.md'],repo)
    assert not any(p[n] for n in m.NAMES)
p=m.plan({'head_commit':{'message':'fix: behavior [ci]'}},'push','refs/heads/main',['frontend/src/App.vue'],repo)
assert p['frontend'] and not p['engine'] and not p['native']
for marker in ['[CI FULL]','[release-check]']:
    p=m.plan({'head_commit':{'message':marker}},'push','refs/heads/main',['README.md'],repo)
    assert all(p[n] for n in m.NAMES)
assert m.plan({'inputs':{'full':True}},'workflow_dispatch','refs/heads/main',[],repo)['frontend']
assert not m.plan({'inputs':{'full':False}},'workflow_dispatch','refs/heads/main',['README.md'],repo)['frontend']
assert m.plan({},'push','refs/heads/fix/example',['docs/guide/topics.js'],repo)['documentation']
for event_name,ref,target in [('pull_request','refs/pull/1/merge',repo),('push','refs/heads/fix/example','someone/fork'),('push','refs/heads/feature/test',repo)]:
    p=m.plan({'head_commit':{'message':'[release-check]'},'pull_request':{'title':'[release-check]'}},event_name,ref,[],target)
    assert not p['release']
assert m.plan({'head_commit':{'message':'[release-check]'}},'push','refs/heads/release/0.3.0',[],repo)['release']
print('CI policy passed')
`),
    /CI policy passed/,
  );
});

test('new branches include all feature changes and amended documentation uses the old commit object', () => {
  assert.match(
    check(`
with tempfile.TemporaryDirectory() as directory:
    root=pathlib.Path(directory)
    def git(*args):
        return subprocess.check_output(['git',*args],cwd=root,stderr=subprocess.DEVNULL,text=True).strip()
    git('init','-b','main'); git('config','user.name','CI Fixture'); git('config','user.email','ci@example.invalid')
    (root/'README.md').write_text('base'); git('add','.'); git('-c','commit.gpgsign=false','commit','-m','base')
    base=git('rev-parse','HEAD'); git('update-ref','refs/remotes/origin/main',base)
    git('switch','-c','feature/example')
    (root/'README.md').write_text('docs'); git('add','.'); git('-c','commit.gpgsign=false','commit','-m','docs')
    old=os.getcwd(); os.chdir(root)
    try:
        assert m.changed_paths({'before':'0'*40}) == ['README.md']
        (root/'frontend').mkdir(); (root/'frontend/code.js').write_text('synthetic')
        git('add','.'); git('-c','commit.gpgsign=false','commit','-m','code')
        (root/'README.md').write_text('last docs'); git('add','.'); git('-c','commit.gpgsign=false','commit','-m','docs')
        assert m.changed_paths({'before':'0'*40}) == ['README.md','frontend/code.js']
        assert m.components(m.changed_paths({'before':'0'*40}))['frontend']
        assert m.changed_paths({'before':base}) == ['README.md','frontend/code.js']
        assert m.changed_paths({'before':'f'*40}) is None
        try: m.changed_paths({'before':'main; echo injected'})
        except RuntimeError: pass
        else: raise AssertionError('invalid SHA accepted')
    finally: os.chdir(old)
# Fetching an amended predecessor is bounded to a validated full SHA, never shell text.
original_run, original_exists, original_output = m.subprocess.run, m.exists, m.subprocess.check_output
calls=[]; previous='a'*40
try:
    m.exists=lambda value: len(calls)>0
    m.subprocess.run=lambda args,**kwargs: calls.append(args)
    m.subprocess.check_output=lambda args: b'README.md\\0SECURITY.md\\0'
    assert m.changed_paths({'before':previous}) == ['README.md','SECURITY.md']
    assert calls == [['git','fetch','--no-tags','--depth=1','origin',previous]]
finally:
    m.subprocess.run, m.exists, m.subprocess.check_output=original_run, original_exists, original_output
print('CI comparison passed')
`),
    /CI comparison passed/,
  );
});

test('release keyword dispatches only Windows validation and rejects moved or untrusted sources', () => {
  assert.match(
    check(`
commit='a'*40
env=dict(GITHUB_REPOSITORY=repo,GITHUB_EVENT_NAME='push',GITHUB_REF='refs/heads/main',GITHUB_SHA=commit)
calls=[]
def run(args,**kwargs):
    calls.append((args,kwargs)); return types.SimpleNamespace(returncode=0)
r.dispatch(env,run)
args,kwargs=calls[0]
assert args[4]=='repos/FBForge/fbforge-connect/actions/workflows/windows.yml/dispatches'
assert json.loads(kwargs['input'])=={'ref':'main','inputs':{'expected_commit':commit}}
assert 'sign-windows' not in str(args) and 'attach-candidate' not in str(args)
manual=dict(env,GITHUB_EVENT_NAME='workflow_dispatch',RELEASE_EXPECTED_COMMIT=commit)
r.verify(manual); r.verify(dict(manual,RELEASE_EXPECTED_COMMIT=''))
for changes in [dict(GITHUB_REPOSITORY='someone/fork'),dict(GITHUB_REF='refs/pull/1/merge'),dict(GITHUB_REF='refs/heads/feature/test'),dict(GITHUB_SHA='main')]:
    try: r.dispatch(dict(env,**changes),run)
    except RuntimeError: pass
    else: raise AssertionError('untrusted dispatch accepted')
for changes in [dict(RELEASE_EXPECTED_COMMIT='b'*40),dict(RELEASE_EXPECTED_COMMIT='bad'),dict(GITHUB_EVENT_NAME='push')]:
    try: r.verify(dict(manual,**changes))
    except RuntimeError: pass
    else: raise AssertionError('moved commit accepted')
assert len(calls)==1
print('release dispatch guard passed')
`),
    /release dispatch guard passed/,
  );
});
