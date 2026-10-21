import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSendData } from '../frontend/src/send-data-validation.js';
const id = '11111111-1111-4111-8111-111111111111';
const session = { sessionId: id, apiVersion: 'v3', environment: 'TEST', connected: true };
const selection = {
  serviceIdentifier: 'urn:test:service',
  schemaUri: 'urn:test:schema',
  processModelId: '',
  messageId: '',
  allowExternalSchemas: false,
  mimeType: 'application/json',
};
function boundary({ fail = false, patch = {} } = {}) {
  const files = new Map(),
    calls = [];
  const invoke = async (command, args) => {
    calls.push({ command, args });
    assert.equal(args.sessionId, id);
    const wrap = (data) => ({ apiVersion: args.apiVersion, sessionId: id, environment: 'TEST', data });
    if (command === 'begin_content') {
      const contentId = crypto.randomUUID();
      files.set(contentId, { totalBytes: args.totalBytes, receivedBytes: 0 });
      return wrap({ contentId, ...files.get(contentId), complete: args.totalBytes === 0 });
    }
    if (command === 'append_content') {
      const file = files.get(args.contentId);
      assert.equal(args.byteOffset, file.receivedBytes);
      file.receivedBytes += atob(args.chunk).length;
      return wrap({ contentId: args.contentId, ...file, complete: file.receivedBytes === file.totalBytes });
    }
    if (command === 'discard_content') {
      files.delete(args.contentId);
      return wrap({ contentId: args.contentId });
    }
    assert.equal(command, 'validate_send_data');
    const request = JSON.parse(args.schemaDocument);
    assert.equal(request.allowExternalSchemas, false);
    assert.equal(request.schemas[0].uri, selection.schemaUri);
    if (fail) throw 'data_schema_invalid';
    return {
      ...wrap({
        schemaUri: request.schemaUri,
        mimeType: request.mimeType,
        dataBytes: files.get(request.contentId).totalBytes,
        valid: true,
      }),
      ...patch,
    };
  };
  return { invoke, files, calls };
}
const schema = [{ uri: selection.schemaUri, file: new Blob(['{"$id":"urn:test:schema","type":"object"}']) }];
test('send validation stages only session-owned files, preserves consent and performs no write', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const fake = boundary();
    const result = await validateSendData(
      fake.invoke,
      { ...session, apiVersion },
      id,
      selection,
      new Blob(['{}']),
      schema,
    );
    assert.equal(result.valid, true);
    assert.equal(fake.files.size, 0);
    assert.ok(!fake.calls.some((call) => /prepare_send|execute_send/.test(call.command)));
  }
});
test('validation failures and a foreign native context clear all staged inputs without retrying', async () => {
  for (const options of [
    { fail: true },
    { patch: { environment: 'PROD' } },
    { patch: { sessionId: crypto.randomUUID() } },
  ]) {
    const fake = boundary(options);
    await assert.rejects(validateSendData(fake.invoke, session, id, selection, new Blob(['{}']), schema));
    assert.equal(fake.files.size, 0);
    assert.equal(fake.calls.filter((call) => call.command === 'validate_send_data').length, 1);
  }
});
