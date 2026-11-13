import { createChannelSchema, checkedChannelDefinition, schemaIdentifier } from './channel-schemas.js';
export const answerSchemaChanges = new EventTarget();
const fail = () => {
  throw Error('schema_library_invalid');
};
const uuid = (v) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function summary(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).length !== 3 ||
    !uuid(value.revision) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 160
  )
    fail();
  schemaIdentifier(value.uri);
  return { uri: value.uri, title: value.title, revision: value.revision };
}
function entries(value) {
  if (!Array.isArray(value) || value.length > 32) fail();
  const rows = value.map(summary);
  if (new Set(rows.map((r) => r.uri)).size !== rows.length) fail();
  return rows;
}
function call(invoke, session, action) {
  if (!session?.connected || !uuid(session.sessionId)) throw Error('session_missing');
  return invoke('profile_answer_schemas', {
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
    action,
  });
}
export async function listAnswerSchemas(invoke, session) {
  return session ? entries(await call(invoke, session, { action: 'list' })) : [];
}
export async function readAnswerSchema(invoke, session, uri) {
  try {
    schemaIdentifier(uri);
  } catch {
    return null;
  }
  if (!session) return null;
  const value = await call(invoke, session, { action: 'read', uri });
  if (value === null) return null;
  if (
    !value ||
    Object.keys(value).sort().join() !== ['uri', 'title', 'revision', 'schema', 'draft'].sort().join()
  )
    fail();
  summary({ uri: value.uri, title: value.title, revision: value.revision });
  const definition = checkedChannelDefinition(value.draft?.definition);
  const generated = createChannelSchema(definition);
  if (
    value.uri !== uri ||
    value.title !== definition.title ||
    value.schema?.$id !== uri ||
    JSON.stringify(value.schema) !== JSON.stringify(generated.schema)
  ) {
    // Object property order in native JSON is immaterial.
    if (value.uri !== uri || value.title !== definition.title || !equivalent(value.schema, generated.schema))
      fail();
  }
  return { ...value, draft: generated.draft };
}
function equivalent(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b))
    return false;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((k) => Object.hasOwn(b, k) && equivalent(a[k], b[k]))
  );
}
export async function saveAnswerSchema(invoke, session, result, previous = null) {
  const entry = {
    uri: result.schema.$id,
    title: result.schema.title,
    revision: crypto.randomUUID(),
    schema: result.schema,
    draft: result.draft,
  };
  const resultRows = entries(
    await call(invoke, session, { action: 'save', entry, expectedRevision: previous?.revision || null }),
  );
  answerSchemaChanges.dispatchEvent(new Event('change'));
  return resultRows;
}
export async function deleteAnswerSchema(invoke, session, row) {
  const resultRows = entries(
    await call(invoke, session, { action: 'delete', uri: row.uri, expectedRevision: row.revision }),
  );
  answerSchemaChanges.dispatchEvent(new Event('change'));
  return resultRows;
}
export async function savedAnswerSchemaFile(invoke, session, uri) {
  const entry = await readAnswerSchema(invoke, session, uri);
  return entry
    ? new File([JSON.stringify(entry.schema)], 'antwort.schema.json', { type: 'application/schema+json' })
    : null;
}
export function answerSchemaError(cause) {
  const code = typeof cause === 'string' ? cause : cause?.message;
  return (
    {
      vault_profile_required:
        'Bitte ein gespeichertes Profil verbinden, um Antwortschemas dauerhaft abzulegen.',
      schema_library_conflict:
        'Die gespeicherte Definition wurde inzwischen geändert. Bitte neu laden und die Änderungen vergleichen.',
      schema_library_limit: 'Die Bibliothek ist voll. Pro Profil sind bis zu 32 Antwortschemas möglich.',
    }[code] ||
    'Die Antwortschema-Bibliothek konnte nicht gelesen oder gespeichert werden. Bitte die Profilverbindung prüfen.'
  );
}
