import { requestResource } from './resources.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const fail = () => { throw new Error('engine_protocol_error'); };
const fields = ['attemptId', 'status', 'caseId', 'replyId', 'action', 'eventId', 'error'];
const identities = ['attemptId', 'caseId', 'replyId', 'action'];
const reasons = new Set(['technical-error', 'metadata-encryption-issue', 'data-encryption-issue', 'attachment-encryption-issue', 'data-schema-violation']);
function state(value, expected) {
  if (!exact(value, fields) || !['idle', 'prepared', 'running', 'confirmed', 'failed', 'uncertain', 'cancelled'].includes(value.status)) fail();
  if (value.status === 'idle') {
    if ([...identities, 'eventId', 'error'].some(field => value[field] !== null)) fail();
  } else {
    if (!['attemptId', 'caseId', 'replyId'].every(field => uuid(value[field])) || !['accept', 'reject'].includes(value.action)
        || (value.status === 'confirmed' ? !uuid(value.eventId) : value.eventId !== null)
        || (['failed', 'uncertain'].includes(value.status) ? typeof value.error !== 'string' || !/^[a-z_]{1,64}$/.test(value.error) : value.error !== null)) fail();
  }
  if (expected && identities.some(field => value[field] !== expected[field])) fail();
  return Object.freeze({ ...value });
}
export async function prepareReplyReceipt(invoke, session, draft, proof = null) {
  if (!exact(draft, ['caseId', 'replyId', 'action', 'reason', 'description', 'attachmentId']) || !uuid(draft.caseId) || !uuid(draft.replyId)
      || !['accept', 'reject'].includes(draft.action) || (draft.description !== null && (typeof draft.description !== 'string'
      || draft.description.length > 2048 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(draft.description)))) throw new Error('invalid_input');
  const accept = draft.action === 'accept';
  if (accept ? !proof || !uuid(proof.proofId) || proof.caseId !== draft.caseId || proof.replyId !== draft.replyId
      || draft.reason !== null || draft.description !== null || draft.attachmentId !== null
    : proof !== null || !reasons.has(draft.reason) || (draft.reason === 'attachment-encryption-issue' ? !uuid(draft.attachmentId) : draft.attachmentId !== null)) throw new Error('invalid_input');
  const snapshot = { ...draft, description: draft.description?.trim() ? draft.description : null };
  const warnings = accept ? [...proof.warnings] : [];
  let approved;
  try {
    const value = await requestResource(invoke, session, 'prepare_reply_receipt', {
      receiptDocument: JSON.stringify({ ...snapshot, proofId: accept ? proof.proofId : null }),
    });
    if (!exact(value, ['attempt', 'reason', 'description', 'attachmentId', 'warnings'])) fail();
    approved = state(value.attempt);
    if (approved.status !== 'prepared' || !['caseId', 'replyId', 'action'].every(field => approved[field] === snapshot[field])
        || !['reason', 'description', 'attachmentId'].every(field => value[field] === snapshot[field])
        || JSON.stringify(value.warnings) !== JSON.stringify(warnings)) fail();
    return Object.freeze({ ...value, attempt: approved, warnings: Object.freeze(warnings) });
  } catch (cause) {
    if (approved?.status === 'prepared') {
      try { await cancelReplyReceipt(invoke, session, approved.attemptId); } catch { /* Native expiry keeps the attempt bounded. */ }
    }
    throw cause;
  }
}
export async function executeReplyReceipt(invoke, session, attempt) {
  const expected = state(attempt);
  if (expected.status !== 'prepared') throw new Error('invalid_input');
  try {
    const result = state(await requestResource(invoke, session, 'execute_reply_receipt', { attemptId: expected.attemptId }), expected);
    if (!['confirmed', 'failed', 'uncertain'].includes(result.status)) fail();
    return result;
  } catch (cause) {
    if ((typeof cause === 'string' ? cause : cause?.message) === 'engine_busy') throw cause;
    return Object.freeze({ ...expected, status: 'uncertain', error: 'resource_unavailable' });
  }
}
export async function cancelReplyReceipt(invoke, session, attemptId) {
  if (!uuid(attemptId)) throw new Error('invalid_input');
  const result = state(await requestResource(invoke, session, 'cancel_reply_receipt', { attemptId }));
  if (result.attemptId !== attemptId || result.status !== 'cancelled') fail();
  return result;
}
export async function replyReceiptState(invoke, session) {
  return state(await requestResource(invoke, session, 'reply_receipt_state'));
}
