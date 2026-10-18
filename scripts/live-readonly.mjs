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
        const selection = {
          processModelId: 'urn:fbforge:connect:ci:process-discovery',
          messageId: 'read-only-probe',
          region: 'DE',
          offset: 0,
        };
        const page = (
          await engine.call(version, 'search_process_destinations', {
            ...args,
            destinationDocument: JSON.stringify(selection),
          })
        ).data;
        for (const [key, value] of Object.entries(selection)) assert.equal(page[key], value);
        assert.ok(Array.isArray(page.destinations));
        assert.ok(Number.isSafeInteger(page.totalCount) && page.totalCount >= page.destinations.length);
        console.log('v3 sender: authenticated process destination search passed');
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
        /^(open_session|load_send_destination|search_process_destinations|list_destinations|generate_test_keys): [a-z_]+$/.test(
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
