// Synthetic memory-only storage. Actual DPAPI/restart tests live in native-contracts.
const saved = new Map();
export function testLibraryFixture(request) {
  const summary = (id, pack) => ({
    id,
    name: pack.name,
    cases: pack.cases.map(({ id, name }) => ({ id, name })),
  });
  if (request.action === 'list') return [...saved].map(([id, pack]) => summary(id, pack));
  if (request.action === 'read') return structuredClone(saved.get(request.id));
  if (request.action === 'delete') {
    saved.delete(request.id);
    return null;
  }
  if (request.action === 'save') {
    if (saved.has(request.id)) throw 'test_library_conflict';
    saved.set(request.id, structuredClone(request.pack));
    return summary(request.id, request.pack);
  }
  throw 'invalid_input';
}
