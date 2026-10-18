import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('NVDA observer retains the expanded keyboard journey and explicitly signals its bounded limit', () => {
  const source = fileURLToPath(new URL('../scripts/ci/nvda-capture.py', import.meta.url));
  const program = `
import importlib.util, json, sys, tempfile, types
from pathlib import Path
sys.dont_write_bytecode=True
for name in ['api','buildVersion','inputCore','globalPluginHandler','speech','speech.extensions']:
    sys.modules[name]=types.ModuleType(name)
sys.modules['globalPluginHandler'].GlobalPlugin=object
sys.modules['speech.extensions'].pre_speech=object()
spec=importlib.util.spec_from_file_location('observer',sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    observer=module.GlobalPlugin.__new__(module.GlobalPlugin); observer.path=Path(directory)/'capture.jsonl'; observer.count=0
    # This validates recorder capacity only; the Windows job separately observes real NVDA speech.
    labels=['control-'+str(index) for index in range(13)]
    for label in labels:
        for step in range(60):
            observer.write({'key':9,'pressed':True}); observer.write({'key':9,'pressed':False}); observer.write({'text':'fictional focus','focus':'other'})
        observer.write({'text':label,'focus':label})
    records=[json.loads(line) for line in observer.path.read_text().splitlines()]
    assert all(any(record.get('focus')==label for record in records) for label in labels), 'expanded journey was truncated'
    for index in range(module.MAX_RECORDS+1): observer.write({'text':'bounded'})
    records=[json.loads(line) for line in observer.path.read_text().splitlines()]
    assert len(records)==module.MAX_RECORDS
    assert records[-1]=={'captureLimitReached':True}
print('bounded expanded NVDA capture passed')
`;
  const result = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', program, source], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.match(result, /bounded expanded NVDA capture passed/);
});
