import { requestResource } from './resources.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw new Error('engine_protocol_error'); };
const fields = ['destinationId', 'submissionId', 'caseId', 'action', 'signingKid', 'reason', 'description', 'attachmentId'];
const stateFields = ['attemptId', 'status', 'action', 'destinationId', 'submissionId', 'caseId', 'signingKid', 'error'];
const reasons = new Set(['technical-error', 'metadata-encryption-issue', 'data-encryption-issue', 'attachment-encryption-issue', 'data-schema-violation']);
const errors = new Set(['authentication_failed', 'auth_unavailable', 'endpoint_blocked', 'session_missing', 'invalid_credentials', 'invalid_resource',
  'resource_denied', 'resource_missing', 'resource_unavailable', 'key_rejected', 'key_missing', 'test_certificate_required', 'invalid_input',
  'content_limit', 'verification_failed', 'schema_unavailable', 'send_locked', 'invalid_submission', 'confirmation_expired']);
const identity = ['attemptId', 'action', 'destinationId', 'submissionId', 'caseId', 'signingKid'];
const kid = value => typeof value === 'string' && value.trim() !== '' && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value);
const warnings = value => Array.isArray(value) && value.length <= 16 && new Set(value).size === value.length
  && value.every(item => typeof item === 'string' && /^[A-Z_]{1,64}$/.test(item));

function state(value, expected) {
  if (!exact(value, stateFields) || !['idle', 'prepared', 'running', 'confirmed', 'failed', 'uncertain', 'cancelled'].includes(value.status)
      || (value.error !== null && !errors.has(value.error))) fail();
  if (value.status === 'idle') {
    if (identity.some(field => value[field] !== null) || value.error !== null) fail();
  } else if (!uuid(value.attemptId) || !['accept', 'reject'].includes(value.action) || !kid(value.signingKid)
      || !['destinationId', 'submissionId', 'caseId'].every(field => uuid(value[field]))
      || (['failed', 'uncertain'].includes(value.status) ? value.error === null : value.error !== null)) fail();
  if (expected && identity.some(field => value[field] !== expected[field])) fail();
  return Object.freeze({ ...value });
}

export async function prepareReceipt(invoke, session, draft, proof = null) {
  if (!exact(draft, fields) || !['destinationId', 'submissionId', 'caseId'].every(field => uuid(draft[field]))
      || !['accept', 'reject'].includes(draft.action) || (draft.signingKid !== null && !kid(draft.signingKid))
      || (draft.description !== null && (typeof draft.description !== 'string' || draft.description.length > 2048 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(draft.description))))
    throw new Error('invalid_input');
  const accept = draft.action === 'accept';
  if (accept ? draft.reason !== null || draft.description !== null || draft.attachmentId !== null || !proof || !uuid(proof.proofId)
      || !['destinationId', 'submissionId', 'caseId'].every(field => proof[field] === draft[field]) || !warnings(proof.warnings)
    : proof !== null || !reasons.has(draft.reason) || (draft.reason === 'attachment-encryption-issue' ? !uuid(draft.attachmentId) : draft.attachmentId !== null))
    throw new Error('invalid_input');
  const snapshot = { ...draft, description: draft.description !== null && !draft.description.trim() ? null : draft.description };
  const active = { ...session };
  const expectedWarnings = accept ? [...proof.warnings] : [];
  const receiptDocument = JSON.stringify({ ...snapshot, proofId: accept ? proof.proofId : null });
  if (new TextEncoder().encode(receiptDocument).length > 16384) throw new Error('invalid_input');
  let approved;
  try {
    const result = await requestResource(invoke, active, 'prepare_receipt', { receiptDocument });
    if (!exact(result, ['attempt', 'reason', 'description', 'attachmentId', 'warnings'])) fail();
    approved = state(result.attempt);
    if (approved.status !== 'prepared' || !['destinationId', 'submissionId', 'caseId', 'action'].every(field => approved[field] === snapshot[field])
        || (snapshot.signingKid !== null && approved.signingKid !== snapshot.signingKid)
        || !['reason', 'description', 'attachmentId'].every(field => result[field] === snapshot[field])
        || !warnings(result.warnings) || JSON.stringify(result.warnings) !== JSON.stringify(expectedWarnings)) fail();
    return Object.freeze({ ...result, attempt: approved, warnings: Object.freeze([...result.warnings]) });
  } catch (error) {
    if (approved?.status === 'prepared') {
      try { await cancelReceipt(invoke, active, approved.attemptId); } catch { /* Expiry remains native if cancellation cannot complete. */ }
    }
    throw error;
  }
}

export async function executeReceipt(invoke, session, prepared) {
  const expected = state(prepared);
  if (expected.status !== 'prepared') throw new Error('invalid_input');
  try {
    const result = state(await requestResource(invoke, session, 'execute_receipt', { attemptId: expected.attemptId }), expected);
    if (!['confirmed', 'failed', 'uncertain'].includes(result.status)) fail();
    return result;
  } catch (error) {
    const code = typeof error === 'string' ? error : error?.message;
    if (code === 'engine_busy') throw error;
    return Object.freeze({ ...expected, status: 'uncertain', error: ['engine_timeout', 'engine_disconnected', 'engine_protocol_error', 'engine_start_failed'].includes(code)
      ? code : 'resource_unavailable' });
  }
}

export async function cancelReceipt(invoke, session, attemptId) {
  if (!uuid(attemptId)) throw new Error('invalid_input');
  const result = state(await requestResource(invoke, session, 'cancel_receipt', { attemptId }));
  if (result.attemptId !== attemptId || result.status !== 'cancelled') fail();
  return result;
}

export async function receiptState(invoke, session) {
  return state(await requestResource(invoke, session, 'receipt_state'));
}
