import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEnvironment } from '../frontend/src/environments.js';
import { openSession, updateSession } from '../frontend/src/sessions.js';
import { requestResource } from '../frontend/src/resources.js';
import { listProfiles, openSavedProfile } from '../frontend/src/profiles.js';
import { certificateMaterial } from '../frontend/src/certified-keys.js';
import { buildSupportReport } from '../frontend/src/support-report.js';
const id = '11111111-1111-4111-8111-111111111111';
const profile = {
  profileId: id,
  name: 'Fiktiver Zugang',
  clientId: 'fictional',
  apiVersion: 'v3',
  role: 'online-service',
  keyCount: 0,
  available: true,
};
for (const environment of ['TEST', 'STAGE', 'PROD']) {
  test(`${environment}: selection, authentication and resource results remain bound to this environment`, async () => {
    assert.equal(
      await selectEnvironment(async (command, args) => {
        assert.equal(command, 'select_environment');
        assert.deepEqual(args, { environment });
        return environment;
      }, environment),
      environment,
    );
    const snapshot = {
      sessionId: id,
      apiVersion: 'v3',
      role: 'online-service',
      connected: true,
      environment,
    };
    const session = await openSession(
      async () => snapshot,
      'v3',
      'online-service',
      'fictional',
      'synthetic',
      null,
      environment,
    );
    assert.equal(session.environment, environment);
    await updateSession(async () => snapshot, session, true);
    const result = { apiVersion: 'v3', sessionId: id, environment, data: { status: 'synthetic' } };
    assert.deepEqual(await requestResource(async () => result, session, 'synthetic_read'), result.data);
    for (const other of ['TEST', 'STAGE', 'PROD'].filter((item) => item !== environment)) {
      await assert.rejects(
        openSession(
          async () => ({ ...snapshot, environment: other }),
          'v3',
          'online-service',
          'fictional',
          'synthetic',
          null,
          environment,
        ),
        /engine_protocol_error/,
      );
      await assert.rejects(
        updateSession(async () => ({ ...snapshot, environment: other }), session, true),
        /engine_protocol_error/,
      );
      await assert.rejects(
        requestResource(async () => ({ ...result, environment: other }), session, 'synthetic_read'),
        /engine_protocol_error/,
      );
    }
    const stored = { ...profile, environment };
    assert.equal((await listProfiles(async () => [stored]))[0].environment, environment);
    assert.equal((await openSavedProfile(async () => snapshot, stored)).environment, environment);
    assert.equal(
      buildSupportReport({ version: '0.2.0', selectedApi: 'v3', environment }).environment,
      environment,
    );
  });
}
test('unknown environments never reach native selection and legacy profiles remain TEST', async () => {
  for (const environment of ['LOCAL', 'prod', 'https://localhost', '__proto__', null])
    await assert.rejects(
      selectEnvironment(() => assert.fail('No native call'), environment),
      /invalid_input/,
    );
  assert.equal((await listProfiles(async () => [profile]))[0].environment, 'TEST');
  await assert.rejects(
    selectEnvironment(async () => 'TEST', 'PROD'),
    /engine_protocol_error/,
  );
  await assert.rejects(
    listProfiles(async () => [{ ...profile, environment: 'LOCAL' }]),
    /engine_protocol_error/,
  );
});
test('certificate file parsing bounds input, preserves binary PKCS#12 and clears read buffers', async () => {
  const input = Uint8Array.from([0x30, 0x82, 0xff, 0x00]);
  const result = await certificateMaterial(
    { name: 'fictional.pfx', size: input.length, arrayBuffer: async () => input.buffer },
    'synthetic-password',
  );
  assert.deepEqual(result, { format: 'pkcs12', content: 'MIL/AA==', password: 'synthetic-password' });
  assert.deepEqual([...input], [0, 0, 0, 0]);
  await assert.rejects(
    certificateMaterial({
      name: 'oversized.p12',
      size: 24577,
      arrayBuffer: () => assert.fail('Must not read'),
    }),
    /invalid_input/,
  );
  const json = new TextEncoder().encode('{"kty":"RSA","x5c":[]}');
  assert.deepEqual(
    await certificateMaterial({ name: 'key.jwk', size: json.length, arrayBuffer: async () => json.buffer }),
    { format: 'jwk', content: '{"kty":"RSA","x5c":[]}' },
  );
  assert.ok(json.every((byte) => byte === 0));
});
