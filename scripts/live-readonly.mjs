// Read-only TEST checks. No submissions, receipts or destinations are written.
import assert from 'node:assert/strict';
import { NativeEngine, secretNames } from './native-test-engine.mjs';
for (const secretName of secretNames) {
  if (!process.env[secretName]) throw new Error(`Missing Actions secret: ${secretName}`);
}
let failures = 0;
for (const version of ['v2', 'v3']) {
  for (const [label, role, idName, secretName] of [
    ['sender', 'online-service', 'SENDERID', 'SENDERSECRET'],
    ['subscriber', 'administrative-system', 'SUBSCRIBERID', 'SUBSCRIBERSECRET'],
  ]) {
    const engine = new NativeEngine();
    try {
      const session = await engine.call(version, 'open_session', {
        role,
        clientId: process.env[idName],
        clientSecret: process.env[secretName],
      });
      assert.equal(session.environment, 'TEST');
      assert.equal(session.connected, true);
      assert.equal(session.role, role);
      const args = { sessionId: session.sessionId };
      if (label === 'sender' && version === 'v3') {
        const result = await engine.call(version, 'load_send_destination', {
          ...args,
          destinationId: process.env.SENDERDEST,
        });
        assert.equal(result.data.destinationId, process.env.SENDERDEST);
      } else if (label === 'subscriber') {
        const result = await engine.call(version, 'list_destinations', { ...args, offset: 0 });
        assert.ok(Array.isArray(result.data.destinations));
        if (version === 'v3') {
          const generated = (await engine.call(version, 'generate_test_keys', args)).data;
          assert.equal(generated.status, 'ready');
          assert.equal(generated.encryption.purpose, 'decrypt');
          assert.equal(generated.signing.purpose, 'sign');
          assert.notEqual(generated.encryption.kid, generated.signing.kid);
        }
      }
      await engine.call(version, 'close_session', args);
      console.log(`${version} ${label}: TEST authentication and native role/read checks passed`);
    } catch (error) {
      failures++;
      // Never include SDK exceptions, network bodies, request values or tokens in CI output.
      const code =
        /^(open_session|load_send_destination|list_destinations|generate_test_keys): [a-z_]+$/.test(
          error.message,
        )
          ? error.message
          : 'live_check_failed';
      console.error(`${version} ${label}: ${code}`);
    } finally {
      engine.close();
    }
  }
}
if (failures) process.exitCode = 1;
