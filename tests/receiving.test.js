import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifySubmission,
  verifyReply,
  listReceivedContents,
  readReceivedChunk,
  readReceivedFile,
  discardReceived,
} from '../frontend/src/receiving.js';

const destination = '11111111-1111-4111-8111-111111111111',
  submission = '22222222-2222-4222-8222-222222222222';
const proofId = '33333333-3333-4333-8333-333333333333',
  contentId = '44444444-4444-4444-8444-444444444444';
const session = { apiVersion: 'v2', sessionId: destination, connected: true, environment: 'TEST' };
const proof = {
  proofId,
  destinationId: destination,
  submissionId: submission,
  caseId: destination,
  partCount: 2,
  warningCount: 1,
  warnings: ['MALWARE_SCAN_NOT_CONFIGURED'],
};
const part = {
  contentId,
  kind: 'data',
  attachmentId: null,
  fileName: 'fachdaten.json',
  mimeType: 'application/json',
  description: null,
  totalBytes: 3,
};
const envelope = (data, active = session) => ({
  apiVersion: active.apiVersion,
  sessionId: active.sessionId,
  environment: 'TEST',
  data,
});
const chunk = { proofId, contentId, byteOffset: 0, totalBytes: 3, chunk: 'AQID', complete: true };

test('v2 and v3 verification use only the current native TEST session and bound schema handles', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const result = await verifySubmission(
      async (command, args) => {
        assert.equal(command, 'verify_submission');
        assert.deepEqual(args, {
          apiVersion,
          sessionId: destination,
          destinationId: destination,
          submissionId: submission,
          schemaDocument: JSON.stringify({ schemas: [{ uri: 'urn:test:schema', contentId }] }),
        });
        return envelope(proof, active);
      },
      active,
      destination,
      submission,
      [{ uri: 'urn:test:schema', contentId }],
    );
    assert.equal(result.proofId, proofId);
    assert.ok(Object.isFrozen(result.warnings));
  }
});
test('foreign identities, plaintext in summaries and inconsistent warnings fail closed', async () => {
  for (const patch of [
    { destinationId: submission },
    { submissionId: destination },
    { metadata: '{}' },
    { partCount: 42 },
    { warnings: [] },
    { warnings: ['<img src=x>'] },
    { warningCount: 0 },
    { warnings: ['A', 'A'] },
  ])
    await assert.rejects(
      verifySubmission(async () => envelope({ ...proof, ...patch }), session, destination, submission),
      /engine_protocol_error/,
    );
});
test('paged content descriptors preserve attachment descriptions and reject mixed proofs', async () => {
  const metadata = { ...part, kind: 'metadata', fileName: 'metadata.json' };
  const dataPart = { ...part, contentId: submission };
  const page = { proofId, offset: 0, total: 2, parts: [metadata, dataPart] };
  assert.equal(
    (await listReceivedContents(async () => envelope(page), session, proof)).parts[1].kind,
    'data',
  );
  for (const patch of [
    { proofId: submission },
    { offset: 2 },
    { total: 3 },
    { parts: [metadata, metadata] },
    { parts: [{ ...metadata, totalBytes: 3 * 1024 * 1024 }, dataPart] },
  ])
    await assert.rejects(
      listReceivedContents(async () => envelope({ ...page, ...patch }), session, proof),
      /engine_protocol_error/,
    );
  const attachment = {
    ...part,
    kind: 'attachment',
    attachmentId: destination,
    description: 'Synthetische Beschreibung',
  };
  const last = await listReceivedContents(
    async () => envelope({ proofId, offset: 2, total: 3, parts: [attachment] }),
    session,
    { ...proof, partCount: 3 },
    2,
  );
  assert.equal(last.parts[0].description, attachment.description);
});
test('chunk reads enforce canonical base64, exact offsets, identity, length and completion', async () => {
  assert.deepEqual(
    await readReceivedChunk(async () => envelope(chunk), session, proofId, part, 0),
    new Uint8Array([1, 2, 3]),
  );
  for (const patch of [
    { proofId: submission },
    { contentId: destination },
    { byteOffset: 1 },
    { totalBytes: 4 },
    { chunk: 'AQI=' },
    { chunk: 'AQID\n' },
    { complete: false },
  ])
    await assert.rejects(
      readReceivedChunk(async () => envelope({ ...chunk, ...patch }), session, proofId, part, 0),
      /engine_protocol_error/,
    );
});
test('file reading uses bounded chunks and an aborted late response cannot restore content', async () => {
  const bytes = new Uint8Array(24 * 1024 + 5).fill(7);
  let calls = 0;
  const result = await readReceivedFile(
    async (command, args) => {
      assert.equal(command, 'read_received_content');
      calls++;
      const slice = bytes.slice(args.byteOffset, args.byteOffset + 24 * 1024);
      return envelope({
        ...chunk,
        totalBytes: bytes.length,
        byteOffset: args.byteOffset,
        chunk: btoa(String.fromCharCode(...slice)),
        complete: args.byteOffset + slice.length === bytes.length,
      });
    },
    session,
    proofId,
    { ...part, totalBytes: bytes.length },
  );
  assert.deepEqual(result, bytes);
  assert.equal(calls, 2);
  const controller = new AbortController();
  await assert.rejects(
    readReceivedFile(
      async () => {
        controller.abort();
        return envelope(chunk);
      },
      session,
      proofId,
      part,
      { signal: controller.signal },
    ),
    /content_cancelled/,
  );
});
test('discard targets exactly one proof and malformed inputs never invoke native code', async () => {
  await discardReceived(
    async (command, args) => {
      assert.equal(command, 'discard_received');
      assert.equal(args.proofId, proofId);
      return envelope({ proofId });
    },
    session,
    proofId,
  );
  const never = () => assert.fail('Invalid input crossed native boundary');
  await assert.rejects(verifySubmission(never, session, 'bad', submission), /invalid_input/);
  await assert.rejects(
    verifySubmission(never, session, destination, submission, [{ uri: 'urn:test:x', contentId: 'path' }]),
    /invalid_input/,
  );
  await assert.rejects(listReceivedContents(never, session, proof, 1), /invalid_input/);
  await assert.rejects(readReceivedChunk(never, session, proofId, part, 4), /invalid_input/);
  await assert.rejects(
    discardReceived(async () => envelope({ proofId: submission }), session, proofId),
    /engine_protocol_error/,
  );
});

