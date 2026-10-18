/** Exact, public v3 offers; accepts DTO nulls but never opaque extension/private fields. */
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 1024) =>
  typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const fields = (value, allowed, required = allowed) =>
  object(value) &&
  Object.keys(value).every((key) => allowed.includes(key)) &&
  required.every((key) => Object.hasOwn(value, key));
const uri = (value) => text(value, 4096) && /^(https:\/\/|urn:)/.test(value);
const list = (value, max, valid, empty = true) =>
  Array.isArray(value) &&
  value.length <= max &&
  (empty || value.length > 0) &&
  value.every(valid) &&
  new Set(value.map((item) => JSON.stringify(item))).size === value.length;
function schemas(value) {
  return list(
    value,
    16,
    (row) =>
      fields(row, ['schemaUri', 'mimeType']) &&
      uri(row.schemaUri) &&
      ['application/json', 'application/xml'].includes(row.mimeType),
    false,
  );
}
export function validOffers(value) {
  if (!fields(value, ['publicServices', 'processMessages'])) return false;
  if (
    !list(
      value.publicServices,
      32,
      (row) =>
        fields(
          row,
          ['identifier', 'regions', 'submissionSchemas', 'replyChannels'],
          ['identifier', 'regions', 'submissionSchemas'],
        ) &&
        /^urn:de:fim:leika:leistung:[0-9]{14}$/.test(row.identifier) &&
        list(row.regions, 32, (item) => typeof item === 'string' && /^DE[0-9]{0,12}$/.test(item), false) &&
        schemas(row.submissionSchemas) &&
        (row.replyChannels == null ||
          (fields(row.replyChannels, ['fitConnect']) &&
            fields(row.replyChannels.fitConnect, ['processStandards']) &&
            list(row.replyChannels.fitConnect.processStandards, 16, uri))),
    ) ||
    !list(
      value.processMessages,
      32,
      (row) =>
        fields(row, ['processModelId', 'messageId', 'regions', 'schemas']) &&
        text(row.processModelId) &&
        text(row.messageId) &&
        list(row.regions, 32, (item) => typeof item === 'string' && /^DE[0-9]{0,12}$/.test(item), false) &&
        schemas(row.schemas),
    )
  )
    return false;
  return (
    new Set(value.publicServices.map((row) => row.identifier)).size === value.publicServices.length &&
    new Set(value.processMessages.map((row) => `${row.processModelId}\n${row.messageId}`)).size ===
      value.processMessages.length
  );
}
export function parseOffers(document) {
  if (typeof document !== 'string' || document.length > 44000) throw new Error('engine_protocol_error');
  let value;
  try {
    value = JSON.parse(document);
  } catch {
    throw new Error('engine_protocol_error');
  }
  // Empty legacy offers are valid to display; malformed entries cannot be edited or confirmed.
  if (!validOffers(value)) throw new Error('engine_protocol_error');
  return value;
}
