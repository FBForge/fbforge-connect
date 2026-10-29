import { parseOffers, validOffers } from './destination-offers.js';
import { requestResource } from './resources.js';

const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) =>
  object(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((key) => Object.hasOwn(value, key));
const text = (value, max, nullable = false, multiline = false) =>
  (nullable && value === null) ||
  (typeof value === 'string' &&
    value.length <= max &&
    !(multiline ? /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value));
const fail = () => {
  throw new Error('engine_protocol_error');
};
const id = (value) => {
  if (!uuid(value)) throw new Error('invalid_input');
  return value.toLowerCase();
};
const list = (value) => Array.isArray(value) && value.length <= 64 && value.every((x) => text(x, 256));
const contactFields = ['legalName', 'address', 'phone', 'email', 'unit'];
function contact(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    fail();
  }
  if (
    !exact(value, [...contactFields, 'cc']) ||
    contactFields.some((key) => !text(value[key], key === 'address' ? 2048 : 256, true, key === 'address')) ||
    (value.cc !== null && !list(value.cc))
  )
    fail();
  return value;
}
export async function loadManagedDestination(invoke, session, destinationId) {
  destinationId = id(destinationId);
  const data = await requestResource(invoke, session, 'load_managed_destination', { destinationId });
  if (
    !exact(data, [
      'destinationId',
      'name',
      'status',
      'contactJson',
      'metadataVersions',
      'possibleNextStatus',
      'type',
      'offersJson',
    ]) ||
    data.destinationId !== destinationId ||
    !text(data.name, 512, true) ||
    !text(data.status, 64, true) ||
    typeof data.contactJson !== 'string' ||
    data.contactJson.length > 16384 ||
    !list(data.metadataVersions) ||
    !list(data.possibleNextStatus)
  )
    fail();
  if (!['A', 'C'].includes(data.type) && data.type !== null) fail();
  if (typeof data.offersJson !== 'string' || data.offersJson.length > 44000) fail();
  let offers = null;
  try {
    offers = parseOffers(data.offersJson);
  } catch {
    /* Preserve read/general editing for unsupported legacy offer shapes. */
  }
  return { ...data, contact: contact(data.contactJson), offers };
}
export function checkedPreview(data, expectedId, expectedRows) {
  const statuses = [
    'idle',
    'prepared',
    'running',
    'completed',
    'partial',
    'uncertain',
    'conflict',
    'failed',
    'expired',
    'cancelled',
  ];
  if (
    !exact(data, ['attemptId', 'status', 'changes']) ||
    !statuses.includes(data.status) ||
    (data.status === 'idle' ? data.attemptId !== null : !uuid(data.attemptId)) ||
    (expectedId && data.attemptId !== expectedId) ||
    !Array.isArray(data.changes) ||
    data.changes.length > 10 ||
    (expectedRows &&
      (data.changes.length !== expectedRows.length ||
        data.changes.some((row, i) => row.destinationId !== expectedRows[i])))
  )
    fail();
  const seen = new Set();
  const changes = data.changes.map((row) => {
    if (
      !exact(row, ['destinationId', 'name', 'beforeJson', 'afterJson', 'status', 'error']) ||
      !uuid(row.destinationId) ||
      seen.has(row.destinationId) ||
      !text(row.name, 512, true) ||
      !['prepared', 'unchanged', 'updated', 'failed', 'uncertain', 'skipped'].includes(row.status) ||
      !text(row.error, 64, true) ||
      typeof row.beforeJson !== 'string' ||
      row.beforeJson.length > 16384 ||
      typeof row.afterJson !== 'string' ||
      row.afterJson.length > 16384
    )
      fail();
    seen.add(row.destinationId);
    let before, after;
    try {
      before = JSON.parse(row.beforeJson);
      after = JSON.parse(row.afterJson);
    } catch {
      fail();
    }
    if (
      !object(before) ||
      !object(after) ||
      !exact(before, Object.keys(after)) ||
      Object.keys(after).some(
        (key) =>
          ![
            'name',
            'status',
            'contactInformation',
            'metadataVersions',
            'publicServices',
            'processMessages',
          ].includes(key),
      )
    )
      fail();
    for (const [key, value] of Object.entries(after)) {
      if (key === 'name' && (!text(value, 256) || !value.trim() || !text(before.name, 512, true))) fail();
      if (key === 'status' && (!['active', 'inactive'].includes(value) || !text(before.status, 64, true)))
        fail();
      if (
        key === 'metadataVersions' &&
        (!list(value) ||
          !value.length ||
          value.length > 16 ||
          (before.metadataVersions !== null && !list(before.metadataVersions)))
      )
        fail();
      if (key === 'publicServices' || key === 'processMessages') {
        if (
          !validOffers({
            publicServices: key === 'publicServices' ? value : [],
            processMessages: key === 'processMessages' ? value : [],
          })
        )
          fail();
      }
      if (key === 'contactInformation') {
        contact(JSON.stringify(value));
        if (before.contactInformation !== null) contact(JSON.stringify(before.contactInformation));
      }
    }
    return { ...row, before, after };
  });
  if (
    ['prepared', 'running', 'completed', 'partial', 'uncertain', 'conflict', 'failed', 'expired'].includes(
      data.status,
    ) &&
    !changes.length
  )
    fail();
  return { ...data, changes };
}
export async function prepareDestinationUpdate(invoke, session, destinationIds, changes) {
  if (
    session?.apiVersion !== 'v3' ||
    !Array.isArray(destinationIds) ||
    !destinationIds.length ||
    destinationIds.length > 10 ||
    !object(changes) ||
    !Object.keys(changes).length ||
    Object.keys(changes).some(
      (key) =>
        ![
          'name',
          'status',
          'contactInformation',
          'metadataVersions',
          'publicServices',
          'processMessages',
        ].includes(key),
    )
  )
    throw new Error('invalid_input');
  const ids = destinationIds.map(id);
  if (
    new Set(ids).size !== ids.length ||
    (Object.hasOwn(changes, 'name') && (!text(changes.name, 256) || !changes.name.trim())) ||
    (Object.hasOwn(changes, 'status') && !['active', 'inactive'].includes(changes.status)) ||
    (Object.hasOwn(changes, 'metadataVersions') &&
      (!list(changes.metadataVersions) ||
        !changes.metadataVersions.length ||
        changes.metadataVersions.length > 16 ||
        new Set(changes.metadataVersions).size !== changes.metadataVersions.length ||
        changes.metadataVersions.some((value) => !/^[123]\.\d{1,3}\.\d{1,3}$/.test(value)))) ||
    (Object.hasOwn(changes, 'contactInformation') &&
      (!object(changes.contactInformation) ||
        !Object.keys(changes.contactInformation).length ||
        Object.entries(changes.contactInformation).some(
          ([key, value]) =>
            !contactFields.includes(key) ||
            !text(value, key === 'address' ? 2048 : 256, true, key === 'address'),
        )))
  )
    throw new Error('invalid_input');
  if (
    (Object.hasOwn(changes, 'publicServices') || Object.hasOwn(changes, 'processMessages')) &&
    !validOffers({
      publicServices: changes.publicServices ?? [],
      processMessages: changes.processMessages ?? [],
    })
  )
    throw new Error('invalid_input');
  const destinationDocument = JSON.stringify({ destinationIds: ids, changes });
  if (new TextEncoder().encode(destinationDocument).length > 24 * 1024) throw new Error('invalid_input');
  const result = checkedPreview(
    await requestResource(invoke, session, 'prepare_destination_update', { destinationDocument }),
    null,
    ids,
  );
  if (result.status !== 'prepared') fail();
  return result;
}
export async function executeDestinationUpdate(invoke, session, preview) {
  if (session?.apiVersion !== 'v3' || preview?.status !== 'prepared') throw new Error('invalid_input');
  const attemptId = id(preview.attemptId);
  const result = checkedPreview(
    await requestResource(invoke, session, 'execute_destination_update', { attemptId }),
    attemptId,
    preview.changes.map((row) => row.destinationId),
  );
  if (!['completed', 'partial', 'uncertain', 'conflict', 'failed', 'expired'].includes(result.status)) fail();
  return result;
}
export async function cancelDestinationUpdate(invoke, session, attemptId) {
  attemptId = id(attemptId);
  const result = checkedPreview(
    await requestResource(invoke, session, 'cancel_destination_update', { attemptId }),
    attemptId,
  );
  if (result.status !== 'cancelled' || result.changes.length) fail();
  return result;
}
export async function destinationUpdateState(invoke, session) {
  return checkedPreview(await requestResource(invoke, session, 'destination_update_state'));
}
