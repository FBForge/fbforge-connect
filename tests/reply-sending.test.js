import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReplyTarget, prepareReply, executeReply, cancelReply } from '../frontend/src/reply-sending.js';

const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
const session = { apiVersion: 'v3', sessionId: id, environment: 'TEST', connected: true };
const proof = { proofId: id, destinationId: other, submissionId: id, caseId: other };
const attempt = { attemptId: id, status: 'prepared', replyId: null, caseId: other, error: null };
const draft = {
  proofId: id,
  schemaId: id,
  schemaUri: 'urn:test:answer',
  mimeType: 'application/json',
  processMessage: null,
};
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
const envelope = (data, active = session) =>
  nativeOrder({ apiVersion: active.apiVersion, sessionId: active.sessionId, environment: 'TEST', data });
const schema = (suffix) => ({ schemaUri: `urn:test:${suffix}`, mimeType: 'application/json' });

test('both APIs load all offered schemas from bounded native pages without any public key DTO', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion },
      offsets = [];
    const result = await loadReplyTarget(
      async (command, args) => {
        assert.equal(command, 'reply_target');
        assert.equal(args.proofId, proof.proofId);
        assert.equal(args.apiVersion, apiVersion);
        offsets.push(args.offset);
        return envelope(
          {
            ...proof,
            replyDestinationId: null,
            offset: args.offset,
            total: 3,
            schemas: [schema('a'), schema('b'), schema('c')].slice(args.offset, args.offset + 2),
          },
          active,
        );
      },
      active,
      proof,
    );
    assert.deepEqual(offsets, [0, 2]);
    assert.equal(result.schemas.length, 3);
    assert.ok(Object.isFrozen(result.schemas));
  }
});
test('reply target rejects foreign proofs, malformed pages and unexpected key material', async () => {
  const page = { ...proof, replyDestinationId: null, offset: 0, total: 1, schemas: [schema('a')] };
  for (const patch of [
    { caseId: id },
    { proofId: other },
    { total: 65 },
    { offset: 2 },
    { schemas: [] },
    { publicJwk: {} },
    { schemas: [{ ...schema('a'), privateKey: {} }] },
    { schemas: [{ schemaUri: '/relative', mimeType: null }] },
  ])
    await assert.rejects(
      loadReplyTarget(async () => envelope({ ...page, ...patch }), session, proof),
      /engine_protocol_error/,
    );
  await assert.rejects(
    loadReplyTarget(async () => ({ ...envelope(page), environment: 'PROD' }), session, proof),
    /engine_protocol_error/,
  );
});
function preparationInvoke(calls, summaryPatch = {}) {
  return async (command, args) => {
    calls.push(command);
    if (command === 'begin_content')
      return envelope({ contentId: other, totalBytes: 2, receivedBytes: 0, complete: false });
    if (command === 'append_content')
      return envelope({ contentId: other, totalBytes: 2, receivedBytes: 2, complete: true });
    if (command === 'prepare_reply') {
      assert.deepEqual(JSON.parse(args.replyDocument), { ...draft, contentId: other, attachments: [] });
      return envelope({
        attempt,
        summary: {
          ...draft,
          destinationId: proof.destinationId,
          submissionId: proof.submissionId,
          caseId: proof.caseId,
          dataBytes: 2,
          attachments: [],
          ...summaryPatch,
        },
      });
    }
    if (command === 'cancel_reply') return envelope({ ...attempt, status: 'cancelled' });
    assert.equal(command, 'discard_content');
    return envelope({ contentId: other });
  };
}
test('preparing a reply stages immutable bytes and checks the complete consent snapshot without sending', async () => {
  const calls = [];
  const result = await prepareReply(preparationInvoke(calls), session, proof, draft, new Blob(['{}']), []);
  assert.equal(result.summary.proofId, proof.proofId);
  assert.equal(result.summary.dataBytes, 2);
  assert.deepEqual(calls, ['begin_content', 'append_content', 'prepare_reply', 'discard_content']);
  assert.ok(Object.isFrozen(result.summary));
  assert.ok(Object.isFrozen(result.summary.attachments));
});
test('changed consent cancels the native attempt and releases staging', async () => {
  for (const patch of [
    { caseId: id },
    { proofId: other },
    { schemaUri: 'urn:test:other' },
    { mimeType: 'application/xml' },
    { dataBytes: 3 },
    { publicJwk: {} },
  ]) {
    const calls = [];
    await assert.rejects(
      prepareReply(preparationInvoke(calls, patch), session, proof, draft, new Blob(['{}']), []),
      /engine_protocol_error/,
    );
    assert.ok(calls.includes('cancel_reply'));
    assert.equal(calls.at(-1), 'discard_content');
    assert.ok(!calls.includes('execute_reply'));
  }
});

