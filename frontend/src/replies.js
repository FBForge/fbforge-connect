import { requestResource } from './resources.js';

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

export async function listReplyChannels(invoke, session) {
  const data = await requestResource(invoke, session, 'list_reply_channels');
  if (!exact(data, ['channels']) || !Array.isArray(data.channels) || data.channels.length > 32) fail();
  const seen = new Set();
  const channels = data.channels.map((item) => {
    if (
      !exact(item, [
        'attemptId',
        'destinationId',
        'fromDestinationId',
        'caseId',
        'submissionId',
        'keyId',
        'status',
      ]) ||
      !uuid(item.attemptId) ||
      !uuid(item.destinationId) ||
      !(item.fromDestinationId === null || uuid(item.fromDestinationId)) ||
      (session.apiVersion === 'v3' && !uuid(item.fromDestinationId)) ||
      !['pending', 'bound', 'unresolved', 'recovered'].includes(item.status) ||
      (item.status === 'bound'
        ? !uuid(item.caseId) || !uuid(item.submissionId)
        : item.status === 'recovered'
          ? !uuid(item.caseId) || item.submissionId !== null
          : item.caseId !== null || item.submissionId !== null) ||
      item.keyId !== `reply-key:${item.attemptId}` ||
      seen.has(item.attemptId)
    )
      fail();
    seen.add(item.attemptId);
    return Object.freeze({ ...item });
  });
  return Object.freeze(channels);
}

export async function listReplies(invoke, session, offset = 0) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || offset % 20 !== 0)
    throw new Error('invalid_input');
  const data = await requestResource(invoke, session, 'list_replies', { offset });
  if (
    !exact(data, ['offset', 'totalCount', 'replies']) ||
    data.offset !== offset ||
    !Number.isSafeInteger(data.totalCount) ||
    data.totalCount < 0 ||
    data.totalCount > 1000000 ||
    !Array.isArray(data.replies) ||
    data.replies.length > 20 ||
    offset + data.replies.length > data.totalCount ||
    (data.replies.length < 20 && offset + data.replies.length < data.totalCount)
  )
    fail();
  const seen = new Set();
  const replies = data.replies.map((item) => {
    if (
      !exact(item, ['replyId', 'caseId']) ||
      !uuid(item.replyId) ||
      !uuid(item.caseId) ||
      seen.has(item.replyId)
    )
      fail();
    seen.add(item.replyId);
    return Object.freeze({ ...item });
  });
  return Object.freeze({ ...data, replies: Object.freeze(replies) });
}
