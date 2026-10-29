import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { receiveFailures, isReceiveFailure } from '../frontend/src/receive/failures.js';
import { receiveMessages, receiveErrorTitle } from '../frontend/src/receive/messages.js';
import { diagnosticCode, errorMessage } from '../frontend/src/diagnostics.js';
import { verifySubmission } from '../frontend/src/receiving.js';

const id = '11111111-1111-4111-8111-111111111111';
test('receive failure reasons survive both native allowlists and remain actionable in diagnostics', async () => {
  const java = await readFile(
    new URL(
      '../engine/contract/src/main/java/org/fitconnect/integration/contract/SessionException.java',
      import.meta.url,
    ),
    'utf8',
  );
  const native = await readFile(new URL('../desktop/src/protocol.rs', import.meta.url), 'utf8');
  for (const [code, explanation] of Object.entries(receiveFailures)) {
    assert.ok(java.includes(`"${code}"`));
    assert.ok(native.includes(`Some("${code}") =>`));
    assert.equal(diagnosticCode(new Error(code)), code);
    assert.equal(errorMessage(code), explanation.message);
    assert.equal(receiveMessages(false)[code], explanation.message);
    assert.equal(receiveMessages(true)[code], explanation.message);
    assert.equal(receiveErrorTitle(code), explanation.title);
    assert.equal(isReceiveFailure(code), true);
    for (const apiVersion of ['v2', 'v3'])
      await assert.rejects(
        verifySubmission(
          async () => {
            throw new Error(code);
          },
          { apiVersion, sessionId: id, connected: true, environment: 'TEST' },
          id,
          id,
        ),
        (error) => error.message === code,
      );
  }
});

test('unknown reasons never become guessed explanations or leak native text', () => {
  for (const code of [
    'receive_response_invalid:synthetic-secret',
    '__proto__',
    'constructor',
    'synthetic-secret',
  ]) {
    assert.equal(isReceiveFailure(code), false);
    assert.equal(diagnosticCode(code), 'unknown_error');
    assert.equal(errorMessage(code).includes(code), false);
  }
  assert.equal(isReceiveFailure(Object.create(null)), false);
  assert.equal(errorMessage({ message: Object.create(null) }), 'Die lokale Aktion ist fehlgeschlagen.');
  assert.match(receiveMessages(false).invalid_resource, /keinen genaueren Grund/);
  assert.match(
    receiveFailures.receive_metadata_schema_unsupported.message,
    /lokales Fachdaten-Schema behebt diesen Fehler nicht/,
  );
});
