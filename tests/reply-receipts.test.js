import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReplyReceipt, executeReplyReceipt, cancelReplyReceipt, replyReceiptState } from '../frontend/src/reply-receipts.js';

const id = index => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
const session = { apiVersion: 'v3', sessionId: id(1), environment: 'TEST', connected: true };
const draft = { caseId: id(2), replyId: id(3), action: 'accept', reason: null, description: null, attachmentId: null };
const proof = { proofId: id(4), caseId: draft.caseId, replyId: draft.replyId, warnings: ['MALWARE_SCAN_NOT_CONFIGURED'] };
const attempt = { attemptId: id(5), status: 'prepared', caseId: draft.caseId, replyId: draft.replyId, action: 'accept', eventId: null, error: null };
const prepared = { attempt, reason: null, description: null, attachmentId: null, warnings: proof.warnings };
const envelope = data => ({ apiVersion: session.apiVersion, sessionId: session.sessionId, environment: 'TEST', data });

test('reply accept binds the native proof and immutable choices without sending auth tags or keys', async () => {
  let calls = 0;
  const result = await prepareReplyReceipt(async (command, args) => {
    calls++; assert.equal(command, 'prepare_reply_receipt');
    assert.deepEqual(JSON.parse(args.receiptDocument), { ...draft, proofId: proof.proofId });
    return envelope(prepared);
  }, session, draft, proof);
  assert.equal(calls, 1); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.attempt));
  assert.ok(Object.isFrozen(result.warnings));
  const never = () => assert.fail('Invalid choices reached native code');
  for (const patch of [{ caseId: id(9) }, { replyId: id(9) }, { proofId: 'bad' }])
    await assert.rejects(prepareReplyReceipt(never, session, draft, { ...proof, ...patch }), /invalid_input/);
  await assert.rejects(prepareReplyReceipt(never, session, { ...draft, authenticationTags: {} }, proof), /invalid_input/);
  await assert.rejects(prepareReplyReceipt(never, session, draft), /invalid_input/);
});

test('mismatched preparation is cancelled and does not authorize a later confirmation', async () => {
  for (const patch of [{ replyId: id(9) }, { action: 'reject' }]) {
    const calls = [];
    await assert.rejects(prepareReplyReceipt(async (command) => {
      calls.push(command);
      if (command === 'cancel_reply_receipt') return envelope({ ...attempt, ...patch, status: 'cancelled' });
      return envelope({ ...prepared, attempt: { ...attempt, ...patch } });
    }, session, draft, proof), /engine_protocol_error/);
    assert.deepEqual(calls, ['prepare_reply_receipt', 'cancel_reply_receipt']);
  }
});

test('reject omits proof and validates supported reasons and attachment selection', async () => {
  const reject = { ...draft, action: 'reject', reason: 'technical-error', description: '  ' };
  const result = await prepareReplyReceipt(async (_, args) => {
    assert.deepEqual(JSON.parse(args.receiptDocument), { ...reject, description: null, proofId: null });
    return envelope({ ...prepared, attempt: { ...attempt, action: 'reject' }, reason: 'technical-error', warnings: [] });
  }, session, reject);
  assert.equal(result.attempt.action, 'reject');
  const never = () => assert.fail('Invalid reject reached native code');
  for (const patch of [{ reason: 'unknown' }, { reason: 'attachment-encryption-issue' }, { attachmentId: id(8) }, { description: 'bad\0' }])
    await assert.rejects(prepareReplyReceipt(never, session, { ...reject, ...patch }), /invalid_input/);
});

test('confirmation checks exact receipt identity and keeps lost or unverified outcomes uncertain', async () => {
  const confirmed = { ...attempt, status: 'confirmed', eventId: id(6) };
  const result = await executeReplyReceipt(async (command, args) => {
    assert.equal(command, 'execute_reply_receipt'); assert.equal(args.attemptId, attempt.attemptId);
    return envelope(confirmed);
  }, session, attempt);
  assert.equal(result.status, 'confirmed');
  for (const response of [{ ...confirmed, replyId: id(9) }, { ...confirmed, eventId: null }])
    assert.equal((await executeReplyReceipt(async () => envelope(response), session, attempt)).status, 'uncertain');
  assert.equal((await executeReplyReceipt(async () => { throw new Error('engine_timeout'); }, session, attempt)).status, 'uncertain');
  await assert.rejects(executeReplyReceipt(async () => { throw new Error('engine_busy'); }, session, attempt), /engine_busy/);
  await assert.rejects(executeReplyReceipt(() => assert.fail('Duplicate write'), session, confirmed), /invalid_input/);
});

test('cancellation and state enforce native protocol and single attempt identity', async () => {
  assert.equal((await cancelReplyReceipt(async () => envelope({ ...attempt, status: 'cancelled' }), session, attempt.attemptId)).status, 'cancelled');
  await assert.rejects(cancelReplyReceipt(async () => envelope({ ...attempt, status: 'cancelled', attemptId: id(9) }), session, attempt.attemptId), /engine_protocol_error/);
  assert.equal((await replyReceiptState(async () => envelope({ attemptId: null, status: 'idle', caseId: null, replyId: null, action: null, eventId: null, error: null }), session)).status, 'idle');
});
