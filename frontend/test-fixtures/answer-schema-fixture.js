// Synthetic browser storage only. Production definitions use the native encrypted profile.
export function answerSchemaFixture(action) {
  const entries = JSON.parse(localStorage.getItem('fixture-answer-schemas') || '[]');
  const summaries = () => entries.map(({ uri, title, revision }) => ({ uri, title, revision }));
  if (action.action === 'list') return summaries();
  if (action.action === 'read') return entries.find((e) => e.uri === action.uri) || null;
  if (action.action === 'save') {
    const index = entries.findIndex((e) => e.uri === action.entry.uri);
    if ((index >= 0 ? entries[index].revision : null) !== action.expectedRevision)
      throw 'schema_library_conflict';
    if (index >= 0) entries.splice(index, 1);
    entries.push(action.entry);
  } else if (action.action === 'delete') {
    const index = entries.findIndex((e) => e.uri === action.uri && e.revision === action.expectedRevision);
    if (index < 0) throw 'schema_library_conflict';
    entries.splice(index, 1);
  } else throw 'invalid_input';
  localStorage.setItem('fixture-answer-schemas', JSON.stringify(entries));
  return summaries();
}
