import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSend, executeSend, sendState } from '../frontend/src/sending.js';

const session = {
  apiVersion: 'v3',
  sessionId: '11111111-1111-4111-8111-111111111111',
  environment: 'TEST',
  connected: true,
};
const attempt = '22222222-2222-4222-8222-222222222222';
const content = '33333333-3333-4333-8333-333333333333';
const identity = { attemptId: attempt, status: 'prepared', submissionId: null, caseId: null, error: null };
const draft = {
  destinationId: '44444444-4444-4444-8444-444444444444',
  fromDestinationId: session.sessionId,
  serviceIdentifier: 'urn:test:service',
  serviceName: 'Test',
  region: null,
  schemaUri: 'https://example.invalid/schema.json',
  mimeType: 'application/json',
  caseId: null,
  processMessage: null,
};
const summary = { ...draft, replyOffer: null, dataBytes: 2, attachments: [] };
// serde_json::Value uses sorted object fields in the native bridge.
const nativeOrder = (value) =>
  Array.isArray(value)
    ? value.map(nativeOrder)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, nativeOrder(value[key])]),
        )
      : value;
const envelope = (data) =>
  nativeOrder({ apiVersion: session.apiVersion, sessionId: session.sessionId, environment: 'TEST', data });

test('preparing uploads bytes, confirms native summary and releases staging without any send call', async () => {
  const calls = [];
  const invoke = async (command, args) => {
    calls.push(command);
    assert.equal(args.sessionId, session.sessionId);
    if (command === 'begin_content')
      return envelope({ contentId: content, totalBytes: 2, receivedBytes: 0, complete: false });
    if (command === 'append_content')
      return envelope({ contentId: content, totalBytes: 2, receivedBytes: 2, complete: true });
    if (command === 'prepare_send') {
      assert.deepEqual(JSON.parse(args.sendDocument), {
        ...draft,
        replyOffer: null,
        contentId: content,
        attachments: [],
      });
      return envelope({ attempt: identity, summary });
    }
    assert.equal(command, 'discard_content');
    return envelope({ contentId: content });
  };
  const result = await prepareSend(invoke, session, draft, new Blob(['{}']), []);
  assert.equal(result.attempt.attemptId, attempt);
  assert.deepEqual(calls, ['begin_content', 'append_content', 'prepare_send', 'discard_content']);
});

test('native confirmation cannot silently change destination or bytes', async () => {
  const invoke = async (command) => {
    if (command === 'begin_content')
      return envelope({ contentId: content, totalBytes: 2, receivedBytes: 0, complete: false });
    if (command === 'append_content')
      return envelope({ contentId: content, totalBytes: 2, receivedBytes: 2, complete: true });
    if (command === 'prepare_send')
      return envelope({ attempt: identity, summary: { ...summary, dataBytes: 3 } });
    if (command === 'cancel_send') return envelope({ ...identity, status: 'cancelled' });
    return envelope({ contentId: content });
  };
  await assert.rejects(prepareSend(invoke, session, draft, new Blob(['{}']), []), /engine_protocol_error/);
});

test('sending invokes only the confirmed attempt and reports an interrupted response as uncertain without retry', async () => {
  let calls = 0;
  const result = await executeSend(
    async (command, args) => {
      calls++;
      assert.equal(command, 'execute_send');
      assert.equal(args.attemptId, attempt);
      throw new Error('engine_disconnected');
    },
    session,
    identity,
  );
  assert.equal(calls, 1);
  assert.equal(result.status, 'uncertain');
  assert.equal(result.attemptId, attempt);
  assert.equal(result.error, 'engine_disconnected');
});

