import test from 'node:test';
import assert from 'node:assert/strict';
import { runMessageBatch } from '../frontend/src/message-batch.js';
const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const session = { apiVersion: 'v3', sessionId: id(1), environment: 'TEST', connected: true };
function fixture(settings = {}) {
  const calls = [],
    outcomes = [];
  let active,
    attempt,
    current = true;
  const envelope = (data) => ({
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
    environment: session.environment,
    data,
  });
  const parts = [
    {
      contentId: id(10),
      kind: 'metadata',
      attachmentId: null,
      fileName: 'Metadaten.json',
      mimeType: 'application/json',
      description: null,
      totalBytes: 2,
    },
    {
      contentId: id(11),
      kind: 'data',
      attachmentId: null,
      fileName: 'Fachdaten.json',
      mimeType: settings.mime || 'application/json',
      description: null,
      totalBytes: 2,
    },
    {
      contentId: id(12),
      kind: 'attachment',
      attachmentId: id(13),
      fileName: 'Anlage.bin',
      mimeType: 'application/octet-stream',
      description: null,
      totalBytes: 2,
    },
  ];
  const invoke = async (command, args) => {
    calls.push({ command, ...args });
    if (command === 'load_submission')
      return envelope({
        destinationId: id(2),
        fromDestinationId: null,
        submissionId: args.submissionId,
        caseId: id(4),
        attachments: [id(13)],
        serviceIdentifier: null,
        serviceName: null,
        region: null,
        processModelId: null,
        messageId: null,
        metadataAvailable: true,
        dataAvailable: true,
      });
    if (command === 'verify_submission' || command === 'verify_reply') {
      active = args.submissionId || args.replyId;
      if (active === settings.schemaError) throw settings.checkError || 'data_schema_invalid';
      const common = {
        proofId: id(9),
        caseId: id(4),
        partCount: 3,
        warningCount: (settings.warnings || []).length,
        warnings: settings.warnings || [],
      };
      return envelope(
        command === 'verify_reply'
          ? { ...common, replyId: active, channelAttemptId: id(5), senderDestinationId: id(2) }
          : { ...common, destinationId: id(2), submissionId: active },
      );
    }
    if (command === 'list_received_contents' || command === 'list_received_reply_contents')
      return envelope({
        proofId: id(9),
        offset: args.offset,
        total: 3,
        parts: parts.slice(args.offset, args.offset + 2),
      });
    if (command === 'export_message') {
      if (settings.saveError) throw 'export_failed';
      if (settings.stopAfterSave) current = false;
      return {
        directory: `/selected/Einreichung-${active}`,
        fileCount: settings.incompleteSave ? 2 : 3,
        totalBytes: 6,
      };
    }
    if (command === 'prepare_receipt') {
      const draft = JSON.parse(args.receiptDocument);
      attempt = {
        attemptId: id(20),
        status: 'prepared',
        action: 'accept',
        destinationId: id(2),
        submissionId: active,
        caseId: id(4),
        signingKid: draft.signingKid,
        error: null,
      };
      return envelope({
        attempt,
        reason: null,
        description: null,
        attachmentId: null,
        warnings: settings.warnings || [],
      });
    }
    if (command === 'execute_receipt')
      return envelope({
        ...attempt,
        status: settings.uncertain ? 'uncertain' : 'confirmed',
        error: settings.uncertain ? 'resource_unavailable' : null,
      });
    if (command === 'cancel_receipt') return envelope({ ...attempt, status: 'cancelled' });
    if (command === 'discard_received' || command === 'discard_received_reply')
      return envelope({ proofId: id(9) });
    throw new Error(`Unexpected command: ${command}`);
  };
  return {
    calls,
    outcomes,
    options: {
      invoke,
      session,
      items: [{ submissionId: id(3) }, { submissionId: id(6) }],
      destinationId: id(2),
      exportId: 'export-0000000000000001',
      accept: true,
      signingKid: 'sign-key',
      allowNoScanner: false,
      schemas: () => [],
      allowExternalSchemas: () => false,
      requestSchemas: async () => false,
      current: () => current,
      onProgress: () => {},
      onOutcome: (value) => outcomes.push(value),
    },
  };
}
test('a batch verifies and saves exact messages before acceptance, while schema failures stay manual', async () => {
  const f = fixture({ schemaError: id(6) });
  const results = await runMessageBatch(f.options);
  assert.deepEqual(
    results.map((row) => row.status),
    ['accepted', 'manual'],
  );
  assert.equal(results[1].error, 'data_schema_invalid');
  assert.equal(f.outcomes.length, 1);
  const commands = f.calls.map((row) => row.command);
  assert.ok(commands.indexOf('export_message') < commands.indexOf('prepare_receipt'));
  assert.equal(commands.filter((command) => command === 'execute_receipt').length, 1);
  assert.equal(f.calls.find((row) => row.command === 'export_message').source.messageId, id(3));
});
test('failed saving and a cancellation after saving cannot acknowledge receipt', async () => {
  for (const settings of [{ saveError: true }, { stopAfterSave: true }, { incompleteSave: true }]) {
    const f = fixture(settings);
    const results = await runMessageBatch(f.options);
    assert.ok(results.length > 0);
    assert.equal(
      f.calls.some((row) => row.command === 'prepare_receipt' || row.command === 'execute_receipt'),
      false,
    );
    assert.equal(
      f.calls.some((row) => row.command === 'discard_received'),
      true,
    );
  }
});

