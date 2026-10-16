import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listDestinations,
  loadDestination,
  loadedKeys,
  importKey,
  discardKeys,
} from '../frontend/src/resources.js';

const id = '00000000-0000-4000-8000-000000000001';
const destination = '00000000-0000-4000-8000-000000000002';
const session = {
  sessionId: id,
  apiVersion: 'v2',
  role: 'online-service',
  environment: 'TEST',
  connected: true,
};
const envelope = (data, patch = {}) => ({
  apiVersion: session.apiVersion,
  sessionId: id,
  environment: 'TEST',
  data,
  ...patch,
});
const state = { keys: [{ destinationId: destination, kid: 'registered-test-key', purpose: 'decrypt' }] };
const details = {
  destinationId: destination,
  detailsJson: '{"destinationId":"' + destination + '"}',
  keys: [
    {
      kid: 'registered-test-key',
      purpose: 'decrypt',
      eligible: true,
      reason: null,
      certificateSha256: 'a'.repeat(64),
      expiresAt: '2030-01-01T00:00:00Z',
    },
  ],
};

test('both APIs preserve session identity and native destination pagination contracts', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const result = await listDestinations(
      async (command, args) => {
        assert.equal(command, 'list_destinations');
        assert.deepEqual(args, { apiVersion, sessionId: id, offset: 20 });
        return envelope(
          {
            destinations: [{ destinationId: destination, name: 'Testamt', status: 'active', type: 'A' }],
            offset: 20,
            totalCount: 21,
          },
          { apiVersion },
        );
      },
      active,
      20,
    );
    assert.equal(result.destinations[0].name, 'Testamt');
  }
});

test('PROD, different sessions, different APIs and extra private fields fail closed', async () => {
  for (const patch of [
    { environment: 'PROD' },
    { apiVersion: 'v3' },
    { sessionId: destination },
    { accessToken: 'synthetic' },
  ]) {
    await assert.rejects(
      loadedKeys(async () => envelope(state, patch), session),
      /engine_protocol_error/,
    );
  }
});

test('invalid API, session, UUID, purpose, page and oversized UTF-8 input never reach native code', async () => {
  let called = 0;
  const invoke = async () => {
    called++;
  };
  await assert.rejects(loadedKeys(invoke, { ...session, apiVersion: 'prod' }), /session_missing/);
  await assert.rejects(loadedKeys(invoke, { ...session, sessionId: {} }), /session_missing/);
  await assert.rejects(loadDestination(invoke, session, '../prod'), /invalid_input/);
  for (const offset of [-1, 1, 10020, 2 ** 32, NaN])
    await assert.rejects(listDestinations(invoke, session, offset), /invalid_input/);
  await assert.rejects(importKey(invoke, session, destination, 'verify', '{}'), /invalid_input/);
  await assert.rejects(importKey(invoke, session, destination, 'sign', 'ä'.repeat(16385)), /invalid_input/);
  assert.equal(called, 0);
});

test('destination context is bound to the requested identity and public JSON is pretty printed safely', async () => {
  const result = await loadDestination(
    async (command, args) => {
      assert.equal(command, 'load_destination');
      assert.equal(args.destinationId, destination);
      return envelope(details);
    },
    session,
    destination,
  );
  assert.match(result.detailsJson, /\n {2}"destinationId"/);
  for (const data of [
    { ...details, destinationId: id },
    { ...details, detailsJson: 'not json' },
    { ...details, detailsJson: JSON.stringify({ destinationId: destination, clientSecret: 'synthetic' }) },
    {
      ...details,
      detailsJson: JSON.stringify({ destinationId: destination, nested: { secret: 'synthetic' } }),
    },
    {
      ...details,
      detailsJson: JSON.stringify({ destinationId: destination, key: { kty: 'RSA', d: 'synthetic' } }),
    },
    { ...details, detailsJson: JSON.stringify({ destinationId: id }) },
    { ...details, keys: [{ ...details.keys[0], privateKey: 'synthetic' }] },
    { ...details, keys: [{ ...details.keys[0], expiresAt: 'invalid-date' }] },
  ])
    await assert.rejects(
      loadDestination(async () => envelope(data), session, destination),
      /engine_protocol_error/,
    );
});

