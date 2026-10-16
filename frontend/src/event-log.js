import { requestResource } from './resources.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const count = value => Number.isSafeInteger(value) && value > 0 && value <= 1000;
const size = (value, maximum) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
const fail = () => { throw new Error('engine_protocol_error'); };
function id(value) { if (!uuid(value)) throw new Error('invalid_input'); }

export async function loadEventLog(invoke, session, destinationId, caseId, submissionId) {
  id(destinationId); id(caseId); id(submissionId);
  const data = await requestResource(invoke, session, 'load_event_log', { destinationId, caseId, submissionId });
  if (!exact(data, ['logId', 'destinationId', 'caseId', 'submissionId', 'total', 'warnings']) || !uuid(data.logId)
      || data.destinationId !== destinationId || data.caseId !== caseId || data.submissionId !== submissionId || !count(data.total)
      || !Array.isArray(data.warnings) || data.warnings.length !== 1 || data.warnings[0] !== 'CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED') fail();
  return Object.freeze({ ...data, warnings: Object.freeze([...data.warnings]) });
}

export async function loadReplyEventLog(invoke, session, caseId, replyId) {
  id(caseId); id(replyId);
  const data = await requestResource(invoke, session, 'load_reply_event_log', { caseId, replyId });
  if (!exact(data, ['logId', 'caseId', 'replyId', 'total', 'warnings']) || !uuid(data.logId)
      || data.caseId !== caseId || data.replyId !== replyId || !count(data.total)
      || !Array.isArray(data.warnings) || data.warnings.length !== 1 || data.warnings[0] !== 'CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED') fail();
  return Object.freeze({ ...data, warnings: Object.freeze([...data.warnings]) });
}
export async function listEventLog(invoke, session, summary, offset = 0) {
  id(summary.logId);
  if (!count(summary.total) || !Number.isSafeInteger(offset) || offset < 0 || offset > summary.total || offset % 5 !== 0)
    throw new Error('invalid_input');
  const data = await requestResource(invoke, session, 'list_event_log', { logId: summary.logId, offset });
  if (!exact(data, ['logId', 'offset', 'total', 'events']) || data.logId !== summary.logId || data.offset !== offset || data.total !== summary.total
      || !Array.isArray(data.events) || data.events.length !== Math.min(5, data.total - offset)) fail();
  const seen = new Set();
  const events = data.events.map(event => {
    if (!exact(event, ['eventId', 'eventType', 'issuer', 'issuedAt', 'headerBytes', 'claimsBytes']) || !uuid(event.eventId) || seen.has(event.eventId)
        || typeof event.eventType !== 'string' || event.eventType.length > 256
        || !(summary.replyId ? /^https:\/\/schema\.fitko\.de\/fit-connect\/events\/[a-z-]+-reply$/ : /^https:\/\/schema\.fitko\.de\/fit-connect\/events\/[a-z-]+-submission$/).test(event.eventType)
        || typeof event.issuer !== 'string' || !event.issuer.trim() || event.issuer.length > 1024 || /[\x00-\x1f\x7f]/.test(event.issuer)
        || typeof event.issuedAt !== 'string' || event.issuedAt.length > 64 || !Number.isFinite(Date.parse(event.issuedAt))
        || !size(event.headerBytes, 16384) || !size(event.claimsBytes, 65536)) fail();
    seen.add(event.eventId);
    return Object.freeze({ ...event });
  });
  return Object.freeze({ ...data, events: Object.freeze(events) });
}

/** Decode only after all bounded chunks arrive so split UTF-8 characters and original JSON bytes survive. */
export async function readEventDocument(invoke, session, logId, event, part, { signal } = {}) {
  id(logId); id(event.eventId);
  if (!['header', 'claims'].includes(part)) throw new Error('invalid_input');
  const total = part === 'header' ? event.headerBytes : event.claimsBytes;
  if (!size(total, part === 'header' ? 16384 : 65536)) throw new Error('invalid_input');
  const check = () => { if (signal?.aborted) throw new Error('content_cancelled'); };
  check();
  const bytes = new Uint8Array(total);
  try {
    let offset = 0;
    while (offset < total) {
      check();
      const data = await requestResource(invoke, session, 'read_event_log', { logId, eventId: event.eventId, part, byteOffset: offset });
      check();
      if (!exact(data, ['logId', 'eventId', 'part', 'byteOffset', 'totalBytes', 'chunk', 'complete']) || data.logId !== logId
          || data.eventId !== event.eventId || data.part !== part || data.byteOffset !== offset || data.totalBytes !== total
          || typeof data.chunk !== 'string' || data.chunk.length > 32768) fail();
      let decoded;
      try { decoded = atob(data.chunk); } catch { fail(); }
      const length = Math.min(24576, total - offset);
      if (decoded.length !== length || btoa(decoded) !== data.chunk || data.complete !== (offset + length === total)) fail();
      for (let i = 0; i < length; i++) bytes[offset + i] = decoded.charCodeAt(i);
      offset += length;
    }
    check();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(); }
  } finally { bytes.fill(0); }
}

export async function discardEventLog(invoke, session, logId) {
  id(logId);
  const data = await requestResource(invoke, session, 'discard_event_log', { logId });
  if (!exact(data, ['logId']) || data.logId !== logId) fail();
}
