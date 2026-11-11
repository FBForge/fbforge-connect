import test from 'node:test';
import assert from 'node:assert/strict';
import original from '../frontend/src/examples/integration.fctest.json' with { type: 'json' };
import {
  listTests,
  readTest,
  removeTest,
  convertedTestId,
} from '../frontend/src/integration/scenarios/collection.ts';
import { saveScenario } from '../frontend/src/integration/scenarios/storage.ts';
function fixture() {
  const sourceId = crypto.randomUUID(),
    packs = new Map([[sourceId, structuredClone(original)]]),
    scenarios = new Map();
  const invoke = async (command, { request: r }) => {
    assert.equal(command, 'test_library');
    switch (r.action) {
      case 'list':
        return [...packs].map(([id, p]) => ({
          id,
          name: p.name,
          cases: p.cases.map(({ id, name }) => ({ id, name })),
        }));
      case 'read':
        return structuredClone(packs.get(r.id));
      case 'delete':
        packs.delete(r.id);
        return null;
      case 'flow_list':
        return [];
      case 'scenario_list':
        return [...scenarios.values()].map((s) => ({
          id: s.id,
          name: s.name,
          mode: s.mode,
          caseCount: s.pack.cases.length,
        }));
      case 'scenario_read':
        return structuredClone(scenarios.get(r.id));
      case 'scenario_save':
        scenarios.set(r.document.id, structuredClone(r.document));
        return {
          id: r.document.id,
          name: r.document.name,
          mode: r.document.mode,
          caseCount: r.document.pack.cases.length,
        };
      case 'scenario_delete':
        scenarios.delete(r.id);
        return null;
      default:
        throw Error(r.action);
    }
  };
  return { sourceId, packs, scenarios, invoke };
}
test('reopening and starting an older test keeps a stable identity and preserves original data', async () => {
  const f = fixture(),
    entry = (await listTests(f.invoke))[0];
  const first = await readTest(f.invoke, entry),
    second = await readTest(f.invoke, entry);
  assert.equal(first.id, second.id);
  assert.equal(first.id, await convertedTestId('pack', f.sourceId));
  first.name = 'Edited name';
  await saveScenario(f.invoke, first);
  assert.equal((await readTest(f.invoke, entry)).name, 'Edited name');
  assert.equal((await listTests(f.invoke)).length, 1);
  assert.deepEqual(f.packs.get(f.sourceId), original);
});
test('independent tests with the same display name stay separate', async () => {
  const f = fixture();
  f.packs.set(crypto.randomUUID(), structuredClone(original));
  const entries = await listTests(f.invoke);
  assert.equal(entries.length, 2);
  assert.notEqual((await readTest(f.invoke, entries[0])).id, (await readTest(f.invoke, entries[1])).id);
});
test('explicitly deleting a converted test also removes its source so it cannot reappear', async () => {
  const f = fixture(),
    entry = (await listTests(f.invoke))[0],
    definition = await readTest(f.invoke, entry);
  await saveScenario(f.invoke, definition);
  await removeTest(f.invoke, (await listTests(f.invoke))[0]);
  assert.equal(f.packs.size, 0);
  assert.equal(f.scenarios.size, 0);
  assert.deepEqual(await listTests(f.invoke), []);
});