test('reply verification binds case, reply and channel to the active TEST API without submission authority', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const replyProof = {
      proofId,
      replyId: submission,
      caseId: destination,
      channelAttemptId: contentId,
      senderDestinationId: apiVersion === 'v3' ? submission : null,
      partCount: 2,
      warningCount: 0,
      warnings: [],
    };
    const result = await verifyReply(
      async (command, args) => {
        assert.equal(command, 'verify_reply');
        assert.deepEqual(args, {
          apiVersion,
          sessionId: destination,
          caseId: destination,
          replyId: submission,
          schemaDocument: '{"schemas":[]}',
        });
        return envelope(replyProof, active);
      },
      active,
      destination,
      submission,
    );
    assert.equal(result.channelAttemptId, contentId);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.warnings));
    for (const patch of [
      { replyId: destination },
      { caseId: submission },
      { channelAttemptId: 'path' },
      { senderDestinationId: 'bad' },
      { submissionId: submission },
      { privateKey: {} },
      { data: 'plaintext' },
      { partCount: 42 },
      { warningCount: 1, warnings: [] },
    ])
      await assert.rejects(
        verifyReply(
          async () => envelope({ ...replyProof, ...patch }, active),
          active,
          destination,
          submission,
        ),
        /engine_protocol_error/,
      );
  }
});

test('reply content uses only separate reply commands while preserving bounded preview and discard contracts', async () => {
  const commands = [];
  const replyProof = { proofId, partCount: 2 };
  const metadata = { ...part, contentId: submission, kind: 'metadata', fileName: 'metadata.json' };
  const invoke = async (command, args) => {
    commands.push(command);
    assert.equal(args.proofId, proofId);
    return envelope(
      command === 'list_received_reply_contents'
        ? { proofId, offset: 0, total: 2, parts: [metadata, part] }
        : command === 'read_received_reply_content'
          ? chunk
          : { proofId },
    );
  };
  await listReceivedContents(invoke, session, replyProof, 0, true);
  assert.deepEqual(
    await readReceivedFile(invoke, session, proofId, part, { reply: true }),
    new Uint8Array([1, 2, 3]),
  );
  await discardReceived(invoke, session, proofId, true);
  assert.deepEqual(commands, [
    'list_received_reply_contents',
    'read_received_reply_content',
    'discard_received_reply',
  ]);
});

test('reply verification rejects invalid local identities or catalog before IPC and mixed native sessions afterwards', async () => {
  const never = async () => assert.fail('Invalid input must not cross IPC');
  await assert.rejects(verifyReply(never, session, 'bad', submission), /invalid_input/);
  await assert.rejects(
    verifyReply(never, session, destination, submission, [{ uri: 'urn:test:x', contentId: '/file' }]),
    /invalid_input/,
  );
  const value = {
    proofId,
    replyId: submission,
    caseId: destination,
    channelAttemptId: contentId,
    senderDestinationId: null,
    partCount: 2,
    warningCount: 0,
    warnings: [],
  };
  await assert.rejects(
    verifyReply(
      async () => envelope(value, { ...session, sessionId: submission }),
      session,
      destination,
      submission,
    ),
    /engine_protocol_error/,
  );
  await assert.rejects(
    verifyReply(async () => ({ ...envelope(value), environment: 'PROD' }), session, destination, submission),
    /engine_protocol_error/,
  );
});

test('external schema permission is explicit and does not silently become the default', async () => {
  for (const allowed of [false, true])
    await verifySubmission(
      async (command, args) => {
        assert.equal(JSON.parse(args.schemaDocument).allowExternalSchemas === true, allowed);
        return envelope(proof);
      },
      session,
      destination,
      submission,
      [],
      allowed,
    );
  await assert.rejects(
    verifySubmission(
      () => assert.fail('Invalid consent reached native code'),
      session,
      destination,
      submission,
      [],
      'true',
    ),
    /invalid_input/,
  );
});
