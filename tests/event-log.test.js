import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadEventLog,
  loadCaseEventLog,
  listEventLog,
  readEventDocument,
  discardEventLog,
} from '../frontend/src/event-log.js';

const destinationId = '11111111-1111-4111-8111-111111111111',
  submissionId = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333',
  logId = '44444444-4444-4444-8444-444444444444';
const eventId = '55555555-5555-4555-8555-555555555555';
const session = { apiVersion: 'v2', sessionId: destinationId, environment: 'TEST', connected: true };
const summary = {
  logId,
  destinationId,
  caseId,
  submissionId,
  total: 1,
  warnings: ['CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED'],
};
const row = {
  eventId,
  eventType: 'https://schema.fitko.de/fit-connect/events/submit-submission',
  issuer: destinationId,
  issuedAt: '2026-10-16T00:00:00Z',
  headerBytes: 2,
  claimsBytes: 2,
};
const envelope = (data, active = session) => ({
  apiVersion: active.apiVersion,
  sessionId: active.sessionId,
  environment: 'TEST',
  data,
});

test('both API versions load an exact TEST case and submission context without private key material', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const result = await loadEventLog(
      async (command, args) => {
        assert.equal(command, 'load_event_log');
        assert.deepEqual(args, {
          apiVersion,
          sessionId: active.sessionId,
          destinationId,
          caseId,
          submissionId,
        });
        return envelope(summary, active);
      },
      active,
      destinationId,
      caseId,
      submissionId,
    );
    assert.equal(result.logId, logId);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.warnings));
  }
});

test('mixed context, incomplete verification and unexpected summary data are rejected', async () => {
  for (const patch of [
    { destinationId: submissionId },
    { caseId: destinationId },
    { submissionId: caseId },
    { total: 0 },
    { total: 1001 },
    { warnings: [] },
    { warnings: ['OTHER'] },
    { secret: 'synthetic' },
  ])
    await assert.rejects(
      loadEventLog(
        async () => envelope({ ...summary, ...patch }),
        session,
        destinationId,
        caseId,
        submissionId,
      ),
      /engine_protocol_error/,
    );
});

test('event metadata pages are bounded and reject duplicate identities or embedded payloads', async () => {
  const page = { logId, offset: 0, total: 1, events: [row] };
  assert.deepEqual((await listEventLog(async () => envelope(page), session, summary)).events, [row]);
  for (const patch of [
    { logId: caseId },
    { offset: 5 },
    { total: 2 },
    { events: [] },
    { events: [{ ...row, claimsJson: '{}' }] },
    { events: [{ ...row, claimsBytes: 65537 }] },
    { events: [{ ...row, issuer: 'bad\nissuer' }] },
    { events: [{ ...row, issuedAt: 'invalid' }] },
  ])
    await assert.rejects(
      listEventLog(async () => envelope({ ...page, ...patch }), session, summary),
      /engine_protocol_error/,
    );
  await assert.rejects(
    listEventLog(async () => envelope({ ...page, total: 2, events: [row, row] }), session, {
      ...summary,
      total: 2,
    }),
    /engine_protocol_error/,
  );
});

test('JSON document reads preserve original UTF8 and large numbers across bounded chunks', async () => {
  const original = '{\n"number":9007199254740993,"value":"' + 'Grüße'.repeat(8000) + '"\n}';
  const bytes = new TextEncoder().encode(original);
  let calls = 0;
  const result = await readEventDocument(
    async (command, args) => {
      assert.equal(command, 'read_event_log');
      assert.equal(args.part, 'claims');
      assert.equal(args.eventId, eventId);
      calls++;
      const slice = bytes.slice(args.byteOffset, args.byteOffset + 24576);
      return envelope({
        logId,
        eventId,
        part: 'claims',
        byteOffset: args.byteOffset,
        totalBytes: bytes.length,
        chunk: btoa(String.fromCharCode(...slice)),
        complete: args.byteOffset + slice.length === bytes.length,
      });
    },
    session,
    logId,
    { ...row, claimsBytes: bytes.length },
    'claims',
  );
  assert.equal(result, original);
  assert.equal(calls, 3);
});

test('wrong chunk bindings, lengths, encoding or completion cannot release a document', async () => {
  const valid = {
    logId,
    eventId,
    part: 'header',
    byteOffset: 0,
    totalBytes: 2,
    chunk: 'e30=',
    complete: true,
  };
  for (const patch of [
    { logId: caseId },
    { eventId: submissionId },
    { part: 'claims' },
    { byteOffset: 1 },
    { totalBytes: 3 },
    { chunk: 'e30=\n' },
    { chunk: '/wA=' },
    { complete: false },
    { privateKey: 'synthetic' },
  ])
    await assert.rejects(
      readEventDocument(async () => envelope({ ...valid, ...patch }), session, logId, row, 'header'),
      /engine_protocol_error/,
    );
});

