import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { scannerFixture, SCANNER_PROBLEM_TEXT } from '../scripts/live-scanner-fixture.mjs';

const eventType = 'https://schema.fitko.de/fit-connect/events/accept-submission';
const problem = {
  type: 'https://schema.fitko.de/fit-connect/events/problems/invalid-content',
  instance: 'attachment:blocked-id',
};
function fixture(problems = [problem]) {
  let uploading = false;
  const calls = [],
    uploads = [];
  const claims = Buffer.from(JSON.stringify({ events: { [eventType]: { problems } } }));
  const engine = {
    async call(command, fields) {
      calls.push({ command, ...fields });
      if (command === 'prepare_send') return { attempt: { attemptId: 'attempt-id' } };
      if (command === 'execute_send')
        return { status: 'sent', submissionId: 'submission-id', caseId: 'case-id' };
      if (command === 'load_event_log') return { logId: 'log-id', total: 1 };
      if (command === 'list_event_log')
        return { events: [{ eventId: 'event-id', eventType, claimsBytes: claims.length }] };
      if (command === 'read_event_log')
        return { chunk: claims.subarray(fields.byteOffset, fields.byteOffset + 19).toString('base64') };
      throw new Error('unexpected test call');
    },
  };
  return {
    calls,
    uploads,
    ...scannerFixture({
      openSender: async () => engine,
      receiver: () => engine,
      upload: async (_, bytes) => {
        assert.equal(uploading, false, 'the native protocol forbids concurrent uploads');
        uploading = true;
        await Promise.resolve();
        uploads.push(bytes);
        uploading = false;
        return `content-${uploads.length}`;
      },
      destination: 'owned-destination',
      service: 'test-service',
      schemaUri: 'test-schema',
      from: 'owned-sender',
    }),
  };
}
for (const api of ['v2', 'v3']) {
  test(`controlled ${api} TEST fixture sends benign files once and verifies the exact signed problem`, async () => {
    const f = fixture();
    const message = await f.sendScannerFixture(api);
    const draft = JSON.parse(f.calls[0].sendDocument);
    assert.equal(draft.destinationId, 'owned-destination');
    assert.equal(draft.fromDestinationId, api === 'v3' ? 'owned-sender' : null);
    assert.equal(draft.replyOffer, null);
    assert.equal(draft.attachments.length, 2);
    assert.equal(f.uploads[0], SCANNER_PROBLEM_TEXT);
    assert.equal(f.calls.filter((c) => c.command === 'execute_send').length, 1);
    await f.verifyScannerReceipt(message, 'blocked-id');
    assert.ok(f.calls.filter((c) => c.command === 'read_event_log').length > 1);
  });
}
test('controlled receipt acceptance rejects a missing, foreign, duplicated or wrong-type problem', async () => {
  for (const problems of [
    [],
    [{ ...problem, instance: 'attachment:other-id' }],
    [problem, problem],
    [{ ...problem, type: 'wrong-type' }],
  ]) {
    const f = fixture(problems);
    await assert.rejects(
      f.verifyScannerReceipt({ api: 'v2', submissionId: 'submission-id', caseId: 'case-id' }, 'blocked-id'),
      /scanner_receipt_problem_missing/,
    );
  }
});
