import { isDemoSchema } from './demo-identifiers.js';
import { readSchemaPackage } from './sender-options.js';
import { requestResource, sameJsonValue } from './resources.js';
import { uploadContent, discardContent, CONTENT_FILE_BYTES } from './content.js';

const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, fields) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));
const fail = () => {
  throw new Error('engine_protocol_error');
};
const identities = ['proofId', 'destinationId', 'submissionId', 'caseId'];
const formats = ['application/json', 'application/xml'];
const draftFields = ['proofId', 'schemaId', 'schemaUri', 'mimeType', 'processMessage'];
const errors = new Set([
  'invalid_submission',
  'reply_metadata_required',
  'verification_failed',
  'endpoint_blocked',
  'resource_denied',
  'resource_missing',
  'invalid_resource',
  'content_limit',
  'resource_unavailable',
  'confirmation_expired',
  'content_cleanup_failed',
]);
function absolute(value) {
  try {
    return (
      typeof value === 'string' &&
      value.length <= 4096 &&
      !/[\s\u0000-\u001f\u007f]/u.test(value) &&
      Boolean(new URL(value).protocol)
    );
  } catch {
    return false;
  }
}
function checkProof(proof) {
  if (!proof || !identities.every((field) => uuid(proof[field]))) throw new Error('invalid_input');
}
function state(value, expected) {
  if (
    !exact(value, ['attemptId', 'status', 'replyId', 'caseId', 'error']) ||
    !['idle', 'prepared', 'running', 'sent', 'failed', 'uncertain', 'cancelled'].includes(value.status) ||
    (value.status === 'idle'
      ? value.attemptId !== null || value.caseId !== null || value.replyId !== null
      : !uuid(value.attemptId) || !uuid(value.caseId)) ||
    !(value.replyId === null || uuid(value.replyId)) ||
    (value.status === 'sent' && !uuid(value.replyId)) ||
    (value.error !== null && !errors.has(value.error)) ||
    (['failed', 'uncertain'].includes(value.status) && value.error === null) ||
    (['idle', 'prepared', 'running', 'cancelled'].includes(value.status) && value.error !== null) ||
    (value.status === 'sent' && value.error !== null && value.error !== 'content_cleanup_failed') ||
    (expected && (value.attemptId !== expected.attemptId || value.caseId !== expected.caseId))
  )
    fail();
  return Object.freeze({ ...value });
}
export async function loadReplyTarget(invoke, session, proof) {
  checkProof(proof);
  const active = { ...session },
    expected = { ...proof };
  let first;
  const schemas = [],
    seen = new Set();
  for (let offset = 0; !first || offset < first.total; offset += 2) {
    const page = await requestResource(invoke, active, 'reply_target', { proofId: expected.proofId, offset });
    if (
      !exact(page, [
        ...identities,
        'replyDestinationId',
        'offset',
        'total',
        'schemas',
        ...(Object.hasOwn(page, 'processMessages') ? ['processMessages'] : []),
      ]) ||
      identities.some((field) => page[field] !== expected[field]) ||
      page.offset !== offset ||
      !Number.isSafeInteger(page.total) ||
      page.total < 1 ||
      page.total > 64 ||
      !(page.replyDestinationId === null || uuid(page.replyDestinationId)) ||
      (active.apiVersion === 'v2' && page.replyDestinationId !== null) ||
      !Array.isArray(page.schemas) ||
      page.schemas.length !== Math.min(2, page.total - offset) ||
      (first && (page.total !== first.total || page.replyDestinationId !== first.replyDestinationId))
    )
      fail();
    const messages = page.processMessages ?? [];
    if (
      !Array.isArray(messages) ||
      messages.length > 16 ||
      messages.some(
        (row) =>
          !exact(row, ['processModelId', 'messageId']) ||
          Object.values(row).some(
            (value) =>
              typeof value !== 'string' ||
              !value.trim() ||
              value.length > 1024 ||
              /[\x00-\x1f\x7f]/.test(value),
          ),
      ) ||
      new Set(messages.map((row) => JSON.stringify(row))).size !== messages.length ||
      (active.apiVersion === 'v2' && messages.length) ||
      (first && !sameJsonValue(messages, first.processMessages))
    )
      fail();
    first ??= { ...page, processMessages: Object.freeze(messages.map((row) => Object.freeze({ ...row }))) };
    for (const schema of page.schemas) {
      if (
        !exact(schema, ['schemaUri', 'mimeType']) ||
        !absolute(schema.schemaUri) ||
        !(schema.mimeType === null || formats.includes(schema.mimeType))
      )
        fail();
      const key = JSON.stringify([schema.schemaUri, schema.mimeType]);
      if (seen.has(key)) fail();
      seen.add(key);
      schemas.push(Object.freeze({ ...schema }));
    }
  }
  return Object.freeze({ ...first, schemas: Object.freeze(schemas) });
}
export async function loadReplySchema(invoke, session, proof, selection, localFile = null) {
  checkProof(proof);
  if (
    !exact(selection, ['schemaUri', 'mimeType', 'allowExternalSchemas']) ||
    !absolute(selection.schemaUri) ||
    !formats.includes(selection.mimeType) ||
    typeof selection.allowExternalSchemas !== 'boolean' ||
    (localFile &&
      (!Number.isSafeInteger(localFile.size) || localFile.size < 1 || localFile.size > 2 * 1024 * 1024))
  )
    throw new Error('invalid_input');
  if (!selection.allowExternalSchemas && !localFile && !isDemoSchema(selection.schemaUri))
    throw new Error('schema_consent_required');
  const active = { ...session },
    identity = { ...proof },
    chosen = { ...selection };
  let handle,
    result,
    failure,
    failed = false,
    cleanupFailed = false;
  try {
    if (localFile) handle = await uploadContent(invoke, active, localFile);
    const schemaDocument = JSON.stringify({ ...chosen, schemaContentId: handle?.contentId || null });
    const page = await requestResource(invoke, active, 'load_reply_schema', {
      proofId: identity.proofId,
      schemaDocument,
    });
    const loaded = await readSchemaPackage(page, chosen.schemaUri, (contentId, byteOffset) =>
      requestResource(invoke, active, 'read_reply_schema', {
        proofId: identity.proofId,
        contentId,
        byteOffset,
      }),
    );
    result = Object.freeze({ ...loaded, schemaUri: chosen.schemaUri, mimeType: chosen.mimeType });
  } catch (cause) {
    failed = true;
    failure = cause;
  } finally {
    if (handle) {
      try {
        await discardContent(invoke, active, handle.contentId);
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed) throw new Error('content_cleanup_failed');
  if (failed) throw failure;
  return result;
}
export async function cancelReply(invoke, session, attemptId) {
  if (!uuid(attemptId)) throw new Error('invalid_input');
  const result = state(await requestResource(invoke, session, 'cancel_reply', { attemptId }));
  if (result.attemptId !== attemptId || result.status !== 'cancelled') fail();
  return result;
}
export async function prepareReply(invoke, session, proof, draft, dataFile, attachments, options = {}) {
  checkProof(proof);
  if (
    !exact(draft, draftFields) ||
    draft.proofId !== proof.proofId ||
    !uuid(draft.schemaId) ||
    !absolute(draft.schemaUri) ||
    !formats.includes(draft.mimeType) ||
    !(
      draft.processMessage === null ||
      (exact(draft.processMessage, ['processModelId', 'messageId']) &&
        Object.values(draft.processMessage).every(
          (value) =>
            typeof value === 'string' &&
            value.trim() &&
            value.length <= 1024 &&
            !/[\u0000-\u001f\u007f]/u.test(value),
        ))
    ) ||
    (session.apiVersion === 'v2' && draft.processMessage !== null) ||
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
  const active = { ...session },
    snapshot = JSON.parse(JSON.stringify(draft)),
    identity = { ...proof };
  const files = attachments.map((item) => ({
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
    const staged = [];
    for (let index = 0; index < attachments.length; index++) {
      const value = await uploadContent(invoke, active, attachments[index].file, options);
      handles.push(value.contentId);
      const { bytes: _bytes, ...description } = files[index];
      staged.push({ contentId: value.contentId, ...description });
    }
    const document = JSON.stringify({ ...snapshot, contentId: data.contentId, attachments: staged });
    if (new TextEncoder().encode(document).byteLength > 24 * 1024) throw new Error('invalid_submission');
    const response = await requestResource(invoke, active, 'prepare_reply', { replyDocument: document });
    if (!exact(response, ['attempt', 'summary'])) fail();
    approved = state(response.attempt);
    const expected = {
      ...snapshot,
      destinationId: identity.destinationId,
      submissionId: identity.submissionId,
      caseId: identity.caseId,
      dataBytes: dataFile.size,
      attachments: files,
    };
    if (
      approved.status !== 'prepared' ||
      approved.caseId !== identity.caseId ||
      !exact(response.summary, Object.keys(expected)) ||
      !sameJsonValue(response.summary, expected)
    )
      fail();
    preparedResult = Object.freeze({
      attempt: approved,
      summary: Object.freeze({
        ...response.summary,
        processMessage:
          response.summary.processMessage && Object.freeze({ ...response.summary.processMessage }),
        attachments: Object.freeze(response.summary.attachments.map((item) => Object.freeze({ ...item }))),
      }),
    });
  } catch (error) {
    if (approved) {
      try {
        await cancelReply(invoke, active, approved.attemptId);
      } catch {
        cleanupFailed = true;
      }
    }
    failed = true;
    failure = error;
  } finally {
    for (const contentId of handles) {
      try {
        await discardContent(invoke, active, contentId);
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed) {
    if (approved) {
      try {
        await cancelReply(invoke, active, approved.attemptId);
      } catch {
        /* Keep failure explicit. */
      }
    }
    throw new Error('content_cleanup_failed');
  }
  if (failed) throw failure;
  return preparedResult;
}
export async function executeReply(invoke, session, prepared) {
  const expected = state(prepared);
  if (expected.status !== 'prepared') throw new Error('invalid_input');
  try {
    const result = state(
      await requestResource(invoke, session, 'execute_reply', { attemptId: expected.attemptId }),
      expected,
    );
    if (!['sent', 'failed', 'uncertain'].includes(result.status)) fail();
    return result;
  } catch (error) {
    const code = typeof error === 'string' ? error : error?.message;
    if (code === 'engine_busy' || code === 'case_limit') throw error;
    return Object.freeze({
      ...expected,
      status: 'uncertain',
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
export async function replyState(invoke, session) {
  return state(await requestResource(invoke, session, 'reply_state'));
}