test('malformed lists and impossible counts cannot become a successful page', async () => {
  for (const data of [
    { destinations: [], offset: 20, totalCount: 0 },
    { destinations: [{}], offset: 0, totalCount: 1 },
    { destinations: [], offset: 0, totalCount: -1 },
    { destinations: [], offset: 0, totalCount: 1000001 },
    {
      destinations: new Array(21).fill({ destinationId: destination, name: '', status: '', type: '' }),
      offset: 0,
      totalCount: 21,
    },
  ])
    await assert.rejects(
      listDestinations(async () => envelope(data), session),
      /engine_protocol_error/,
    );
});

test('uppercase destination UUID input is normalized before load and private import', async () => {
  const lower = 'abcdef00-0000-4000-8000-000000000001';
  const upper = lower.toUpperCase();
  const result = await loadDestination(
    async (command, args) => {
      assert.equal(args.destinationId, lower);
      return envelope({
        ...details,
        destinationId: lower,
        detailsJson: JSON.stringify({ destinationId: lower }),
      });
    },
    session,
    upper,
  );
  assert.equal(result.destinationId, lower);
  await importKey(
    async (command, args) => {
      assert.equal(args.destinationId, lower);
      return envelope({ keys: [{ ...state.keys[0], destinationId: lower }] });
    },
    session,
    upper,
    'decrypt',
    'synthetic-key-document',
  );
});

test('certificate eligibility has coherent metadata and duplicate registration IDs fail closed', async () => {
  const eligible = details.keys[0];
  const rejected = {
    ...eligible,
    eligible: false,
    reason: 'test_certificate_required',
    certificateSha256: null,
    expiresAt: null,
  };
  const result = await loadDestination(
    async () => envelope({ ...details, keys: [rejected] }),
    session,
    destination,
  );
  assert.equal(result.keys[0].eligible, false);
  for (const keys of [
    [{ ...eligible, reason: 'test_certificate_required' }],
    [{ ...eligible, certificateSha256: null }],
    [{ ...eligible, certificateSha256: 'x'.repeat(64) }],
    [{ ...eligible, expiresAt: null }],
    [{ ...rejected, reason: null }],
    [{ ...rejected, certificateSha256: eligible.certificateSha256 }],
    [{ ...rejected, expiresAt: eligible.expiresAt }],
    [eligible, eligible],
    new Array(129).fill(eligible),
  ])
    await assert.rejects(
      loadDestination(async () => envelope({ ...details, keys }), session, destination),
      /engine_protocol_error/,
    );
});

test('private import returns only validated native key references and discard must return empty state', async () => {
  const result = await importKey(
    async (command, args) => {
      assert.equal(command, 'import_key');
      assert.equal(args.keyDocument, 'synthetic-key-document');
      assert.equal(args.purpose, 'decrypt');
      return envelope(state);
    },
    session,
    destination,
    'decrypt',
    'synthetic-key-document',
  );
  assert.deepEqual(result, state);
  await assert.rejects(
    importKey(async () => envelope({ keys: [] }), session, destination, 'decrypt', 'synthetic'),
    /engine_protocol_error/,
  );
  await assert.rejects(
    loadedKeys(async () => envelope({ keys: [{ ...state.keys[0], d: 'synthetic' }] }), session),
    /engine_protocol_error/,
  );
  await assert.rejects(
    discardKeys(async () => envelope(state), session),
    /engine_protocol_error/,
  );
  assert.deepEqual(
    await discardKeys(async (command) => {
      assert.equal(command, 'discard_keys');
      return envelope({ keys: [] });
    }, session),
    { keys: [] },
  );
});
