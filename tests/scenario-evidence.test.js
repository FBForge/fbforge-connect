import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scenarioFrom, scenarioSteps } from '../frontend/src/integration/scenarios/model.ts';
import { startRun } from '../frontend/src/integration/scenarios/runs.ts';
import { verifyRecord } from '../frontend/src/integration/scenarios/verification.ts';
const pack = JSON.parse(
  await readFile(new URL('../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
);
test('evidence checks every attachment byte, name, MIME type and count in the selected case', async () => {
  const definition = scenarioFrom(pack);
  const run = await startRun(definition, definition.variants[0].id, 'TEST', {
    apiVersion: 'v3',
    senderProfileId: '',
    receiverProfileId: '',
    sourceDestination: '',
    receiverDestination: '',
  });
  const session = { sessionId: crypto.randomUUID(), apiVersion: 'v3', environment: 'TEST', connected: true };
  const record = {
    recordId: crypto.randomUUID(),
    caseId: crypto.randomUUID(),
    submissionId: crypto.randomUUID(),
    replyId: null,
    kind: 'submission',
    direction: 'sent',
    status: 'sent',
    createdAt: new Date().toISOString(),
    destinationId: crypto.randomUUID(),
    warnings: [],
    available: true,
  };
  const message = run.pack.cases[0].request;
  const data = new TextEncoder().encode(message.data),
    attachment = Uint8Array.from(atob(message.attachments[0].base64), (c) => c.charCodeAt(0));
  const parts = [
    {
      contentId: crypto.randomUUID(),
      kind: 'data',
      fileName: 'data.json',
      mimeType: 'application/json',
      totalBytes: data.length,
    },
    {
      contentId: crypto.randomUUID(),
      kind: 'attachment',
      fileName: message.attachments[0].fileName,
      mimeType: message.attachments[0].mimeType,
      totalBytes: attachment.length,
    },
  ];
  for (const variant of [
    'clean',
    'wrong-data-type',
    'wrong-name',
    'wrong-type',
    'wrong-bytes',
    'missing',
    'extra',
  ]) {
    const chosen = structuredClone(parts);
    if (variant === 'wrong-data-type') chosen[0].mimeType = 'application/xml';
    if (variant === 'wrong-name') chosen[1].fileName = 'other.txt';
    if (variant === 'wrong-type') chosen[1].mimeType = 'application/pdf';
    if (variant === 'missing') chosen.pop();
    if (variant === 'extra')
      chosen.push({ ...chosen[1], contentId: crypto.randomUUID(), fileName: 'extra.txt' });
    const invoke = async (command, args) => {
      assert.equal(command, 'case_workspace');
      const bytes =
        args.contentId === parts[0].contentId
          ? data
          : variant === 'wrong-bytes'
            ? new Uint8Array(attachment.length)
            : attachment;
      return {
        apiVersion: session.apiVersion,
        sessionId: session.sessionId,
        environment: session.environment,
        data:
          args.operation === 'parts'
            ? {
                recordId: record.recordId,
                offset: args.offset,
                total: chosen.length,
                parts: chosen.slice(args.offset, args.offset + 2),
              }
            : {
                recordId: record.recordId,
                contentId: args.contentId,
                byteOffset: 0,
                totalBytes: bytes.length,
                chunk: btoa(String.fromCharCode(...bytes)),
                complete: true,
              },
      };
    };
    const result = await verifyRecord(invoke, session, run, scenarioSteps(definition)[0], record, () => true);
    assert.equal(result.passed, variant === 'clean', variant);
    if (variant === 'clean') assert.equal(result.observedData, message.data);
  }
});
