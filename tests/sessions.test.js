import test from 'node:test';
import assert from 'node:assert/strict';
import { openSession, openSessionForApi, updateSession, resetsSessions } from '../frontend/src/sessions.js';

const id = '00000000-0000-4000-8000-000000000001';
const snapshot = {
  sessionId: id,
  apiVersion: 'v2',
  role: 'online-service',
  environment: 'TEST',
  connected: true,
};

test('opening a session returns public state and keeps API and role explicit', async () => {
  const calls = [];
  const result = await openSession(
    async (command, args) => {
      calls.push([command, args]);
      return snapshot;
    },
    'v2',
    'online-service',
    'synthetic-client',
    'synthetic-secret',
  );
  assert.equal(result.sessionId, id);
  assert.equal(calls[0][0], 'open_session');
  assert.equal(calls[0][1].apiVersion, 'v2');
  assert.equal(calls[0][1].role, 'online-service');
  assert.equal(result.clientSecret, undefined);
  assert.equal(result.clientId, 'synthetic-client');
  const checked = await updateSession(async () => snapshot, result, true);
  assert.equal(checked.clientId, 'synthetic-client');
});

test('unsupported role or API and empty credentials never reach native code', async () => {
  let calls = 0;
  for (const args of [
    ['prod', 'online-service', 'c', 's'],
    ['v2', 'admin', 'c', 's'],
    ['v2', 'online-service', '', 's'],
    ['v2', 'online-service', 'c', ''],
  ]) {
    await assert.rejects(
      openSession(
        async () => {
          calls++;
        },
        ...args,
      ),
    );
  }
  assert.equal(calls, 0);
});

test('PROD, version/role mismatch or disconnected replies cannot authenticate', async () => {
  for (const patch of [
    { environment: 'PROD' },
    { apiVersion: 'v3' },
    { role: 'administrative-system' },
    { connected: false },
  ]) {
    await assert.rejects(
      openSession(async () => ({ ...snapshot, ...patch }), 'v2', 'online-service', 'c', 's'),
    );
  }
});

test('checking and closing require the same native session identity', async () => {
  await assert.rejects(
    updateSession(
      async () => ({ ...snapshot, sessionId: '00000000-0000-4000-8000-000000000002' }),
      snapshot,
      true,
    ),
  );
  const result = await updateSession(
    async (command, args) => {
      assert.equal(command, 'close_session');
      assert.deepEqual(args, { apiVersion: 'v2', sessionId: id });
      return { ...snapshot, connected: false };
    },
    snapshot,
    false,
  );
  assert.equal(result.connected, false);
});

test('transport failures invalidate every cached native session, rejected credentials do not', () => {
  assert.equal(resetsSessions('engine_timeout'), true);
  assert.equal(resetsSessions(new Error('engine_protocol_error')), true);
  assert.equal(resetsSessions('authentication_failed'), false);
});

test('API switching sends only the source identity and validates the new public session', async () => {
  const source = { ...snapshot, clientId: 'synthetic-client' };
  const target = { ...snapshot, apiVersion: 'v3', sessionId: '00000000-0000-4000-8000-000000000002' };
  const result = await openSessionForApi(
    async (command, args) => {
      assert.equal(command, 'open_session_for_api');
      assert.deepEqual(args, { apiVersion: 'v2', sessionId: id, targetApiVersion: 'v3' });
      return { ...target, clientSecret: 'never-retain' };
    },
    source,
    'v3',
  );
  assert.deepEqual(result, { ...target, clientId: source.clientId });
  for (const patch of [
    { apiVersion: 'v2' },
    { environment: 'PROD' },
    { role: 'administrative-system' },
    { connected: false },
    { sessionId: source.sessionId },
  ])
    await assert.rejects(openSessionForApi(async () => ({ ...target, ...patch }), source, 'v3'));
  for (const api of ['v2', 'v4'])
    await assert.rejects(
      openSessionForApi(async () => assert.fail('invalid switch reached native'), source, api),
    );
});
