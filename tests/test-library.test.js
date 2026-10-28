import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  listTestLibrary,
  readTestLibrary,
  saveTestLibrary,
  deleteTestLibrary,
} from '../frontend/src/test-library.js';
const pack = JSON.parse(
  await readFile(new URL('../frontend/src/examples/integration.fctest.json', import.meta.url)),
);
test('saved test packs roundtrip without session, credentials or destination context', async () => {
  const entries = new Map(),
    calls = [];
  const invoke = async (command, { request }) => {
    calls.push({ command, request });
    assert.equal(command, 'test_library');
    if (request.action === 'save') {
      entries.set(request.id, structuredClone(request.pack));
      return {
        id: request.id,
        name: request.pack.name,
        cases: request.pack.cases.map(({ id, name }) => ({ id, name })),
      };
    }
    if (request.action === 'read') return entries.get(request.id);
    if (request.action === 'list')
      return [...entries].map(([id, value]) => ({
        id,
        name: value.name,
        cases: value.cases.map(({ id, name }) => ({ id, name })),
      }));
    if (request.action === 'delete') {
      entries.delete(request.id);
      return null;
    }
  };
  const entry = await saveTestLibrary(invoke, pack);
  assert.deepEqual(await listTestLibrary(invoke), [entry]);
  assert.deepEqual(await readTestLibrary(invoke, entry.id), pack);
  await deleteTestLibrary(invoke, entry.id);
  assert.deepEqual(await listTestLibrary(invoke), []);
  assert.equal(
    calls.some(({ request }) => 'sessionId' in request || 'clientSecret' in request),
    false,
  );
});
test('library response identities, duplicates and malformed stored packs fail closed', async () => {
  const entry = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Fiktiv',
    cases: [{ id: 'test', name: 'Fiktiv' }],
  };
  await assert.rejects(
    listTestLibrary(async () => [entry, entry]),
    /engine_protocol_error/,
  );
  await assert.rejects(
    readTestLibrary(async () => ({ ...pack, clientSecret: 'never-store' }), entry.id),
    /test_pack_invalid/,
  );
  await assert.rejects(
    saveTestLibrary(async () => entry, pack),
    /engine_protocol_error/,
  );
  await assert.rejects(
    readTestLibrary(async () => pack, '../elsewhere'),
    /test_pack_invalid/,
  );
  await assert.rejects(
    deleteTestLibrary(async () => ({ status: 'ok' }), entry.id),
    /engine_protocol_error/,
  );
});
