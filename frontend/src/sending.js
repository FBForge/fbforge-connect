import { cancelledProductionAction } from './environments.js';
import { requestResource, sameJsonValue } from './resources.js';
import { uploadContent, discardContent, CONTENT_FILE_BYTES } from './content.js';

const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const fail = () => {
  throw new Error('engine_protocol_error');
};
const errors = new Set([
  'test_certificate_required',
  'invalid_submission',
  'reply_metadata_required',
  'data_format_invalid',
  'endpoint_blocked',
  'resource_denied',
  'resource_missing',
  'invalid_resource',
  'content_limit',
  'resource_unavailable',
  'confirmation_expired',
  'content_cleanup_failed',
]);
const fields = [
  'destinationId',
  'fromDestinationId',
  'serviceIdentifier',
  'serviceName',
  'region',
  'schemaUri',
  'mimeType',
  'caseId',
  'processMessage',
  'replyOffer',
];
const diagnosticSteps = new Set([
  'source_access',
  'recipient_key',
  'limits',
  'destination',
  'credentials',
  'announce',
  'attachment',
  'finalize',
  'sdk',
]);
const diagnosticCodes = new Set([
  ...errors,
  'ok',
  'authentication_failed',
  'auth_unavailable',
  'session_missing',
  'invalid_credentials',
  'key_rejected',
  'key_missing',
  'invalid_input',
  'verification_failed',
  'schema_unavailable',
  'schema_consent_required',
  'schema_tls_error',
  'schema_network_error',
  'schema_http_error',
  'schema_archive_invalid',
  'send_locked',
]);

function validDiagnostics(rows) {
  return (
    Array.isArray(rows) &&
    rows.length <= 32 &&
    rows.every(
      (row) =>
        exact(row, [
          'step',
          'method',
          'httpStatus',
          'code',
          'durationMs',
          ...(row && Object.hasOwn(row, 'problemType') ? ['problemType'] : []),
        ]) &&
        (row.problemType === undefined ||
          row.problemType === null ||
          (typeof row.problemType === 'string' && /^[a-z][a-z0-9-]{0,127}$/.test(row.problemType))) &&
        diagnosticSteps.has(row.step) &&
        ['GET', 'POST', 'PUT', 'LOCAL'].includes(row.method) &&
        diagnosticCodes.has(row.code) &&
        (row.httpStatus === null ||
          (Number.isInteger(row.httpStatus) && row.httpStatus >= 100 && row.httpStatus <= 599)) &&
        Number.isSafeInteger(row.durationMs) &&
        row.durationMs >= 0,
    )
  );
}

function validOffer(value) {
  if (value === null) return true;
  if (
    !exact(value, ['schemaUri', 'mimeType', 'processMessages']) ||
    typeof value.schemaUri !== 'string' ||
    value.schemaUri.length > 4096 ||
    /[\s\u0000-\u001f\u007f]/u.test(value.schemaUri) ||
    !['application/json', 'application/xml'].includes(value.mimeType)
  )
    return false;
  if (
    !Array.isArray(value.processMessages) ||
    value.processMessages.length > 16 ||
    value.processMessages.some(
      (row) =>
        !exact(row, ['processModelId', 'messageId']) ||
        Object.values(row).some(
          (id) => typeof id !== 'string' || !id.trim() || id.length > 1024 || /[\x00-\x1f\x7f]/.test(id),
        ),
    ) ||
    new Set(value.processMessages.map((row) => JSON.stringify(row))).size !== value.processMessages.length ||
    value.processMessages.reduce((size, row) => size + row.processModelId.length + row.messageId.length, 0) >
      4096
  )
    return false;
  try {
    new URL(value.schemaUri);
    return true;
  } catch {
    return false;
  }
}

function state(value, expected) {
  const hasDiagnostics = value && Object.hasOwn(value, 'diagnostics');
  if (
    !exact(value, [
      'attemptId',
      'status',
      'submissionId',
      'caseId',
      'error',
      ...(hasDiagnostics ? ['diagnostics'] : []),
    ]) ||
    (hasDiagnostics && !validDiagnostics(value.diagnostics)) ||
    !['idle', 'prepared', 'running', 'sent', 'failed', 'uncertain', 'cancelled'].includes(value.status) ||
    (value.status === 'idle' ? value.attemptId !== null : !uuid(value.attemptId)) ||
    (expected && value.attemptId !== expected) ||
    ![value.submissionId, value.caseId].every((id) => id === null || uuid(id)) ||
    (value.status === 'sent' && (!uuid(value.submissionId) || !uuid(value.caseId))) ||
    (value.error !== null && !errors.has(value.error))
  )
    fail();
  return Object.freeze({ ...value });
}

export async function cancelSend(invoke, session, attemptId) {
  if (!uuid(attemptId)) throw new Error('invalid_input');
  const result = state(await requestResource(invoke, session, 'cancel_send', { attemptId }), attemptId);
  if (result.status !== 'cancelled') fail();
  return result;
}

