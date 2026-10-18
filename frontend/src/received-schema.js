import { requestResource } from './resources.js';
import { SCHEMA_VIEW_BYTES } from './schema-annotations.js';
const fail = () => {
  throw new Error('engine_protocol_error');
};
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validUri = (value) => {
  if (value === null) return true;
  try {
    return typeof value === 'string' && value.length <= 4096 && Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
};
/** Reads only the schema snapshot bound to this proof. It cannot fetch another remote resource. */
export async function readReceivedSchema(invoke, session, proofId, { reply = false, signal } = {}) {
  if (!uuid(proofId)) throw new Error('invalid_input');
  const check = () => {
    if (signal?.aborted) throw new Error('content_cancelled');
  };
  let bytes,
    offset = 0,
    uri,
    total;
  try {
    do {
      check();
      const page = await requestResource(
        invoke,
        session,
        reply ? 'read_received_reply_schema' : 'read_received_schema',
        { proofId, byteOffset: offset },
      );
      check();
      if (
        !page ||
        Object.keys(page).length !== 5 ||
        !['proofId', 'schemaUri', 'totalBytes', 'byteOffset', 'chunk'].every((key) =>
          Object.hasOwn(page, key),
        ) ||
        page.proofId !== proofId ||
        !validUri(page.schemaUri) ||
        !Number.isSafeInteger(page.totalBytes) ||
        page.totalBytes < 0 ||
        page.totalBytes > 24 * 1024 * 1024 ||
        page.byteOffset !== offset ||
        typeof page.chunk !== 'string' ||
        page.chunk.length > 16384 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(page.chunk) ||
        (total !== undefined && (page.totalBytes !== total || page.schemaUri !== uri))
      )
        fail();
      const part = Uint8Array.from(atob(page.chunk), (character) => character.charCodeAt(0));
      try {
        if (
          btoa(String.fromCharCode(...part)) !== page.chunk ||
          part.length !== Math.min(12 * 1024, page.totalBytes - offset)
        )
          fail();
        if (total === undefined) {
          total = page.totalBytes;
          uri = page.schemaUri;
          if (!total) return { status: 'unavailable', schemaUri: uri, document: null };
          if (uri === null) fail();
          if (total > SCHEMA_VIEW_BYTES) return { status: 'limited', schemaUri: uri, document: null };
          bytes = new Uint8Array(total);
        }
        bytes.set(part, offset);
        offset += part.length;
      } finally {
        part.fill(0);
      }
    } while (offset < total);
    let document;
    try {
      document = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fail();
    }
    return { status: 'ready', schemaUri: uri, document };
  } finally {
    bytes?.fill(0);
  }
}
