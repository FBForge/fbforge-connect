import { requestResource } from './resources.js';

export const CONTENT_CHUNK_BYTES = 24 * 1024;
export const CONTENT_FILE_BYTES = 32 * 1024 * 1024;
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = () => {
  throw new Error('engine_protocol_error');
};
const size = (value) => Number.isSafeInteger(value) && value >= 0 && value <= CONTENT_FILE_BYTES;
function exact(value, fields) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}
function snapshot(data) {
  if (
    !exact(data, ['contentId', 'totalBytes', 'receivedBytes', 'complete']) ||
    !uuid(data.contentId) ||
    !size(data.totalBytes) ||
    !size(data.receivedBytes) ||
    data.receivedBytes > data.totalBytes ||
    data.complete !== (data.receivedBytes === data.totalBytes)
  )
    fail();
  return Object.freeze({
    contentId: data.contentId,
    totalBytes: data.totalBytes,
    receivedBytes: data.receivedBytes,
    complete: data.complete,
  });
}
async function begin(invoke, session, totalBytes) {
  const state = snapshot(await requestResource(invoke, session, 'begin_content', { totalBytes }));
  if (state.totalBytes !== totalBytes || state.receivedBytes !== 0) fail();
  return state;
}
async function append(invoke, session, state, bytes) {
  const chunk = btoa(String.fromCharCode(...bytes));
  const next = snapshot(
    await requestResource(invoke, session, 'append_content', {
      contentId: state.contentId,
      byteOffset: state.receivedBytes,
      chunk,
    }),
  );
  if (
    next.contentId !== state.contentId ||
    next.totalBytes !== state.totalBytes ||
    next.receivedBytes !== state.receivedBytes + bytes.byteLength
  )
    fail();
  return next;
}
export async function discardContent(invoke, session, contentId) {
  if (!uuid(contentId)) throw new Error('invalid_input');
  const data = await requestResource(invoke, session, 'discard_content', { contentId });
  if (!exact(data, ['contentId']) || data.contentId !== contentId) fail();
}

/** Transfers one File/Blob in bounded pieces. This never sends a FIT-Connect submission. */
export async function uploadContent(invoke, session, file, { signal, onProgress } = {}) {
  if (!file || !size(file.size) || typeof file.slice !== 'function') throw new Error('invalid_input');
  const active = session
    ? {
        apiVersion: session.apiVersion,
        sessionId: session.sessionId,
        environment: session.environment,
        connected: session.connected,
      }
    : null;
  const checkCancelled = () => {
    if (signal?.aborted) throw new Error('content_cancelled');
  };
  let state;
  try {
    checkCancelled();
    state = await begin(invoke, active, file.size);
    checkCancelled();
    onProgress?.(state);
    while (!state.complete) {
      checkCancelled();
      const end = Math.min(state.receivedBytes + CONTENT_CHUNK_BYTES, state.totalBytes);
      const bytes = new Uint8Array(await file.slice(state.receivedBytes, end).arrayBuffer());
      try {
        checkCancelled();
        if (bytes.byteLength !== end - state.receivedBytes) throw new Error('invalid_input');
        state = await append(invoke, active, state, bytes);
      } finally {
        bytes.fill(0);
      }
      checkCancelled();
      onProgress?.(state);
    }
    return state;
  } catch (error) {
    if (state) {
      try {
        await discardContent(invoke, active, state.contentId);
      } catch {
        throw new Error('content_cleanup_failed');
      }
    }
    throw error;
  }
}
