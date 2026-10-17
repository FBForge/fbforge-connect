import { requestResource } from './resources.js';
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const text = (value, max = 1024) =>
  typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const exact = (value, fields) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((key) => Object.hasOwn(value, key));
const fail = () => {
  throw new Error('engine_protocol_error');
};
export async function searchProcessDestinations(invoke, session, selection, region = 'DE', offset = 0) {
  if (
    session?.apiVersion !== 'v3' ||
    !text(selection?.processModelId) ||
    !text(selection?.messageId) ||
    !/^DE[0-9]{0,12}$/.test(region) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10000 ||
    offset % 20
  )
    throw new Error('invalid_input');
  const expected = {
    processModelId: selection.processModelId,
    messageId: selection.messageId,
    region,
    offset,
  };
  const value = await requestResource(invoke, session, 'search_process_destinations', {
    destinationDocument: JSON.stringify(expected),
  });
  if (
    !exact(value, ['processModelId', 'messageId', 'region', 'offset', 'totalCount', 'destinations']) ||
    Object.keys(expected).some((key) => value[key] !== expected[key]) ||
    !Number.isSafeInteger(value.totalCount) ||
    value.totalCount < 0 ||
    value.totalCount > 1000000 ||
    !Array.isArray(value.destinations) ||
    value.destinations.length > 20 ||
    offset + value.destinations.length > value.totalCount
  )
    fail();
  const seen = new Set();
  const destinations = value.destinations.map((row) => {
    if (
      !exact(row, ['destinationId', 'type', 'schemas', 'serviceIdentifiers']) ||
      !uuid(row.destinationId) ||
      seen.has(row.destinationId) ||
      row.type !== 'A' ||
      !Array.isArray(row.schemas) ||
      !row.schemas.length ||
      row.schemas.length > 16 ||
      !Array.isArray(row.serviceIdentifiers) ||
      row.serviceIdentifiers.length > 128 ||
      row.serviceIdentifiers.some(
        (id) => typeof id !== 'string' || !/^urn:de:fim:leika:leistung:[0-9]{14}$/.test(id),
      )
    )
      fail();
    seen.add(row.destinationId);
    const schemas = row.schemas.map((item) => {
      if (
        !exact(item, ['schemaUri', 'mimeType']) ||
        !text(item.schemaUri, 4096) ||
        !/^(https:\/\/|urn:)/.test(item.schemaUri) ||
        !['application/json', 'application/xml'].includes(item.mimeType)
      )
        fail();
      return Object.freeze({ ...item });
    });
    return Object.freeze({
      ...row,
      schemas: Object.freeze(schemas),
      serviceIdentifiers: Object.freeze([...row.serviceIdentifiers]),
    });
  });
  return Object.freeze({ ...value, destinations: Object.freeze(destinations) });
}
