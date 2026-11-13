import { listAnswerSchemas, savedAnswerSchemaFile } from './answer-schema-library.js';
import { uploadContent, discardContent } from './content.js';

// Explicitly selected local files take precedence. Protected profile definitions remain offline.
export async function withSavedSchemaCatalog(invoke, session, selected, operation) {
  const catalog = [...selected],
    handles = [];
  let failed = false,
    result,
    failure;
  try {
    const saved = await listAnswerSchemas(invoke, session);
    for (const row of saved) {
      if (catalog.some((item) => item.uri === row.uri)) continue;
      if (catalog.length >= 32) throw Error('schema_library_limit');
      const file = await savedAnswerSchemaFile(invoke, session, row.uri);
      if (!file) throw Error('schema_library_conflict');
      const handle = await uploadContent(invoke, session, file);
      handles.push(handle.contentId);
      catalog.push({ uri: row.uri, contentId: handle.contentId });
    }
    result = await operation(catalog);
  } catch (cause) {
    failed = true;
    failure = cause;
  }
  let cleanupFailed = false;
  for (const contentId of handles) {
    try {
      await discardContent(invoke, session, contentId);
    } catch {
      cleanupFailed = true;
    }
  }
  if (failed) throw failure;
  if (cleanupFailed) throw Error('content_cleanup_failed');
  return result;
}