test('reply preparation accepts native-sorted attachment and process fields but rejects changed attachments', async () => {
  for (const change of [false, true]) {
    const input = { ...draft, processMessage: { processModelId: 'urn:test:process', messageId: 'reply' } };
    const file = Object.assign(new Blob(['x']), { name: 'answer.txt' });
    const files = [{ file, mimeType: 'text/plain', description: 'Answer' }];
    const calls = [];
    let size;
    const invoke = async (command, args) => {
      calls.push(command);
      if (command === 'begin_content') {
        size = args.totalBytes;
        return envelope({ contentId: other, totalBytes: size, receivedBytes: 0, complete: false });
      }
      if (command === 'append_content')
        return envelope({ contentId: other, totalBytes: size, receivedBytes: size, complete: true });
      if (command === 'prepare_reply')
        return envelope({
          attempt,
          summary: {
            ...input,
            destinationId: proof.destinationId,
            submissionId: proof.submissionId,
            caseId: proof.caseId,
            dataBytes: 2,
            attachments: [
              {
                fileName: file.name,
                mimeType: 'text/plain',
                description: change ? 'Changed' : 'Answer',
                bytes: 1,
              },
            ],
          },
        });
      if (command === 'cancel_reply') return envelope({ ...attempt, status: 'cancelled' });
      assert.equal(command, 'discard_content');
      return envelope({ contentId: other });
    };
    const result = prepareReply(invoke, session, proof, input, new Blob(['{}']), files);
    if (change) {
      await assert.rejects(result, /engine_protocol_error/);
      assert.ok(calls.includes('cancel_reply'));
    } else assert.equal((await result).summary.attachments[0].description, 'Answer');
    assert.ok(!calls.includes('execute_reply'));
  }
});
test('staging cleanup failures cancel an otherwise approved reply instead of allowing confirmation', async () => {
  const calls = [],
    base = preparationInvoke(calls);
  await assert.rejects(
    prepareReply(
      async (command, args) => {
        if (command === 'discard_content') {
          calls.push(command);
          throw new Error('content_cleanup_failed');
        }
        return base(command, args);
      },
      session,
      proof,
      draft,
      new Blob(['{}']),
      [],
    ),
    /content_cleanup_failed/,
  );
  assert.ok(calls.includes('cancel_reply'));
  assert.ok(!calls.includes('execute_reply'));
});
test('invalid reply drafts cannot upload payloads', async () => {
  for (const patch of [
    { proofId: other },
    { schemaUri: 'relative' },
    { mimeType: 'text/html' },
    { publicJwk: {} },
    { processMessage: { messageId: 'only-one' } },
  ])
    await assert.rejects(
      prepareReply(
        () => assert.fail('Invalid draft reached native code'),
        session,
        proof,
        { ...draft, ...patch },
        new Blob(['{}']),
        [],
      ),
      /invalid_submission/,
    );
});
test('execute invokes exactly the approved attempt and never retries ambiguous acknowledgments', async () => {
  let calls = 0;
  const result = await executeReply(
    async (command, args) => {
      calls++;
      assert.equal(command, 'execute_reply');
      assert.equal(args.attemptId, attempt.attemptId);
      throw new Error('engine_disconnected');
    },
    session,
    attempt,
  );
  assert.equal(calls, 1);
  assert.equal(result.status, 'uncertain');
  assert.equal(result.error, 'engine_disconnected');
  const sent = { ...attempt, status: 'sent', replyId: id };
  assert.deepEqual(await executeReply(async () => envelope(sent), session, attempt), sent);
  assert.equal(
    (await executeReply(async () => envelope({ ...sent, caseId: id }), session, attempt)).status,
    'uncertain',
  );
  await assert.rejects(
    cancelReply(async () => envelope(sent), session, attempt.attemptId),
    /engine_protocol_error/,
  );
});

