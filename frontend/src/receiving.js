import { requestResource } from './resources.js';
import { CONTENT_CHUNK_BYTES, CONTENT_FILE_BYTES } from './content.js';

const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, fields) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));
const size = (value) => Number.isSafeInteger(value) && value >= 0 && value <= CONTENT_FILE_BYTES;
const text = (value, maximum) =>
  value === null || (typeof value === 'string' && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value));
const fail = () => {
  throw new Error('engine_protocol_error');
};
function id(value) {
  if (!uuid(value)) throw new Error('invalid_input');
  return value;
}

function schemaCatalog(schemas, allowExternalSchemas = false) {
  if (typeof allowExternalSchemas !== 'boolean') throw new Error('invalid_input');
  if (
    !Array.isArray(schemas) ||
    schemas.length > 32 ||
    schemas.some(
      (item) =>
        !exact(item, ['uri', 'contentId']) ||
        !uuid(item.contentId) ||
        typeof item.uri !== 'string' ||
        !item.uri ||
        item.uri.length > 4096,
    ) ||
    new Set(schemas.map((item) => item.uri)).size !== schemas.length
  )
    throw new Error('invalid_input');
  const schemaDocument = JSON.stringify(
    allowExternalSchemas ? { schemas, allowExternalSchemas: true } : { schemas },
  );
  if (new TextEncoder().encode(schemaDocument).length > 24 * 1024) throw new Error('invalid_input');
  return schemaDocument;
}
function checkedSummary(data) {
  if (
    data.processMessage !== undefined &&
    data.processMessage !== null &&
    (!exact(data.processMessage, ['processModelId', 'messageId']) ||
      Object.values(data.processMessage).some(
        (value) =>
          typeof value !== 'string' || !value.trim() || value.length > 1024 || /[\x00-\x1f\x7f]/.test(value),
      ))
  )
    fail();
  if (
    !Number.isSafeInteger(data.partCount) ||
    data.partCount < 2 ||
    data.partCount > 41 ||
    !Number.isSafeInteger(data.warningCount) ||
    data.warningCount < 0 ||
    data.warningCount > 512 ||
    !Array.isArray(data.warnings) ||
    data.warnings.length > 16 ||
    data.warnings.length > data.warningCount ||
    data.warnings.some((value) => typeof value !== 'string' || !/^[A-Z_]{1,64}$/.test(value)) ||
    new Set(data.warnings).size !== data.warnings.length ||
    (data.warningCount > 0 && !data.warnings.length)
  )
    fail();
  return Object.freeze({ ...data, warnings: Object.freeze([...data.warnings]) });
}

export async function verifyReply(
  invoke,
  session,
  caseId,
  replyId,
  schemas = [],
  allowExternalSchemas = false,
) {
  id(caseId);
  id(replyId);
  const schemaDocument = schemaCatalog(schemas, allowExternalSchemas);
  const data = await requestResource(invoke, session, 'verify_reply', { caseId, replyId, schemaDocument });
  if (
    !exact(data, [
      'proofId',
      'replyId',
      'caseId',
      'channelAttemptId',
      'senderDestinationId',
      'partCount',
      'warningCount',
      'warnings',
      ...(Object.hasOwn(data, 'processMessage') ? ['processMessage'] : []),
    ]) ||
    !uuid(data.proofId) ||
    data.caseId !== caseId ||
    data.replyId !== replyId ||
    !uuid(data.channelAttemptId) ||
    (data.senderDestinationId !== null && !uuid(data.senderDestinationId))
  )
    fail();
  return checkedSummary(data);
}

export async function verifySubmission(
  invoke,
  session,
  destinationId,
  submissionId,
  schemas = [],
  allowExternalSchemas = false,
) {
  id(destinationId);
  id(submissionId);
  const schemaDocument = schemaCatalog(schemas, allowExternalSchemas);
  const data = await requestResource(invoke, session, 'verify_submission', {
    destinationId,
    submissionId,
    schemaDocument,
  });
  if (
    !exact(data, [
      'proofId',
      'destinationId',
      'submissionId',
      'caseId',
      'partCount',
      'warningCount',
      'warnings',
      ...(Object.hasOwn(data, 'processMessage') ? ['processMessage'] : []),
    ]) ||
    !uuid(data.proofId) ||
    data.destinationId !== destinationId ||
    data.submissionId !== submissionId ||
    !uuid(data.caseId)
  )
    fail();
  return checkedSummary(data);
}

