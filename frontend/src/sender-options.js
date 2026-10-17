import { requestResource, publicDocument } from './resources.js';

const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = () => {
  throw new Error('engine_protocol_error');
};
const text = (value, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max;
function schemas(rows) {
  if (!Array.isArray(rows) || rows.length > 128) fail();
  return rows
    .filter(
      (row) => row && text(row.schemaUri) && ['application/json', 'application/xml'].includes(row.mimeType),
    )
    .map((row) => ({ schemaUri: row.schemaUri, mimeType: row.mimeType }));
}
export function destinationOptions(document) {
  const services = document.publicServices ?? [],
    processes = document.processMessages ?? [];
  if (
    !Array.isArray(services) ||
    services.length > 128 ||
    !Array.isArray(processes) ||
    processes.length > 128
  )
    fail();
  return {
    services: services.map((row) => {
      if (!row || !text(row.identifier, 1024)) fail();
      return {
        identifier: row.identifier,
        name: text(row.name, 256) ? row.name : row.identifier,
        regions: Array.isArray(row.regions) ? row.regions.filter((value) => text(value, 128)) : [],
        schemas: schemas(row.submissionSchemas ?? []),
        replySchemas: schemas(row.replyChannels?.fitConnect?.supportedSchemas ?? []).concat(
          (row.replyChannels?.fitConnect?.processStandards ?? [])
            .filter((value) => text(value))
            .map((schemaUri) => ({ schemaUri, mimeType: 'application/json' })),
        ),
      };
    }),
    processes: processes.map((row) => {
      if (!row || !text(row.processModelId, 1024) || !text(row.messageId, 1024)) fail();
      return {
        processModelId: row.processModelId,
        messageId: row.messageId,
        schemas: schemas(row.schemas ?? []),
      };
    }),
  };
}
export async function loadSendDestination(invoke, session, destinationId) {
  if (!uuid(destinationId)) throw new Error('invalid_input');
  destinationId = destinationId.toLowerCase();
  const data = await requestResource(invoke, session, 'load_send_destination', { destinationId });
  if (!data || Object.keys(data).length !== 2 || data.destinationId !== destinationId) fail();
  return destinationOptions(JSON.parse(publicDocument(data.detailsJson, destinationId)));
}
export async function loadSendSchema(invoke, session, destinationId, selection) {
  if (!uuid(destinationId) || !selection || !text(selection.schemaUri)) throw new Error('invalid_input');
  const schemaDocument = JSON.stringify(selection);
  const page = await requestResource(invoke, session, 'load_send_schema', { destinationId, schemaDocument });
  return (
    await readSchemaPackage(page, selection.schemaUri, (contentId, byteOffset) =>
      requestResource(invoke, session, 'read_send_schema', { contentId, byteOffset }),
    )
  ).document;
}
/** Validate each native schema page and retain its identifier for exact draft checks. */
export async function readSchemaPackage(firstPage, schemaUri, readNext) {
  let page = firstPage;
  let bytes,
    expectedId,
    offset = 0;
  try {
    do {
      if (
        !page ||
        Object.keys(page).length !== 5 ||
        !uuid(page.schemaId) ||
        page.schemaUri !== schemaUri ||
        !Number.isSafeInteger(page.totalBytes) ||
        page.totalBytes < 1 ||
        page.totalBytes > 24 * 1024 * 1024 ||
        page.byteOffset !== offset ||
        typeof page.chunk !== 'string' ||
        page.chunk.length > 16384 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(page.chunk)
      )
        fail();
      if (!bytes) {
        bytes = new Uint8Array(page.totalBytes);
        expectedId = page.schemaId;
      }
      if (page.schemaId !== expectedId || page.totalBytes !== bytes.length) fail();
      const part = Uint8Array.from(atob(page.chunk), (value) => value.charCodeAt(0));
      if (
        btoa(String.fromCharCode(...part)) !== page.chunk ||
        part.length !== Math.min(12 * 1024, bytes.length - offset)
      )
        fail();
      bytes.set(part, offset);
      offset += part.length;
      if (offset < bytes.length) page = await readNext(expectedId, offset);
    } while (offset < bytes.length);
    return Object.freeze({
      schemaId: expectedId,
      document: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    });
  } finally {
    bytes?.fill(0);
  }
}
