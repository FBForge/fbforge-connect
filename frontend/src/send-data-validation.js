import { requestResource } from './resources.js';
import { uploadContent, discardContent, CONTENT_FILE_BYTES } from './content.js';

export async function validateSendData(invoke, session, destinationId, selection, file, schemas = []) {
  if (
    !file ||
    file.size < 1 ||
    file.size > CONTENT_FILE_BYTES ||
    !Array.isArray(schemas) ||
    schemas.length > 32 ||
    schemas.some(
      (item) => !item.file || item.file.size > 2 * 1024 * 1024 || typeof item.uri !== 'string' || !item.uri,
    ) ||
    schemas.reduce((size, item) => size + item.file.size, 0) > 16 * 1024 * 1024
  )
    throw new Error('invalid_input');
  const active = { ...session },
    handles = [];
  let result,
    failure,
    cleanupFailed = false;
  try {
    const data = await uploadContent(invoke, active, file);
    handles.push(data.contentId);
    const references = [];
    for (const item of schemas) {
      const schema = await uploadContent(invoke, active, item.file);
      handles.push(schema.contentId);
      references.push({ uri: item.uri, contentId: schema.contentId });
    }
    result = await requestResource(invoke, active, 'validate_send_data', {
      destinationId,
      schemaDocument: JSON.stringify({ ...selection, contentId: data.contentId, schemas: references }),
    });
    if (
      !result ||
      Object.keys(result).length !== 4 ||
      result.schemaUri !== selection.schemaUri ||
      result.mimeType !== selection.mimeType ||
      result.dataBytes !== file.size ||
      result.valid !== true
    )
      throw new Error('engine_protocol_error');
  } catch (cause) {
    failure = cause;
  } finally {
    for (const contentId of handles) {
      try {
        await discardContent(invoke, active, contentId);
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed) throw new Error('content_cleanup_failed');
  if (failure) throw failure;
  return Object.freeze(result);
}
