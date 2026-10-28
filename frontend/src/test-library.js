import { validateTestPack } from './test-packs.js';
const uuid = (id) =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const title = (name) =>
  typeof name === 'string' && name.trim() && name.length <= 160 && !/[\x00-\x1f\x7f]/.test(name);
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const fail = () => {
  throw new Error('engine_protocol_error');
};
export function librarySummary(value) {
  if (
    !exact(value, ['id', 'name', 'cases']) ||
    !uuid(value.id) ||
    !title(value.name) ||
    !Array.isArray(value.cases) ||
    !value.cases.length ||
    value.cases.length > 20 ||
    value.cases.some(
      (item) =>
        !exact(item, ['id', 'name']) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id) || !title(item.name),
    ) ||
    new Set(value.cases.map((item) => item.id)).size !== value.cases.length
  )
    fail();
  return value;
}
export async function listTestLibrary(invoke) {
  const rows = await invoke('test_library', { request: { action: 'list' } });
  if (!Array.isArray(rows) || rows.length > 32) fail();
  const checked = rows.map(librarySummary);
  if (new Set(checked.map((row) => row.id)).size !== checked.length) fail();
  return checked;
}
export async function readTestLibrary(invoke, id) {
  if (!uuid(id)) throw new Error('test_pack_invalid');
  return validateTestPack(await invoke('test_library', { request: { action: 'read', id } }));
}
export async function saveTestLibrary(invoke, pack) {
  validateTestPack(pack);
  const id = crypto.randomUUID();
  const saved = librarySummary(await invoke('test_library', { request: { action: 'save', id, pack } }));
  if (
    saved.id !== id ||
    saved.name !== pack.name ||
    JSON.stringify(saved.cases) !== JSON.stringify(pack.cases.map(({ id, name }) => ({ id, name })))
  )
    fail();
  return saved;
}
export async function deleteTestLibrary(invoke, id) {
  if (!uuid(id)) throw new Error('test_pack_invalid');
  if ((await invoke('test_library', { request: { action: 'delete', id } })) !== null) fail();
}
export function testLibraryError(cause) {
  const code = typeof cause === 'string' ? cause : cause?.message;
  if (code === 'vault_unsupported')
    return 'Die geschützte Testfallsammlung ist auf diesem Betriebssystem noch nicht verfügbar. Sie können den Entwurf als Testpaket exportieren.';
  if (code === 'test_pack_limit')
    return 'Das Testpaket ist zu groß. Maximal knapp 8 MiB je gespeichertes Paket. Bitte reduzieren Sie Anlagen oder lokale Schemata.';
  if (code === 'vault_limit')
    return 'Die Sammlung ist voll. Maximal 32 Testpakete und insgesamt 64 MiB. Bitte exportieren und löschen Sie nicht mehr benötigte Pakete.';
  return 'Die Testfallsammlung konnte nicht verarbeitet werden. Ihre Entwurfsdaten bleiben erhalten. Bitte prüfen Sie Dateiformat, Größe und lokalen Speicherzugriff.';
}