test('technical errors leave each affected message manual and never prepare an automatic rejection', async () => {
  for (const checkError of [
    'data_schema_invalid',
    'verification_failed',
    'schema_unavailable',
    'key_missing',
  ]) {
    const f = fixture({ schemaError: id(6), checkError });
    const results = await runMessageBatch(f.options);
    assert.equal(results[1].status, 'manual');
    assert.equal(results[1].error, checkError);
    assert.equal(results[1].saved, null);
    assert.equal(f.calls.filter((c) => c.command === 'execute_receipt').length, 1);
    const receipts = f.calls
      .filter((c) => c.command === 'prepare_receipt')
      .map((c) => JSON.parse(c.receiptDocument));
    assert.ok(receipts.every((draft) => draft.action === 'accept' && draft.submissionId !== id(6)));
  }
});
test('only expressly allowed absence of a malware scan can pass, other warnings stay manual', async () => {
  for (const [warnings, allow, accepted] of [
    [['MALWARE_SCAN_NOT_CONFIGURED'], false, false],
    [['MALWARE_SCAN_NOT_CONFIGURED'], true, true],
    [['XML_SCHEMA_NOT_CHECKED'], true, false],
    [['DATA_SCHEMA_INVALID'], true, false],
    [['MALWARE_SCAN_NOT_CONFIGURED', 'DATA_SCHEMA_INVALID'], true, false],
    [['OTHER_CHECK_OPEN'], true, false],
  ]) {
    const f = fixture({ warnings });
    f.options.allowNoScanner = allow;
    const results = await runMessageBatch(f.options);
    assert.equal(
      results.every((row) => row.status === 'accepted'),
      accepted,
    );
    assert.equal(
      f.calls.some((row) => row.command === 'execute_receipt'),
      accepted,
    );
    assert.equal(
      results.every((row) => row.saved),
      true,
    );
  }
});
test('an uncertain acknowledgement stops the batch without retrying or accepting another message', async () => {
  const f = fixture({ uncertain: true });
  const results = await runMessageBatch(f.options);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'uncertain');
  assert.equal(f.outcomes[0].status, 'uncertain');
  assert.equal(f.calls.filter((row) => row.command === 'execute_receipt').length, 1);
});
test('reply batches export reply content without sending any receipt', async () => {
  const f = fixture();
  f.options.reply = true;
  f.options.accept = false;
  f.options.items = [{ replyId: id(3), caseId: id(4) }];
  const result = await runMessageBatch(f.options);
  assert.equal(result[0].status, 'saved');
  assert.equal(f.calls.find((row) => row.command === 'export_message').source.reply, true);
  assert.equal(
    f.calls.some((row) => row.command.startsWith('execute_')),
    false,
  );
});
