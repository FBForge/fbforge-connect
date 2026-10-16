/** Public profile operations only. Secrets and private archive items are never returned by native code. */
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const fail = () => { throw new Error('engine_protocol_error'); };
export async function listProfiles(invoke) {
  const value = await invoke('list_profiles');
  if (!Array.isArray(value) || value.length > 32) fail();
  const seen = new Set();
  return Object.freeze(value.map(item => {
    if (!exact(item, ['profileId', 'name', 'apiVersion', 'role', 'keyCount', 'available']) || !uuid(item.profileId) || seen.has(item.profileId)
        || typeof item.name !== 'string' || !item.name.trim() || new TextEncoder().encode(item.name).length > 120 || /[\x00-\x1f\x7f]/.test(item.name)
        || !Number.isSafeInteger(item.keyCount) || item.keyCount < 0 || item.keyCount > 48 || typeof item.available !== 'boolean'
        || (item.available ? !['v2', 'v3'].includes(item.apiVersion) || !['online-service', 'administrative-system'].includes(item.role)
          : item.apiVersion !== null || item.role !== null || item.keyCount !== 0)) fail();
    seen.add(item.profileId); return Object.freeze({ ...item });
  }));
}
export async function openSavedProfile(invoke, profile, restoreKeys = true) {
  if (!uuid(profile?.profileId) || !profile.available || typeof restoreKeys !== 'boolean') throw new Error('invalid_input');
  const value = await invoke('open_saved_profile', { profileId: profile.profileId, restoreKeys });
  if (!exact(value, ['apiVersion', 'sessionId', 'role', 'environment', 'connected']) || !uuid(value.sessionId)
      || value.apiVersion !== profile.apiVersion || value.role !== profile.role || value.environment !== 'TEST' || value.connected !== true) fail();
  return Object.freeze({ ...value });
}
export async function forgetProfile(invoke, profileId) {
  if (!uuid(profileId)) throw new Error('invalid_input');
  const result = await invoke('forget_profile', { profileId });
  if (result !== null) fail();
}
export async function profileStatus(invoke, sessionId) {
  if (!uuid(sessionId)) throw new Error('invalid_input');
  const value = await invoke('profile_status', { sessionId });
  if (!exact(value, ['profileId', 'saved', 'error']) || typeof value.saved !== 'boolean'
      || (value.profileId === null ? value.saved || value.error !== null : !uuid(value.profileId)
        || (value.saved ? value.error !== null : value.error !== 'vault_unavailable'))) fail();
  return Object.freeze({ ...value });
}
export async function saveProfileState(invoke, session) {
  if (!uuid(session?.sessionId) || !['v2', 'v3'].includes(session.apiVersion)) throw new Error('invalid_input');
  const result = await invoke('save_profile_state', { apiVersion: session.apiVersion, sessionId: session.sessionId });
  if (result !== null) fail();
}
