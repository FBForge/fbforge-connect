import test from 'node:test';
import assert from 'node:assert/strict';
import { readReceivedSchema } from '../frontend/src/received-schema.js';
const proof = '22222222-2222-4222-8222-222222222222';
const session = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  apiVersion: 'v3',
  environment: 'TEST',
  connected: true,
};
const uri = 'https://schemas.example.test/data.json';
function wrap(data) {
  return { apiVersion: session.apiVersion, sessionId: session.sessionId, environment: 'TEST', data };
}
const page = (extra = {}) => ({
  proofId: proof,
  schemaUri: uri,
  totalBytes: 2,
  byteOffset: 0,
  chunk: btoa('{}'),
  ...extra,
});
test('proof-bound pages reassemble exact multibyte UTF8 through the reply command', async () => {
  const source = 'ä'.repeat(15000),
    bytes = new TextEncoder().encode(source);
  let calls = 0;
  const result = await readReceivedSchema(
    async (command, args) => {
      assert.equal(command, 'read_received_reply_schema');
      assert.equal(args.proofId, proof);
      assert.equal(args.sessionId, session.sessionId);
      calls++;
      return wrap(
        page({
          totalBytes: bytes.length,
          byteOffset: args.byteOffset,
          chunk: Buffer.from(bytes.slice(args.byteOffset, args.byteOffset + 12288)).toString('base64'),
        }),
      );
    },
    session,
    proof,
    { reply: true },
  );
  assert.equal(calls, 3);
  assert.equal(result.document, source);
  assert.equal(result.schemaUri, uri);
});
test('unavailable and oversized snapshots require only one bounded page', async () => {
  for (const [extra, status] of [
    [{ totalBytes: 0, schemaUri: null, chunk: '' }, 'unavailable'],
    [{ totalBytes: 9 * 1024 * 1024, chunk: Buffer.alloc(12288).toString('base64') }, 'limited'],
  ]) {
    let calls = 0;
    const result = await readReceivedSchema(
      async () => {
        calls++;
        return wrap(page(extra));
      },
      session,
      proof,
    );
    assert.equal(result.status, status);
    assert.equal(result.document, null);
    assert.equal(calls, 1);
  }
});
test('wrong proof, context, offsets, sizes, noncanonical base64 and unsolicited fields are rejected', async () => {
  for (const data of [
    page({ proofId: session.sessionId }),
    page({ byteOffset: 1 }),
    page({ totalBytes: -1 }),
    page({ chunk: 'e30' }),
    page({ extra: true }),
    page({ schemaUri: null }),
    page({ chunk: '!!!!' }),
    page({ totalBytes: 1, chunk: '/w==' }),
  ])
    await assert.rejects(
      readReceivedSchema(async () => wrap(data), session, proof),
      /engine_protocol_error/,
    );
  await assert.rejects(
    readReceivedSchema(async () => ({ ...wrap(page()), sessionId: proof }), session, proof),
    /engine_protocol_error/,
  );
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    readReceivedSchema(
      async () => {
        calls++;
      },
      session,
      proof,
      { signal: controller.signal },
    ),
    /content_cancelled/,
  );
  assert.equal(calls, 0);
});
