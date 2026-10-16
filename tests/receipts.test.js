import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReceipt, executeReceipt, cancelReceipt, receiptState } from '../frontend/src/receipts.js';

const id = n => `${n.toString().padStart(8, '0')}-1111-4111-8111-111111111111`;
const session = { apiVersion: 'v2', sessionId: id(1), environment: 'TEST', connected: true };
const draft = { destinationId: id(2), submissionId: id(3), caseId: id(4), action: 'reject', signingKid: null,
  reason: 'technical-error', description: null, attachmentId: null };
const attempt = { attemptId: id(5), status: 'prepared', action: 'reject', destinationId: id(2), submissionId: id(3), caseId: id(4), signingKid: 'synthetic-sign', error: null };
const envelope = (data, active = session) => ({ apiVersion: active.apiVersion, sessionId: active.sessionId, environment: 'TEST', data });
const preparation = { attempt, reason: draft.reason, description: null, attachmentId: null, warnings: [] };

test('receipt preparation for both APIs only signs and returns an immutable matching public summary', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion }; const calls = [];
    const result = await prepareReceipt(async (command, args) => {
      calls.push(command); assert.equal(command, 'prepare_receipt'); assert.equal(args.apiVersion, apiVersion);
      assert.deepEqual(JSON.parse(args.receiptDocument), { ...draft, proofId: null });
      return envelope(preparation, active);
    }, active, draft);
    assert.deepEqual(result, preparation); assert.ok(Object.isFrozen(result.attempt)); assert.deepEqual(calls, ['prepare_receipt']);
  }
});

test('accept needs the exact received proof and preserves all native warning notices', async () => {
  const accept = { ...draft, action: 'accept', reason: null };
  const proof = { proofId: id(6), destinationId: id(2), submissionId: id(3), caseId: id(4), warnings: ['MALWARE_SCAN_NOT_CONFIGURED'] };
  const result = await prepareReceipt(async (command, args) => {
    assert.equal(JSON.parse(args.receiptDocument).proofId, proof.proofId);
    return envelope({ ...preparation, attempt: { ...attempt, action: 'accept' }, reason: null, warnings: proof.warnings });
  }, session, accept, proof);
  assert.deepEqual(result.warnings, proof.warnings);
  await assert.rejects(prepareReceipt(() => assert.fail('No native call'), session, accept, { ...proof, caseId: id(9) }), /invalid_input/);
});

test('mismatched native confirmation cancels a known prepared attempt before exposing it', async () => {
  const calls = [];
  await assert.rejects(prepareReceipt(async command => {
    calls.push(command);
    return envelope(command === 'prepare_receipt' ? { ...preparation, reason: 'metadata-encryption-issue' } : { ...attempt, status: 'cancelled' });
  }, session, draft), /engine_protocol_error/);
  assert.deepEqual(calls, ['prepare_receipt', 'cancel_receipt']);
});

test('execution invokes the exact attempt once, preserving known identities on acknowledgement loss', async () => {
  let calls = 0;
  const lost = await executeReceipt(async (command, args) => {
    calls++; assert.equal(command, 'execute_receipt'); assert.equal(args.attemptId, attempt.attemptId); throw new Error('engine_disconnected');
  }, session, attempt);
  assert.equal(calls, 1); assert.equal(lost.status, 'uncertain'); assert.equal(lost.submissionId, draft.submissionId); assert.equal(lost.caseId, draft.caseId);
  const confirmed = await executeReceipt(async () => envelope({ ...attempt, status: 'confirmed' }), session, attempt);
  assert.equal(confirmed.status, 'confirmed');
  await assert.rejects(executeReceipt(async () => { throw new Error('engine_busy'); }, session, attempt), /engine_busy/);
});

test('foreign identities, wrong environment and private fields cannot report a successful receipt', async () => {
  for (const value of [envelope({ ...attempt, status: 'confirmed', caseId: id(9) }), envelope({ ...attempt, status: 'confirmed', jwt: 'private' }),
    { ...envelope({ ...attempt, status: 'confirmed' }), environment: 'PROD' }, { ...envelope({ ...attempt, status: 'confirmed' }), apiVersion: 'v3' }]) {
    const result = await executeReceipt(async () => value, session, attempt);
    assert.equal(result.status, 'uncertain'); assert.equal(result.error, 'engine_protocol_error'); assert.equal(result.caseId, draft.caseId);
  }
  await assert.rejects(prepareReceipt(() => assert.fail('No native call'), { ...session, environment: 'PROD' }, draft), /session_missing/);
  await assert.rejects(prepareReceipt(() => assert.fail('No native call'), session, { ...draft, jwt: 'not allowed' }), /invalid_input/);
});

test('cancel and status accept only coherent native receipt states', async () => {
  assert.equal((await cancelReceipt(async () => envelope({ ...attempt, status: 'cancelled' }), session, attempt.attemptId)).status, 'cancelled');
  const idle = { attemptId: null, status: 'idle', action: null, destinationId: null, submissionId: null, caseId: null, signingKid: null, error: null };
  assert.deepEqual(await receiptState(async () => envelope(idle), session), idle);
  await assert.rejects(receiptState(async () => envelope({ ...attempt, status: 'confirmed', error: 'untrusted error text' }), session), /engine_protocol_error/);
});
