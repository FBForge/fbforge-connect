import { validEnvironment } from './environments.js';
/** Public profile operations only. Secrets and private archive items are never returned by native code. */
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));
const fail = () => {
  throw new Error('engine_protocol_error');
};
export async function listProfiles(invoke) {
  const value = await invoke('list_profiles');
  if (!Array.isArray(value) || value.length > 32) fail();
  const seen = new Set();
  return Object.freeze(
    value.map((item) => {
      if (
        !(
          exact(item, [
            'profileId',
            'name',
            'clientId',
            'apiVersion',
            'role',
            'keyCount',
            'available',
            'environment',
          ]) || exact(item, ['profileId', 'name', 'clientId', 'apiVersion', 'role', 'keyCount', 'available'])
        ) ||
        (Object.hasOwn(item, 'environment') &&
          (item.available ? !validEnvironment(item.environment) : item.environment !== null)) ||
        !uuid(item.profileId) ||
        seen.has(item.profileId) ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        new TextEncoder().encode(item.name).length > 120 ||
        /[\x00-\x1f\x7f]/.test(item.name) ||
        !Number.isSafeInteger(item.keyCount) ||
        item.keyCount < 0 ||
        item.keyCount > 176 ||
        typeof item.available !== 'boolean' ||
        (item.available
          ? typeof item.clientId !== 'string' ||
            !item.clientId.trim() ||
            new TextEncoder().encode(item.clientId).length > 512
          : item.clientId !== null) ||
        (item.available
          ? !['v2', 'v3'].includes(item.apiVersion) ||
            !['online-service', 'administrative-system'].includes(item.role)
          : item.apiVersion !== null || item.role !== null || item.keyCount !== 0)
      )
        fail();
      seen.add(item.profileId);
      return Object.freeze({ ...item, environment: item.environment ?? (item.available ? 'TEST' : null) });
    }),
  );
}
export async function openSavedProfile(invoke, profile, restoreKeys = true) {
  if (!uuid(profile?.profileId) || !profile.available || typeof restoreKeys !== 'boolean')
    throw new Error('invalid_input');
  const value = await invoke('open_saved_profile', { profileId: profile.profileId, restoreKeys });
  if (
    !exact(value, ['apiVersion', 'sessionId', 'role', 'environment', 'connected']) ||
    !uuid(value.sessionId) ||
    value.apiVersion !== profile.apiVersion ||
    value.role !== profile.role ||
    value.environment !== (profile.environment ?? 'TEST') ||
    value.connected !== true
  )
    fail();
  return Object.freeze({ ...value, clientId: profile.clientId });
}
export async function forgetProfile(invoke, profileId) {
  if (!uuid(profileId)) throw new Error('invalid_input');
  const result = await invoke('forget_profile', { profileId });
  if (result !== null) fail();
}
export async function profileStatus(invoke, sessionId) {
  if (!uuid(sessionId)) throw new Error('invalid_input');
  const value = await invoke('profile_status', { sessionId });
  if (
    !exact(value, ['profileId', 'saved', 'error']) ||
    typeof value.saved !== 'boolean' ||
    (value.profileId === null
      ? value.saved || value.error !== null
      : !uuid(value.profileId) || (value.saved ? value.error !== null : value.error !== 'vault_unavailable'))
  )
    fail();
  return Object.freeze({ ...value });
}
export async function saveProfileState(invoke, session) {
  if (!uuid(session?.sessionId) || !['v2', 'v3'].includes(session.apiVersion))
    throw new Error('invalid_input');
  const result = await invoke('save_profile_state', {
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
  });
  if (result !== null) fail();
}

/** File paths and encrypted backup bytes stay inside the native file-dialog operation. */
export async function exportProfileBackup(invoke, profileId) {
  if (!uuid(profileId)) throw new Error('invalid_input');
  const value = await invoke('export_profile_backup', { profileId });
  if (typeof value !== 'boolean') fail();
  return value;
}
export async function importProfileBackup(invoke) {
  const value = await invoke('import_profile_backup');
  if (value === null) return null;
  return (await listProfiles(async () => [value]))[0];
}
// Keep the persisted v1 marker so existing protected backups remain importable.
const backupMagic = new TextEncoder().encode('FIT-Connect Test-Client protected profile v1\n');
const backupLimit = 8 * 1024 * 1024 + backupMagic.length;
/** The WebView forwards only a bounded encrypted file. DPAPI decryption stays native. */
export async function importProfileBackupFile(invoke, file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= backupMagic.length || file.size > backupLimit)
    throw new Error('vault_invalid');
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== file.size || !backupMagic.every((value, index) => bytes[index] === value))
      throw new Error('vault_invalid');
    const result = await invoke('import_profile_backup_file', bytes);
    return (await listProfiles(async () => [result]))[0];
  } finally {
    bytes?.fill(0);
  }
}
export async function updateProfile(invoke, profileId, name, newSecret = null) {
  if (
    !uuid(profileId) ||
    typeof name !== 'string' ||
    !name.trim() ||
    new TextEncoder().encode(name).length > 120 ||
    /[\x00-\x1f\x7f]/.test(name) ||
    (newSecret !== null && (typeof newSecret !== 'string' || !newSecret.trim() || newSecret.length > 8192))
  )
    throw new Error('invalid_input');
  const value = await invoke('update_profile', { profileId, name, newSecret });
  const result = (await listProfiles(async () => [value]))[0];
  if (result.profileId !== profileId || result.name !== name) fail();
  return result;
}

function defaultsContext(session) {
  if (
    !uuid(session?.sessionId) ||
    !['v2', 'v3'].includes(session.apiVersion) ||
    !validEnvironment(session.environment) ||
    session.connected !== true
  )
    throw new Error('session_missing');
  return { apiVersion: session.apiVersion, sessionId: session.sessionId };
}
function checkedDefaults(value, apiVersion) {
  if (
    !exact(value, ['sourceDestination', 'receiverDestination']) ||
    ![value.sourceDestination, value.receiverDestination].every((id) => id === null || uuid(id)) ||
    (apiVersion === 'v2' && value.sourceDestination !== null)
  )
    fail();
  return Object.freeze({ ...value });
}
export async function getProfileDefaults(invoke, session) {
  const value = await invoke('get_profile_defaults', defaultsContext(session));
  return value === null ? null : checkedDefaults(value, session.apiVersion);
}
export async function saveProfileDefaults(invoke, session, defaults) {
  const expected = checkedDefaults(defaults, session?.apiVersion);
  const result = checkedDefaults(
    await invoke('save_profile_defaults', { ...defaultsContext(session), defaults: expected }),
    session.apiVersion,
  );
  if (Object.keys(expected).some((key) => result[key] !== expected[key])) fail();
  return result;
}
