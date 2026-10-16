import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadContent, discardContent, CONTENT_CHUNK_BYTES, CONTENT_FILE_BYTES } from '../frontend/src/content.js';

const session = { apiVersion: 'v3', sessionId: '00000000-0000-4000-8000-000000000001', environment: 'TEST', connected: true };
const contentId = '00000000-0000-4000-8000-000000000002';
function native({ failAppend, failDiscard, mutate } = {}) {
  const calls = [], bytes = [];
  let total = 0;
  return { calls, bytes, invoke: async (command, args) => {
    calls.push({ command, args: { ...args } });
    assert.equal(args.apiVersion, session.apiVersion); assert.equal(args.sessionId, session.sessionId);
    let data;
    if (command === 'begin_content') { total = args.totalBytes; data = { contentId, totalBytes: total, receivedBytes: 0, complete: total === 0 }; }
    else if (command === 'append_content') {
      if (failAppend) throw new Error('resource_unavailable');
      assert.equal(args.contentId, contentId); assert.equal(args.byteOffset, bytes.length);
      bytes.push(...Buffer.from(args.chunk, 'base64'));
      data = { contentId, totalBytes: total, receivedBytes: bytes.length, complete: bytes.length === total };
    } else if (command === 'discard_content') {
      if (failDiscard) throw new Error('resource_unavailable');
      data = { contentId };
    } else assert.fail(`Unexpected command ${command}`);
    return mutate ? mutate(command, data) : { apiVersion: session.apiVersion, sessionId: session.sessionId, environment: 'TEST', data };
  } };
}

test('files larger than an IPC frame upload as bounded sequential chunks without a whole-file read', async () => {
  const fixture = native(), bytes = Uint8Array.from({ length: 100003 }, (_, i) => i % 256);
  const slices = [], progress = [];
  const file = { size: bytes.length, arrayBuffer() { assert.fail('Must not read a whole file'); },
    slice(start, end) { slices.push([start, end]); return new Blob([bytes.slice(start, end)]); } };
  const result = await uploadContent(fixture.invoke, session, file, { onProgress: value => progress.push(value.receivedBytes) });
  assert.deepEqual(Uint8Array.from(fixture.bytes), bytes);
  assert.deepEqual(result, { contentId, totalBytes: bytes.length, receivedBytes: bytes.length, complete: true });
  assert.equal(fixture.calls[0].command, 'begin_content');
  assert.equal(fixture.calls.filter(c => c.command === 'append_content').length, Math.ceil(bytes.length / CONTENT_CHUNK_BYTES));
  assert.equal(fixture.calls.some(c => c.command === 'discard_content'), false);
  for (const [start, end] of slices) assert.ok(end - start <= CONTENT_CHUNK_BYTES);
  for (const call of fixture.calls) assert.ok(new TextEncoder().encode(JSON.stringify(call)).length < 65536);
  assert.equal(progress.at(-1), bytes.length);
});

test('invalid size and invalid TEST session are rejected before reading a file or invoking native code', async () => {
  let calls = 0;
  const invoke = () => { calls++; assert.fail('Native command must not run'); };
  for (const size of [-1, NaN, Infinity, 1.5, CONTENT_FILE_BYTES + 1])
    await assert.rejects(uploadContent(invoke, session, { size }), /invalid_input/);
  await assert.rejects(uploadContent(invoke, { ...session, environment: 'PROD' }, new Blob(['x'])), /session_missing/);
  assert.equal(calls, 0);
});

test('zero-byte files complete after allocation without an empty append', async () => {
  const fixture = native();
  const result = await uploadContent(fixture.invoke, session, new Blob([]));
  assert.equal(result.complete, true); assert.equal(result.totalBytes, 0);
  assert.deepEqual(fixture.calls.map(c => c.command), ['begin_content']);
});

test('failed chunk is not replayed and its reserved content is discarded once', async () => {
  const fixture = native({ failAppend: true });
  await assert.rejects(uploadContent(fixture.invoke, session, new Blob(['synthetic payload'])), /resource_unavailable/);
  assert.deepEqual(fixture.calls.map(c => c.command), ['begin_content', 'append_content', 'discard_content']);
});

test('cancellation before allocation performs no command and during file reading discards before append', async () => {
  const controller = new AbortController(), fixture = native();
  controller.abort();
  await assert.rejects(uploadContent(fixture.invoke, session, new Blob(['x']), { signal: controller.signal }), /content_cancelled/);
  assert.equal(fixture.calls.length, 0);
  const during = new AbortController();
  const file = { size: 1, slice() { return { async arrayBuffer() { during.abort(); return new Uint8Array([1]).buffer; } }; } };
  await assert.rejects(uploadContent(fixture.invoke, session, file, { signal: during.signal }), /content_cancelled/);
  assert.deepEqual(fixture.calls.map(c => c.command), ['begin_content', 'discard_content']);
});

test('failed cleanup remains visible instead of claiming that staging was cleared', async () => {
  const fixture = native({ failAppend: true, failDiscard: true });
  await assert.rejects(uploadContent(fixture.invoke, session, new Blob(['x'])), /content_cleanup_failed/);
  assert.equal(fixture.calls.filter(c => c.command === 'discard_content').length, 1);
});

test('wrong response context, progress, content ID and private fields fail closed', async () => {
  for (const bad of [
    data => ({ ...data, contentId: session.sessionId }),
    data => ({ ...data, receivedBytes: data.receivedBytes - 1 }),
    data => ({ ...data, totalBytes: data.totalBytes + 1 }),
    data => ({ ...data, complete: false }),
    data => ({ ...data, path: 'renderer-must-not-receive-paths' }),
  ]) {
    const fixture = native({ mutate: (command, data) => ({ apiVersion: session.apiVersion,
      sessionId: session.sessionId, environment: 'TEST', data: command === 'append_content' ? bad(data) : data }) });
    await assert.rejects(uploadContent(fixture.invoke, session, new Blob(['x'])), /engine_protocol_error/);
    assert.equal(fixture.calls.at(-1).command, 'discard_content');
  }
  const fixture = native({ mutate: (command, data) => ({ apiVersion: 'v2', sessionId: session.sessionId, environment: 'TEST', data }) });
  await assert.rejects(uploadContent(fixture.invoke, session, new Blob(['x'])), /engine_protocol_error/);
  await assert.rejects(discardContent(async () => ({ apiVersion: session.apiVersion, sessionId: session.sessionId,
    environment: 'TEST', data: { contentId: session.sessionId } }), session, contentId), /engine_protocol_error/);
});
