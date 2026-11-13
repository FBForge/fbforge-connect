import { requestResource, publicDocument } from './resources.js';
import { record, exactKeys, uuid, text, protocolError as fail } from './dto.ts';
import type {
  NativeInvoke,
  Session,
  RecipientOptions,
  SchemaChoice,
  SchemaSelection,
  PayloadMime,
} from './contracts.d.ts';

const mime = (value: unknown): value is PayloadMime =>
  value === 'application/json' || value === 'application/xml';
const optionalRecord = (value: unknown): Record<string, unknown> => (record(value) ? value : {});
function schemas(rows: unknown): SchemaChoice[] {
  if (!Array.isArray(rows) || rows.length > 128) fail();
  return rows
    .filter(
      (row: unknown): row is SchemaChoice => record(row) && text(row.schemaUri, 4096) && mime(row.mimeType),
    )
    .map(({ schemaUri, mimeType }) => ({ schemaUri, mimeType }));
}
export function destinationOptions(document: unknown): RecipientOptions {
  if (!record(document)) fail();
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
    services: services.map((row: unknown) => {
      if (!record(row) || !text(row.identifier, 1024)) fail();
      const reply = optionalRecord(optionalRecord(row.replyChannels).fitConnect);
      const standards = reply.processStandards ?? [];
      if (!Array.isArray(standards)) fail();
      const standardSchemas: SchemaChoice[] = standards
        .filter((value: unknown): value is string => text(value, 4096))
        .map((schemaUri) => ({ schemaUri, mimeType: 'application/json' }));
      return {
        identifier: row.identifier,
        name: text(row.name, 256) ? row.name : row.identifier,
        regions: Array.isArray(row.regions)
          ? row.regions.filter((value: unknown): value is string => text(value, 128))
          : [],
        schemas: schemas(row.submissionSchemas ?? []),
        replySchemas: schemas(reply.supportedSchemas ?? []).concat(standardSchemas),
      };
    }),
    processes: processes.map((row: unknown) => {
      if (!record(row) || !text(row.processModelId, 1024) || !text(row.messageId, 1024)) fail();
      return {
        processModelId: row.processModelId,
        messageId: row.messageId,
        schemas: schemas(row.schemas ?? []),
      };
    }),
  };
}
export async function loadSendDestination(invoke: NativeInvoke, session: Session, destinationId: string) {
  if (!uuid(destinationId)) throw new Error('invalid_input');
  destinationId = destinationId.toLowerCase();
  const data: unknown = await requestResource(invoke, session, 'load_send_destination', { destinationId });
  if (!exactKeys(data, ['destinationId', 'detailsJson']) || data.destinationId !== destinationId) fail();
  return destinationOptions(JSON.parse(publicDocument(data.detailsJson, destinationId)));
}
export async function loadSendSchema(
  invoke: NativeInvoke,
  session: Session,
  destinationId: string,
  selection: SchemaSelection,
) {
  if (!uuid(destinationId) || !selection || !text(selection.schemaUri, 4096))
    throw new Error('invalid_input');
  const { readAnswerSchema } = await import('./answer-schema-library.js');
  const saved = await readAnswerSchema(invoke, session, selection.schemaUri);
  if (saved)
    return JSON.stringify({
      schemaPackage: 1,
      schemaUri: saved.uri,
      documents: { [saved.uri]: saved.schema },
    });
  const schemaDocument = JSON.stringify(selection);
  const page: unknown = await requestResource(invoke, session, 'load_send_schema', {
    destinationId,
    schemaDocument,
  });
  return (
    await readSchemaPackage(page, selection.schemaUri, (contentId, byteOffset) =>
      requestResource(invoke, session, 'read_send_schema', { contentId, byteOffset }),
    )
  ).document;
}
interface SchemaPage {
  schemaId: string;
  totalBytes: number;
  chunk: string;
}
function schemaPage(value: unknown, uri: string, offset: number): SchemaPage {
  if (
    !exactKeys(value, ['schemaId', 'schemaUri', 'totalBytes', 'byteOffset', 'chunk']) ||
    !uuid(value.schemaId) ||
    value.schemaUri !== uri ||
    typeof value.totalBytes !== 'number' ||
    !Number.isSafeInteger(value.totalBytes) ||
    value.totalBytes < 1 ||
    value.totalBytes > 24 * 1024 * 1024 ||
    value.byteOffset !== offset ||
    typeof value.chunk !== 'string' ||
    value.chunk.length > 16384 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.chunk)
  )
    fail();
  return { schemaId: value.schemaId, totalBytes: value.totalBytes, chunk: value.chunk };
}
/** Validate each native page, wipe temporary bytes even on cancellation or decoding errors. */
export async function readSchemaPackage(
  firstPage: unknown,
  schemaUri: string,
  readNext: (id: string, offset: number) => Promise<unknown>,
): Promise<Readonly<{ schemaId: string; document: string }>> {
  let raw = firstPage,
    bytes: Uint8Array | undefined,
    expectedId = '',
    offset = 0;
  try {
    while (true) {
      const page = schemaPage(raw, schemaUri, offset);
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
      if (offset === bytes.length)
        return Object.freeze({
          schemaId: expectedId,
          document: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        });
      raw = await readNext(expectedId, offset);
    }
  } finally {
    bytes?.fill(0);
  }
}