test('reply schema paging keeps the current proof and native identifier, with local upload cleanup', async () => {
  const { loadReplySchema } = await import('../frontend/src/reply-sending.js');
  const source = 'ä'.repeat(15000),
    bytes = new TextEncoder().encode(source),
    calls = [];
  const result = await loadReplySchema(
    async (command, args) => {
      calls.push(command);
      if (command === 'begin_content')
        return envelope({ contentId: other, totalBytes: 2, receivedBytes: 0, complete: false });
      if (command === 'append_content')
        return envelope({ contentId: other, totalBytes: 2, receivedBytes: 2, complete: true });
      if (command === 'discard_content') return envelope({ contentId: other });
      assert.equal(args.proofId, proof.proofId);
      let offset = 0;
      if (command === 'load_reply_schema')
        assert.deepEqual(JSON.parse(args.schemaDocument), {
          schemaUri: draft.schemaUri,
          mimeType: draft.mimeType,
          allowExternalSchemas: false,
          schemaContentId: other,
        });
      else {
        assert.equal(command, 'read_reply_schema');
        assert.equal(args.contentId, id);
        offset = args.byteOffset;
      }
      return envelope({
        schemaId: id,
        schemaUri: draft.schemaUri,
        totalBytes: bytes.length,
        byteOffset: offset,
        chunk: Buffer.from(bytes.slice(offset, offset + 12288)).toString('base64'),
      });
    },
    session,
    proof,
    { schemaUri: draft.schemaUri, mimeType: draft.mimeType, allowExternalSchemas: false },
    new Blob(['{}']),
  );
  assert.equal(result.document, source);
  assert.equal(result.schemaId, id);
  assert.equal(calls.at(-1), 'discard_content');
  assert.equal(calls.filter((c) => c === 'read_reply_schema').length, 2);
});
test('reply schema malformed pages, missing consent and failed cleanup cannot authorize a draft', async () => {
  const { loadReplySchema } = await import('../frontend/src/reply-sending.js');
  const selection = { schemaUri: draft.schemaUri, mimeType: draft.mimeType, allowExternalSchemas: true };
  await assert.rejects(
    loadReplySchema(
      async () =>
        envelope({ schemaId: id, schemaUri: 'urn:foreign', totalBytes: 2, byteOffset: 0, chunk: 'e30=' }),
      session,
      proof,
      selection,
    ),
    /engine_protocol_error/,
  );
  await assert.rejects(
    loadReplySchema(() => assert.fail('No consent'), session, proof, {
      ...selection,
      allowExternalSchemas: false,
    }),
    /schema_consent_required/,
  );
  const calls = [];
  const base = preparationInvoke(calls);
  await assert.rejects(
    loadReplySchema(
      async (command, args) => {
        if (command === 'load_reply_schema')
          return envelope({
            schemaId: id,
            schemaUri: draft.schemaUri,
            totalBytes: 2,
            byteOffset: 0,
            chunk: 'e30=',
          });
        if (command === 'discard_content') throw new Error('cleanup');
        return base(command, args);
      },
      session,
      proof,
      selection,
      new Blob(['{}']),
    ),
    /content_cleanup_failed/,
  );
});
