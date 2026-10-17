import test from 'node:test';
import assert from 'node:assert/strict';
import { listCases, caseParts, readCaseFile } from '../frontend/src/cases.js';
const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const session = { apiVersion: 'v3', sessionId: id(1), environment: 'TEST', connected: true };
const envelope = (data) => ({ ...session, connected: undefined, data });
const invokeFor = (work) => async (command, args) => {
  assert.equal(command, 'case_workspace');
  assert.equal(args.sessionId, session.sessionId);
  const result = envelope(await work(args));
  delete result.connected;
  return result;
};
test('case file chunks enforce ownership, offsets, byte counts and cancellation', async () => {
  const bytes = new Uint8Array(30000).fill(42),
    part = { contentId: id(3), totalBytes: bytes.length };
  const invoke = invokeFor((args) => ({
    recordId: args.recordId,
    contentId: args.contentId,
    byteOffset: args.offset,
    totalBytes: bytes.length,
    chunk: Buffer.from(bytes.subarray(args.offset, args.offset + 24576)).toString('base64'),
    complete: args.offset + 24576 >= bytes.length,
  }));
  assert.deepEqual(await readCaseFile(invoke, session, id(2), part), bytes);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    readCaseFile(invoke, session, id(2), part, { signal: aborted.signal }),
    /content_cancelled/,
  );
  await assert.rejects(
    readCaseFile(
      invokeFor((args) => ({
        recordId: id(9),
        contentId: args.contentId,
        byteOffset: 0,
        totalBytes: 30000,
        chunk: '',
        complete: false,
      })),
      session,
      id(2),
      part,
    ),
    /engine_protocol_error/,
  );
});
test('case metadata and paginated parts reject foreign, unbounded and duplicate identities', async () => {
  await assert.rejects(
    listCases(
      invokeFor(() => ({ records: [{ recordId: 'bad' }], persistent: false, canPersist: false })),
      session,
    ),
    /engine_protocol_error/,
  );
  await assert.rejects(
    caseParts(
      invokeFor((args) => ({
        recordId: id(2),
        offset: args.offset,
        total: 2,
        parts: [
          { contentId: id(3), kind: 'data', fileName: 'x.json', mimeType: 'application/json', totalBytes: 2 },
          { contentId: id(3), kind: 'attachment', fileName: 'x.txt', mimeType: 'text/plain', totalBytes: 2 },
        ],
      })),
      session,
      id(2),
    ),
    /engine_protocol_error/,
  );
  await assert.rejects(
    caseParts(
      invokeFor(() => ({ recordId: id(9), offset: 0, total: 1, parts: [] })),
      session,
      id(2),
    ),
    /engine_protocol_error/,
  );
});