export async function prepareSend(invoke, session, draft, dataFile, attachments, options = {}) {
  const normalized = draft && typeof draft === 'object' ? { replyOffer: null, ...draft } : null;
  if (
    normalized?.replyOffer &&
    typeof normalized.replyOffer === 'object' &&
    !Array.isArray(normalized.replyOffer) &&
    !Object.hasOwn(normalized.replyOffer, 'processMessages')
  )
    normalized.replyOffer = { ...normalized.replyOffer, processMessages: [] };
  if (session?.apiVersion === 'v2' && normalized?.replyOffer?.processMessages?.length)
    throw new Error('invalid_submission');
  if (
    !exact(normalized, fields) ||
    !validOffer(normalized.replyOffer) ||
    !dataFile ||
    !Number.isSafeInteger(dataFile.size) ||
    dataFile.size < 1 ||
    dataFile.size > CONTENT_FILE_BYTES ||
    !Array.isArray(attachments) ||
    attachments.length > 39 ||
    attachments.some(
      (item) =>
        !item.file ||
        !Number.isSafeInteger(item.file.size) ||
        item.file.size < 0 ||
        item.file.size > CONTENT_FILE_BYTES,
    ) ||
    dataFile.size + attachments.reduce((sum, item) => sum + item.file.size, 0) > 64 * 1024 * 1024
  )
    throw new Error('invalid_submission');
  const active = { ...session };
  const snapshot = JSON.parse(JSON.stringify(normalized));
  const fileSummaries = attachments.map((item) => ({
    fileName: item.file.name,
    mimeType: item.mimeType || 'application/octet-stream',
    description: item.description || null,
    bytes: item.file.size,
  }));
  const handles = [];
  let approved,
    preparedResult,
    failure,
    failed = false,
    cleanupFailed = false;
  try {
    const data = await uploadContent(invoke, active, dataFile, options);
    handles.push(data.contentId);
    const files = [];
    for (let i = 0; i < attachments.length; i++) {
      const uploaded = await uploadContent(invoke, active, attachments[i].file, options);
      handles.push(uploaded.contentId);
      const { bytes: _bytes, ...description } = fileSummaries[i];
      files.push({ contentId: uploaded.contentId, ...description });
    }
    const document = JSON.stringify({ ...snapshot, contentId: data.contentId, attachments: files });
    if (new TextEncoder().encode(document).byteLength > 24 * 1024) throw new Error('invalid_submission');
    const response = await requestResource(invoke, active, 'prepare_send', { sendDocument: document });
    if (!exact(response, ['attempt', 'summary'])) fail();
    approved = state(response.attempt);
    if (approved.status !== 'prepared') fail();
    const expected = { ...snapshot, dataBytes: dataFile.size, attachments: fileSummaries };
    if (
      !exact(response.summary, [...fields, 'dataBytes', 'attachments']) ||
      !sameJsonValue(response.summary, expected)
    )
      fail();
    preparedResult = Object.freeze({ attempt: approved, summary: response.summary });
  } catch (error) {
    if (approved) {
      try {
        await cancelSend(invoke, active, approved.attemptId);
      } catch {
        cleanupFailed = true;
      }
    }
    failed = true;
    failure = error;
  } finally {
    for (const id of handles) {
      try {
        await discardContent(invoke, active, id);
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed) {
    if (approved) {
      try {
        await cancelSend(invoke, active, approved.attemptId);
      } catch {
        /* Keep cleanup failure explicit. */
      }
    }
    throw new Error('content_cleanup_failed');
  }
  if (failed) throw failure;
  return preparedResult;
}

export async function executeSend(invoke, session, prepared) {
  if (!prepared || prepared.status !== 'prepared' || !uuid(prepared.attemptId))
    throw new Error('invalid_input');
  try {
    const result = state(
      await requestResource(invoke, session, 'execute_send', { attemptId: prepared.attemptId }),
      prepared.attemptId,
    );
    if (!['sent', 'failed', 'uncertain'].includes(result.status)) fail();
    return result;
  } catch (error) {
    if (cancelledProductionAction(error)) throw error;
    const code = typeof error === 'string' ? error : error?.message;
    if (code === 'engine_busy' || code === 'case_limit') throw error; // Native mutex rejected the operation before dispatch.
    return Object.freeze({
      attemptId: prepared.attemptId,
      status: 'uncertain',
      submissionId: null,
      caseId: null,
      error: [
        'engine_timeout',
        'engine_disconnected',
        'engine_protocol_error',
        'engine_start_failed',
      ].includes(code)
        ? code
        : 'resource_unavailable',
    });
  }
}

export async function sendState(invoke, session) {
  return state(await requestResource(invoke, session, 'send_state'));
}

export async function acknowledgeSendUncertainty(invoke, session, attempt) {
  if (!attempt || attempt.status !== 'uncertain' || !uuid(attempt.attemptId))
    throw new Error('invalid_input');
  const result = state(
    await requestResource(invoke, session, 'acknowledge_send_uncertainty', {
      attemptId: attempt.attemptId,
    }),
    attempt.attemptId,
  );
  if (!sameJsonValue(result, attempt)) fail();
  return result;
}
