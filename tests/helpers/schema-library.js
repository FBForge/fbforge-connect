import assert from 'node:assert/strict';
// Existing protocol tests isolate their SDK boundary from a separate, empty profile library.
export const emptySchemaLibrary = (invoke) => (command, args) => {
  if (command !== 'profile_answer_schemas') return invoke(command, args);
  assert.ok(['read', 'list'].includes(args.action.action), 'read-only schema lookup');
  return args.action.action === 'list' ? [] : null;
};
