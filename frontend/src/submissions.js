import { requestResource } from './resources.js';

const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const exact = (value, fields) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));
const fail = () => {
  throw new Error('engine_protocol_error');
};
const text = (value, maximum) => value === null || (typeof value === 'string' && value.length <= maximum);
function id(value) {
  if (!uuid(value)) throw new Error('invalid_input');
  return value.toLowerCase();
}

export async function listSubmissions(invoke, session, destination, offset = 0) {
  destination = id(destination);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || offset % 20 !== 0)
    throw new Error('invalid_input');
  const data = await requestResource(invoke, session, 'list_submissions', {
    destinationId: destination,
    offset,
  });
  if (
    !exact(data, ['offset', 'totalCount', 'submissions']) ||
    data.offset !== offset ||
    !Number.isSafeInteger(data.totalCount) ||
    data.totalCount < 0 ||
    data.totalCount > 1000000 ||
    !Array.isArray(data.submissions) ||
    data.submissions.length > 20 ||
    offset + data.submissions.length > data.totalCount ||
    (!data.submissions.length && offset < data.totalCount)
  )
    fail();
  const seen = new Set();
  const rows = data.submissions.map((item) => {
    if (
      !exact(item, ['destinationId', 'submissionId', 'caseId']) ||
      item.destinationId !== destination ||
      !uuid(item.submissionId) ||
      !(item.caseId === null || uuid(item.caseId)) ||
      seen.has(item.submissionId.toLowerCase())
    )
      fail();
    seen.add(item.submissionId.toLowerCase());
    return { ...item };
  });
  return { offset, totalCount: data.totalCount, submissions: rows };
}

export async function loadSubmission(invoke, session, destination, submission) {
  destination = id(destination);
  submission = id(submission);
  const data = await requestResource(invoke, session, 'load_submission', {
    destinationId: destination,
    submissionId: submission,
  });
  if (
    !exact(data, [
      'destinationId',
      'fromDestinationId',
      'submissionId',
      'caseId',
      'attachments',
      'serviceIdentifier',
      'serviceName',
      'region',
      'processModelId',
      'messageId',
      'metadataAvailable',
      'dataAvailable',
    ]) ||
    data.destinationId !== destination ||
    data.submissionId !== submission ||
    !uuid(data.caseId) ||
    !(data.fromDestinationId === null || uuid(data.fromDestinationId)) ||
    !Array.isArray(data.attachments) ||
    data.attachments.length > 512 ||
    data.attachments.some((value) => !uuid(value)) ||
    new Set(data.attachments.map((value) => value.toLowerCase())).size !== data.attachments.length ||
    !text(data.serviceIdentifier, 1024) ||
    !text(data.serviceName, 512) ||
    !text(data.region, 128) ||
    !text(data.processModelId, 1024) ||
    !text(data.messageId, 1024) ||
    (data.processModelId === null) !== (data.messageId === null) ||
    typeof data.metadataAvailable !== 'boolean' ||
    typeof data.dataAvailable !== 'boolean'
  )
    fail();
  return { ...data, attachments: [...data.attachments] };
}