test('cancelled late reads never restore a document and invalid input never reaches native code', async () => {
  const controller = new AbortController();
  await assert.rejects(
    readEventDocument(
      async () => {
        controller.abort();
        return envelope({
          logId,
          eventId,
          part: 'header',
          byteOffset: 0,
          totalBytes: 2,
          chunk: 'e30=',
          complete: true,
        });
      },
      session,
      logId,
      row,
      'header',
      { signal: controller.signal },
    ),
    /content_cancelled/,
  );
  const never = () => assert.fail('Invalid input reached native code');
  await assert.rejects(loadEventLog(never, session, destinationId, 'bad', submissionId), /invalid_input/);
  await assert.rejects(listEventLog(never, session, summary, 1), /invalid_input/);
  await assert.rejects(readEventDocument(never, session, logId, row, 'key'), /invalid_input/);
  await assert.rejects(
    readEventDocument(never, session, logId, { ...row, headerBytes: 16385 }, 'header'),
    /invalid_input/,
  );
});

test('discard targets one owned snapshot and checks the native acknowledgement', async () => {
  await discardEventLog(
    async (command, args) => {
      assert.equal(command, 'discard_event_log');
      assert.deepEqual(args, { apiVersion: 'v2', sessionId: destinationId, logId });
      return envelope({ logId });
    },
    session,
    logId,
  );
  await assert.rejects(
    discardEventLog(async () => envelope({ logId: caseId }), session, logId),
    /engine_protocol_error/,
  );
});

test('reply logs use an exact independent case/reply identity and cannot show submission events', async () => {
  const { loadReplyEventLog } = await import('../frontend/src/event-log.js');
  const reply = { logId, caseId, replyId: submissionId, total: 1, warnings: summary.warnings };
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const loaded = await loadReplyEventLog(
      async (command, args) => {
        assert.equal(command, 'load_reply_event_log');
        assert.deepEqual(args, { apiVersion, sessionId: active.sessionId, caseId, replyId: submissionId });
        return envelope(reply, active);
      },
      active,
      caseId,
      submissionId,
    );
    const page = {
      logId,
      offset: 0,
      total: 1,
      events: [{ ...row, eventType: 'https://schema.fitko.de/fit-connect/events/submit-reply' }],
    };
    assert.equal((await listEventLog(async () => envelope(page, active), active, loaded)).events.length, 1);
    await assert.rejects(
      listEventLog(async () => envelope({ ...page, events: [row] }, active), active, loaded),
      /engine_protocol_error/,
    );
  }
  for (const patch of [
    { replyId: caseId },
    { caseId: submissionId },
    { submissionId },
    { total: 0 },
    { warnings: [] },
  ])
    await assert.rejects(
      loadReplyEventLog(async () => envelope({ ...reply, ...patch }), session, caseId, submissionId),
      /engine_protocol_error/,
    );
});

test('case logs accept empty results and multiple typed subjects while preserving strict bindings', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const data = { logId, caseId, scope: 'case', total: 2, warnings: summary.warnings };
    const result = await loadCaseEventLog(
      async (command, args) => {
        assert.equal(command, 'load_case_event_log');
        assert.deepEqual(args, { apiVersion, sessionId: active.sessionId, caseId });
        return envelope(data, active);
      },
      active,
      caseId,
    );
    const events = [
      { ...row, subjectType: 'submission', subjectId: submissionId },
      {
        ...row,
        eventId: submissionId,
        eventType: 'https://schema.fitko.de/fit-connect/events/submit-reply',
        subjectType: 'reply',
        subjectId: destinationId,
      },
    ];
    const invoke = async (command) => {
      assert.equal(command, 'list_case_event_log');
      return envelope({ logId, offset: 0, total: 2, events }, active);
    };
    assert.deepEqual((await listEventLog(invoke, active, result)).events, events);
    for (const patch of [
      { subjectType: 'reply' },
      { subjectId: 'bad' },
      { subjectType: 'case', eventType: 'https://schema.fitko.de/fit-connect/events/create-case' },
    ]) {
      const bad = [{ ...events[0], ...patch }, events[1]];
      await assert.rejects(
        listEventLog(
          async () => envelope({ logId, offset: 0, total: 2, events: bad }, active),
          active,
          result,
        ),
        /engine_protocol_error/,
      );
    }
    const empty = await loadCaseEventLog(async () => envelope({ ...data, total: 0 }, active), active, caseId);
    assert.equal(
      (
        await listEventLog(
          async () => envelope({ logId, offset: 0, total: 0, events: [] }, active),
          active,
          empty,
        )
      ).events.length,
      0,
    );
    await assert.rejects(
      loadCaseEventLog(async () => envelope({ ...data, caseId: submissionId }, active), active, caseId),
      /engine_protocol_error/,
    );
  }
});