export async function listReceivedContents(invoke, session, proof, offset = 0, reply = false) {
  id(proof.proofId);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 40 || offset % 2 !== 0)
    throw new Error('invalid_input');
  const data = await requestResource(
    invoke,
    session,
    reply ? 'list_received_reply_contents' : 'list_received_contents',
    { proofId: proof.proofId, offset },
  );
  if (
    !exact(data, ['proofId', 'offset', 'total', 'parts']) ||
    data.proofId !== proof.proofId ||
    data.offset !== offset ||
    data.total !== proof.partCount ||
    !Array.isArray(data.parts) ||
    data.parts.length !== Math.min(2, Math.max(0, data.total - offset))
  )
    fail();
  const seen = new Set();
  const parts = data.parts.map((part, index) => {
    const position = offset + index;
    if (
      !exact(part, [
        'contentId',
        'kind',
        'attachmentId',
        'fileName',
        'mimeType',
        'description',
        'totalBytes',
      ]) ||
      !uuid(part.contentId) ||
      seen.has(part.contentId) ||
      part.kind !== (position === 0 ? 'metadata' : position === 1 ? 'data' : 'attachment') ||
      (position < 2 ? part.attachmentId !== null : !uuid(part.attachmentId)) ||
      !text(part.fileName, 255) ||
      !text(part.mimeType, 256) ||
      !text(part.description, 4096) ||
      !size(part.totalBytes) ||
      (position === 0 && (part.totalBytes > 2 * 1024 * 1024 || part.mimeType !== 'application/json'))
    )
      fail();
    seen.add(part.contentId);
    return Object.freeze({ ...part });
  });
  return { ...data, parts };
}

export async function readReceivedChunk(invoke, session, proofId, part, byteOffset, reply = false) {
  id(proofId);
  id(part.contentId);
  if (!size(part.totalBytes) || !size(byteOffset) || byteOffset > part.totalBytes)
    throw new Error('invalid_input');
  const data = await requestResource(
    invoke,
    session,
    reply ? 'read_received_reply_content' : 'read_received_content',
    { proofId, contentId: part.contentId, byteOffset },
  );
  if (
    !exact(data, ['proofId', 'contentId', 'byteOffset', 'totalBytes', 'chunk', 'complete']) ||
    data.proofId !== proofId ||
    data.contentId !== part.contentId ||
    data.byteOffset !== byteOffset ||
    data.totalBytes !== part.totalBytes ||
    typeof data.chunk !== 'string' ||
    data.chunk.length > (4 * CONTENT_CHUNK_BYTES) / 3
  )
    fail();
  let decoded;
  try {
    decoded = atob(data.chunk);
  } catch {
    fail();
  }
  const expected = Math.min(CONTENT_CHUNK_BYTES, part.totalBytes - byteOffset);
  if (
    decoded.length !== expected ||
    btoa(decoded) !== data.chunk ||
    data.complete !== (byteOffset + expected === part.totalBytes)
  )
    fail();
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

/** Downloads only the currently bound proof in bounded IPC reads. Cancellation cannot restore an old preview. */
export async function readReceivedFile(invoke, session, proofId, part, { signal, reply = false } = {}) {
  id(proofId);
  id(part.contentId);
  if (!size(part.totalBytes)) throw new Error('invalid_input');
  const check = () => {
    if (signal?.aborted) throw new Error('content_cancelled');
  };
  check();
  const result = new Uint8Array(part.totalBytes);
  try {
    let offset = 0;
    do {
      check();
      const bytes = await readReceivedChunk(invoke, session, proofId, part, offset, reply);
      try {
        check();
        result.set(bytes, offset);
        offset += bytes.length;
      } finally {
        bytes.fill(0);
      }
    } while (offset < part.totalBytes);
    return result;
  } catch (error) {
    result.fill(0);
    throw error;
  }
}

export async function discardReceived(invoke, session, proofId, reply = false) {
  id(proofId);
  const data = await requestResource(invoke, session, reply ? 'discard_received_reply' : 'discard_received', {
    proofId,
  });
  if (!exact(data, ['proofId']) || data.proofId !== proofId) fail();
}
