import test from 'node:test';
import assert from 'node:assert/strict';
import pack from '../frontend/src/examples/integration.fctest.json' with { type: 'json' };
import { flowFromPack } from '../frontend/src/integration/test-flows.js';
import {
  saveTestFlow,
  readTestFlow,
  listTestFlows,
  deleteTestFlow,
} from '../frontend/src/integration/test-flow-library.js';

test('flow collection saves exact validated definitions and reloads without session or run state', async () => {
  const entries = new Map(),
    flow = flowFromPack(pack),
    calls = [];
  const invoke = async (command, { request }) => {
    calls.push([command, structuredClone(request)]);
    const { action, id } = request;
    const summary = (id, flow) => ({
      id,
      name: flow.name,
      stepCount: flow.steps.length,
      caseCount: flow.pack.cases.length,
    });
    if (action === 'flow_save') {
      entries.set(id, request.flow);
      return summary(id, request.flow);
    }
    if (action === 'flow_list') return Array.from(entries, ([id, value]) => summary(id, value));
    if (action === 'flow_read') return entries.get(id);
    if (action === 'flow_delete') {
      entries.delete(id);
      return null;
    }
    throw new Error('unexpected_command');
  };
  const saved = await saveTestFlow(invoke, flow);
  assert.equal(calls[0][0], 'test_library');
  assert.deepEqual(Object.keys(calls[0][1]).sort(), ['action', 'flow', 'id']);
  assert.deepEqual(await listTestFlows(invoke), [saved]);
  assert.deepEqual(await readTestFlow(invoke, saved.id), flow);
  await deleteTestFlow(invoke, saved.id);
  assert.deepEqual(await listTestFlows(invoke), []);
  assert.equal(flow.pack.cases.length, pack.cases.length);
});

test('invalid definitions, paths, foreign summaries and false delete acknowledgements are rejected', async () => {
  let calls = 0;
  const invoke = async () => {
    calls++;
    return null;
  };
  await assert.rejects(readTestFlow(invoke, '../outside'));
  await assert.rejects(deleteTestFlow(invoke, '../outside'));
  await assert.rejects(saveTestFlow(invoke, { ...flowFromPack(pack), sessionId: 'secret' }));
  assert.equal(calls, 0);
  await assert.rejects(
    saveTestFlow(
      async () => ({ id: crypto.randomUUID(), name: pack.name, stepCount: 1, caseCount: 1 }),
      flowFromPack(pack),
    ),
    /engine_protocol_error/,
  );
  await assert.rejects(
    listTestFlows(async () => [{ id: '../path' }]),
    /engine_protocol_error/,
  );
  await assert.rejects(
    deleteTestFlow(async () => true, crypto.randomUUID()),
    /engine_protocol_error/,
  );
  await assert.rejects(
    readTestFlow(async () => ({ ...flowFromPack(pack), run: { results: [] } }), crypto.randomUUID()),
  );
});