test('send diagnostics retain bounded HTTP facts and reject unexpected content', async () => {
  const entry = {
    step: 'announce',
    method: 'POST',
    httpStatus: 422,
    code: 'resource_unavailable',
    durationMs: 89,
  };
  const failed = { ...identity, status: 'uncertain', error: 'resource_unavailable', diagnostics: [entry] };
  assert.deepEqual(await sendState(async () => envelope(failed), session), failed);
  assert.deepEqual((await executeSend(async () => envelope(failed), session, identity)).diagnostics, [entry]);
  const withProblem = { ...failed, diagnostics: [{ ...entry, problemType: 'request-invalid' }] };
  assert.deepEqual(await sendState(async () => envelope(withProblem), session), withProblem);
  for (const diagnostics of [
    [{ ...entry, body: 'unexpected' }],
    [{ ...entry, httpStatus: '422' }],
    [{ ...entry, httpStatus: 999 }],
    [{ ...entry, step: 'arbitrary content' }],
    [{ ...entry, code: 'arbitrary content' }],
    [{ ...entry, durationMs: -1 }],
    [{ ...entry, problemType: 'https://untrusted.invalid/error' }],
    [{ ...entry, problemType: 'raw response text' }],
    Array(33).fill(entry),
  ])
    await assert.rejects(
      sendState(async () => envelope({ ...failed, diagnostics }), session),
      /engine_protocol_error/,
    );
});

test('native format errors remain readable failures without resetting the session', async () => {
  const failed = {
    ...identity,
    status: 'failed',
    error: 'data_format_invalid',
    diagnostics: [
      { step: 'sdk', method: 'LOCAL', httpStatus: null, code: 'data_format_invalid', durationMs: 0 },
    ],
  };
  assert.deepEqual(await executeSend(async () => envelope(failed), session, identity), failed);
});

test('success needs the same attempt and known server IDs, mismatched success is uncertain', async () => {
  const sent = { ...identity, status: 'sent', submissionId: content, caseId: draft.destinationId };
  assert.deepEqual(await executeSend(async () => envelope(sent), session, identity), sent);
  const mismatch = await executeSend(
    async () => envelope({ ...sent, attemptId: content }),
    session,
    identity,
  );
  assert.equal(mismatch.status, 'uncertain');
  assert.equal(mismatch.error, 'engine_protocol_error');
});

test('reply offers preserve their distinct schema and format through native confirmation for both APIs', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const offer = { processMessages: [], schemaUri: 'urn:test:antwort:ä', mimeType: 'application/xml' };
    for (const changed of [false, 'schema', 'mime', 'key']) {
      const calls = [];
      const invoke = async (command, args) => {
        calls.push(command);
        const wrap = (data) =>
          nativeOrder({ apiVersion, sessionId: active.sessionId, environment: 'TEST', data });
        if (command === 'begin_content')
          return wrap({ contentId: content, totalBytes: 2, receivedBytes: 0, complete: false });
        if (command === 'append_content')
          return wrap({ contentId: content, totalBytes: 2, receivedBytes: 2, complete: true });
        if (command === 'prepare_send') {
          assert.deepEqual(JSON.parse(args.sendDocument).replyOffer, offer);
          const replyOffer = { ...offer };
          if (changed === 'schema') replyOffer.schemaUri = draft.schemaUri;
          if (changed === 'mime') replyOffer.mimeType = 'application/json';
          if (changed === 'key') replyOffer.privateKey = 'unexpected';
          return wrap({ attempt: identity, summary: { ...summary, replyOffer } });
        }
        if (command === 'cancel_send') return wrap({ ...identity, status: 'cancelled' });
        assert.equal(command, 'discard_content');
        return wrap({ contentId: content });
      };
      const result = prepareSend(invoke, active, { ...draft, replyOffer: offer }, new Blob(['{}']), []);
      if (changed) {
        await assert.rejects(result, /engine_protocol_error/);
        assert.ok(calls.includes('cancel_send'));
      } else assert.deepEqual((await result).summary.replyOffer, offer);
      assert.equal(calls.includes('execute_send'), false);
      assert.equal(calls.at(-1), 'discard_content');
    }
  }
});

test('invalid reply offers never upload content or reach the native boundary', async () => {
  for (const replyOffer of [
    { schemaUri: '/relative', mimeType: 'application/json' },
    { schemaUri: 'urn:test:reply', mimeType: 'text/html' },
    { schemaUri: 'urn:test:reply', mimeType: 'application/json', key: {} },
    { schemaUri: 'urn:test: reply', mimeType: 'application/json' },
    undefined,
    [],
  ]) {
    await assert.rejects(
      prepareSend(
        () => assert.fail('Invalid offer reached native code'),
        session,
        { ...draft, replyOffer },
        new Blob(['{}']),
        [],
      ),
      /invalid_submission/,
    );
  }
});

