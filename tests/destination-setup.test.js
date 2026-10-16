import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTestKeys,
  listGeneratedKeys,
  prepareDestinationCreation,
  executeDestinationCreation,
  cancelDestinationCreation,
  reconcileDestinationCreation,
} from '../frontend/src/destination-setup.js';
const id = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const session = { apiVersion: 'v3', sessionId: id(1), environment: 'TEST', connected: true };
const envelope = (data) => ({
  apiVersion: session.apiVersion,
  sessionId: session.sessionId,
  environment: 'TEST',
  data,
});
const key = (purpose, n) => ({
  kid: id(n),
  purpose,
  fingerprint: 'a'.repeat(64),
  expiresAt: '2027-10-16T00:00:00Z',
});
const keys = {
  bundleId: id(2),
  destinationId: null,
  status: 'ready',
  encryption: key('decrypt', 3),
  signing: key('sign', 4),
};
const publicKey = (purpose, n) => ({
  kty: 'RSA',
  key_ops: [purpose === 'decrypt' ? 'wrapKey' : 'verify'],
  alg: purpose === 'decrypt' ? 'RSA-OAEP-256' : 'PS512',
  kid: id(n),
  n: 'A'.repeat(683),
  e: 'AQAB',
  x5c: ['AQID'],
});
const configuration = {
  name: 'Bauamt TEST',
  type: 'A',
  contactInformation: {
    legalName: 'Teststadt',
    email: 'test@example.invalid',
    address: 'Musterstrasse 1, 12345 Musterstadt',
    phone: '+49 30 000000',
  },
  metadataVersions: ['2.0.0', '3.0.0'],
  publicServices: [
    {
      identifier: 'urn:de:fim:leika:leistung:99008001014002',
      regions: ['DE'],
      submissionSchemas: [{ schemaUri: 'urn:test:data', mimeType: 'application/json' }],
    },
  ],
  processMessages: [],
};
const actual = {
  ...configuration,
  status: 'created',
  encryptionKid: id(3),
  encryptionPublicKey: publicKey('decrypt', 3),
  signingPublicKey: publicKey('sign', 4),
  publicForRouting: false,
};
const attempt = {
  attemptId: id(5),
  status: 'prepared',
  bundleId: keys.bundleId,
  configurationJson: JSON.stringify(actual),
  destinationId: null,
  error: null,
  httpStatus: null,
};

test('local TEST key generation accepts metadata only and rejects private documents or mixed purposes', async () => {
  assert.equal(
    (
      await generateTestKeys(async (command) => {
        assert.equal(command, 'generate_test_keys');
        return envelope(keys);
      }, session)
    ).bundleId,
    keys.bundleId,
  );
  for (const bad of [
    { ...keys, privateJwk: 'synthetic-marker' },
    { ...keys, encryption: keys.signing },
  ])
    await assert.rejects(
      generateTestKeys(async () => envelope(bad), session),
      /engine_protocol_error/,
    );
  assert.equal((await listGeneratedKeys(async () => envelope({ bundles: [keys] }), session)).length, 1);
  await assert.rejects(
    listGeneratedKeys(async () => envelope({ bundles: [keys, keys] }), session),
    /engine_protocol_error/,
  );
});
test('creation preview binds selected public key IDs and all configuration choices without a renderer-provided JWK', async () => {
  const value = await prepareDestinationCreation(
    async (command, args) => {
      assert.equal(command, 'prepare_destination_creation');
      assert.deepEqual(JSON.parse(args.destinationDocument), { bundleId: keys.bundleId, configuration });
      return envelope(attempt);
    },
    session,
    keys,
    configuration,
  );
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.configuration.publicServices));
  assert.equal(value.configuration.status, 'created');
  const changed = {
    ...actual,
    metadataVersions: ['3.0.0', '2.0.0'],
    contactInformation: { ...configuration.contactInformation, unit: null },
  };
  assert.equal(
    (
      await prepareDestinationCreation(
        async () => envelope({ ...attempt, configurationJson: JSON.stringify(changed) }),
        session,
        keys,
        configuration,
      )
    ).attempt.status,
    'prepared',
  );
});
test('changed preview is cancelled and unexpected public-key fields never reach confirmation', async () => {
  for (const patch of [{ name: 'Other destination' }, { encryptionKid: id(9) }]) {
    const calls = [];
    await assert.rejects(
      prepareDestinationCreation(
        async (command) => {
          calls.push(command);
          return envelope({
            ...attempt,
            status: command === 'cancel_destination_creation' ? 'cancelled' : 'prepared',
            configurationJson: JSON.stringify({ ...actual, ...patch }),
          });
        },
        session,
        keys,
        configuration,
      ),
      /engine_protocol_error/,
    );
    assert.deepEqual(calls, ['prepare_destination_creation', 'cancel_destination_creation']);
  }
  const privateConfig = {
    ...actual,
    encryptionPublicKey: { ...actual.encryptionPublicKey, d: 'synthetic-marker' },
  };
  await assert.rejects(
    prepareDestinationCreation(
      async () => envelope({ ...attempt, configurationJson: JSON.stringify(privateConfig) }),
      session,
      keys,
      configuration,
    ),
    /engine_protocol_error/,
  );
});
test('confirmed creation requires exact prepared identity and a valid returned destination', async () => {
  const confirmed = { ...attempt, status: 'confirmed', destinationId: id(6) };
  assert.equal(
    (await executeDestinationCreation(async () => envelope(confirmed), session, attempt)).status,
    'confirmed',
  );
  for (const patch of [{ attemptId: id(9) }, { bundleId: id(9) }, { destinationId: null }])
    assert.equal(
      (await executeDestinationCreation(async () => envelope({ ...confirmed, ...patch }), session, attempt))
        .status,
      'uncertain',
    );
  const lost = await executeDestinationCreation(
    async () => {
      throw new Error('engine_timeout');
    },
    session,
    attempt,
  );
  assert.equal(lost.status, 'uncertain');
  assert.equal(lost.error, 'engine_timeout');
  for (const error of ['engine_busy', 'vault_pending', 'vault_profile_required'])
    await assert.rejects(
      executeDestinationCreation(
        async () => {
          throw new Error(error);
        },
        session,
        attempt,
      ),
      new RegExp(error),
    );
});
test('known rejected writes and read-only reconciliation preserve their distinct outcomes', async () => {
  const rejected = { ...attempt, status: 'failed', error: 'resource_unavailable', httpStatus: 422 };
  assert.equal(
    (await executeDestinationCreation(async () => envelope(rejected), session, attempt)).httpStatus,
    422,
  );
  assert.equal(
    (
      await cancelDestinationCreation(
        async () => envelope({ ...attempt, status: 'cancelled' }),
        session,
        attempt.attemptId,
      )
    ).status,
    'cancelled',
  );
  const recovered = {
    ...attempt,
    attemptId: null,
    configurationJson: null,
    status: 'confirmed',
    destinationId: id(6),
  };
  assert.equal(
    (
      await reconcileDestinationCreation(
        async (command) => {
          assert.equal(command, 'reconcile_destination_creation');
          return envelope(recovered);
        },
        session,
        keys.bundleId,
        id(6),
      )
    ).status,
    'confirmed',
  );
  await assert.rejects(
    reconcileDestinationCreation(
      async () => envelope({ ...recovered, destinationId: id(9) }),
      session,
      keys.bundleId,
      id(6),
    ),
    /engine_protocol_error/,
  );
});
