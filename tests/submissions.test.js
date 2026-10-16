import test from 'node:test';
import assert from 'node:assert/strict';
import { listSubmissions, loadSubmission } from '../frontend/src/submissions.js';

const destination = '11111111-1111-4111-8111-111111111111';
const submission = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';
const session = { apiVersion: 'v2', sessionId: destination, connected: true, environment: 'TEST' };
const envelope = (data, active = session) => ({ apiVersion: active.apiVersion, sessionId: active.sessionId, environment: 'TEST', data });
const detail = { destinationId: destination, fromDestinationId: null, submissionId: submission, caseId, attachments: [],
  serviceIdentifier: null, serviceName: null, region: null, processModelId: null, messageId: null, metadataAvailable: true, dataAvailable: true };

test('both API versions read paginated pickup identities through the current native session', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const value = await listSubmissions(async (command, args) => {
      assert.equal(command, 'list_submissions');
      assert.deepEqual(args, { apiVersion, sessionId: destination, destinationId: destination, offset: 20 });
      return envelope({ offset: 20, totalCount: 21, submissions: [{ destinationId: destination, submissionId: submission, caseId }] }, active);
    }, active, destination, 20);
    assert.equal(value.submissions[0].submissionId, submission);
  }
});

test('detail stays bound to destination and submission and never accepts ciphertext or a verification claim', async () => {
  assert.deepEqual(await loadSubmission(async () => envelope(detail), session, destination, submission), detail);
  for (const patch of [{ destinationId: caseId }, { submissionId: caseId }, { encryptedData: 'synthetic' }, { verified: true },
    { attachments: [caseId, caseId] }, { metadataAvailable: 'yes' }, { processModelId: 'urn:test:process' }])
    await assert.rejects(loadSubmission(async () => envelope({ ...detail, ...patch }), session, destination, submission), /engine_protocol_error/);
});

test('duplicate pickup IDs and inconsistent pages fail closed without OAuth or write commands', async () => {
  const row = { destinationId: destination, submissionId: submission, caseId: null };
  for (const data of [{ offset: 0, totalCount: 2, submissions: [row, row] }, { offset: 0, totalCount: 1, submissions: [] },
    { offset: 20, totalCount: 21, submissions: [row] }, { offset: 0, totalCount: 1, submissions: [{ ...row, destinationId: caseId }] }])
    await assert.rejects(listSubmissions(async command => { assert.equal(command, 'list_submissions'); return envelope(data); }, session, destination), /engine_protocol_error/);
});

test('bad IDs or offsets are rejected before crossing the native boundary', async () => {
  const invoke = () => assert.fail('Invalid input cannot invoke native code');
  await assert.rejects(listSubmissions(invoke, session, 'bad'), /invalid_input/);
  await assert.rejects(listSubmissions(invoke, session, destination, 1), /invalid_input/);
  await assert.rejects(loadSubmission(invoke, session, destination, 'bad'), /invalid_input/);
});