test('native field sorting preserves multi-attachment consent while changed values and array order are rejected', async () => {
  for (const apiVersion of ['v2', 'v3'])
    for (const change of [null, 'description', 'bytes', 'extra', 'order', 'offer', 'process']) {
      const active = { ...session, apiVersion };
      const input = {
        ...draft,
        fromDestinationId: apiVersion === 'v3' ? draft.fromDestinationId : null,
        replyOffer: { schemaUri: 'urn:test:reply', mimeType: 'application/json', processMessages: [] },
        processMessage:
          apiVersion === 'v3' ? { processModelId: 'urn:test:process', messageId: 'request' } : null,
      };
      const files = ['first.txt', 'second.txt'].map((name) => ({
        file: Object.assign(new Blob(['x']), { name }),
        description: name,
        mimeType: 'text/plain',
      }));
      let current,
        size,
        count = 0;
      const calls = [];
      const invoke = async (command, args) => {
        calls.push(command);
        const wrap = (data) =>
          nativeOrder({ apiVersion, sessionId: active.sessionId, environment: 'TEST', data });
        if (command === 'begin_content') {
          current = `33333333-3333-4333-8333-${String(++count).padStart(12, '0')}`;
          size = args.totalBytes;
          return wrap({ contentId: current, totalBytes: size, receivedBytes: 0, complete: false });
        }
        if (command === 'append_content')
          return wrap({ contentId: current, totalBytes: size, receivedBytes: size, complete: true });
        if (command === 'prepare_send') {
          const value = {
            ...input,
            dataBytes: 2,
            attachments: files.map((item) => ({
              fileName: item.file.name,
              mimeType: item.mimeType,
              description: item.description,
              bytes: 1,
            })),
          };
          if (change === 'description') value.attachments[0].description = 'changed';
          if (change === 'bytes') value.attachments[0].bytes = 2;
          if (change === 'extra') value.attachments[0].unexpected = true;
          if (change === 'order') value.attachments.reverse();
          if (change === 'offer') value.replyOffer = { ...value.replyOffer, schemaUri: 'urn:test:other' };
          if (change === 'process')
            value.processMessage = { processModelId: 'urn:test:other', messageId: 'request' };
          return wrap({ attempt: identity, summary: value });
        }
        if (command === 'cancel_send') return wrap({ ...identity, status: 'cancelled' });
        assert.equal(command, 'discard_content');
        return wrap({ contentId: args.contentId });
      };
      const result = prepareSend(invoke, active, input, new Blob(['{}']), files);
      if (change) {
        await assert.rejects(result, /engine_protocol_error/);
        assert.ok(calls.includes('cancel_send'));
      } else assert.equal((await result).summary.attachments.length, 2);
      assert.equal(calls.filter((command) => command === 'discard_content').length, 3);
      assert.ok(!calls.includes('execute_send'));
    }
});

test('process reply offers are explicit, bounded and unavailable over v2', async () => {
  const offer = {
    schemaUri: 'urn:test:reply',
    mimeType: 'application/json',
    processMessages: [{ processModelId: 'model-1', messageId: 'answer-1' }],
  };
  await assert.rejects(
    prepareSend(
      () => assert.fail('v2 must not publish process mapping'),
      { ...session, apiVersion: 'v2' },
      { ...draft, replyOffer: offer },
      new Blob(['{}']),
      [],
    ),
    /invalid_submission/,
  );
  for (const messages of [
    [offer.processMessages[0], offer.processMessages[0]],
    [{ processModelId: 'model-1', messageId: 'x', privateKey: 'no' }],
    Array(17).fill(offer.processMessages[0]),
  ])
    await assert.rejects(
      prepareSend(
        () => assert.fail('invalid mapping must not upload'),
        { ...session, apiVersion: 'v3' },
        { ...draft, replyOffer: { ...offer, processMessages: messages } },
        new Blob(['{}']),
        [],
      ),
      /invalid_submission/,
    );
});

test('local case guard before dispatch never becomes an uncertain remote write', async () => {
  let calls = 0;
  await assert.rejects(
    executeSend(
      async () => {
        calls++;
        throw new Error('case_limit');
      },
      session,
      identity,
    ),
    /case_limit/,
  );
  assert.equal(calls, 1);
});
