import { validEnvironment } from './environments.js';
import { record, exactKeys as exact, protocolError as fail, uuid as validUuid } from './dto.ts';
import type {
  NativeInvoke,
  SavedProfile,
  Session,
  ApiVersion,
  ProfileDefaults,
  ProfileStorageStatus,
  Environment,
} from './contracts.d.ts';
const uuid = (value: unknown): value is string => validUuid(value, false);
function profileName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    new TextEncoder().encode(value).length <= 120 &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
/** Decode public metadata only. Neither credentials nor native archive fields survive. */
function profileSummary(value: unknown): SavedProfile {
  if (
    !record(value) ||
    !(
      exact(value, [
        'profileId',
        'name',
        'clientId',
        'apiVersion',
        'role',
        'keyCount',
        'available',
        'environment',
      ]) || exact(value, ['profileId', 'name', 'clientId', 'apiVersion', 'role', 'keyCount', 'available'])
    ) ||
    !uuid(value.profileId) ||
    !profileName(value.name) ||
    typeof value.keyCount !== 'number' ||
    !Number.isSafeInteger(value.keyCount) ||
    value.keyCount < 0 ||
    value.keyCount > 176 ||
    typeof value.available !== 'boolean'
  )
    fail();
  const base = { profileId: value.profileId, name: value.name, keyCount: value.keyCount };
  if (value.available) {
    const environment = Object.hasOwn(value, 'environment') ? value.environment : 'TEST';
    if (
      !validEnvironment(environment) ||
      typeof value.clientId !== 'string' ||
      !value.clientId.trim() ||
      new TextEncoder().encode(value.clientId).length > 512 ||
      (value.apiVersion !== 'v2' && value.apiVersion !== 'v3') ||
      (value.role !== 'online-service' && value.role !== 'administrative-system')
    )
      fail();
    return Object.freeze({
      ...base,
      available: true,
      clientId: value.clientId,
      apiVersion: value.apiVersion,
      role: value.role,
      environment: environment as Environment,
    });
  }
  if (
    value.clientId !== null ||
    value.apiVersion !== null ||
    value.role !== null ||
    value.keyCount !== 0 ||
    (Object.hasOwn(value, 'environment') && value.environment !== null)
  )
    fail();
  return Object.freeze({
    ...base,
    available: false,
    environment: null,
    clientId: null,
    apiVersion: null,
    role: null,
  });
}
export async function listProfiles(invoke: NativeInvoke): Promise<readonly SavedProfile[]> {
  const raw = await invoke('list_profiles');
  if (!Array.isArray(raw) || raw.length > 32) fail();
  const profiles = raw.map((value: unknown) => profileSummary(value));
  if (new Set(profiles.map((profile) => profile.profileId)).size !== profiles.length) fail();
  return Object.freeze(profiles);
}
export async function openSavedProfile(
  invoke: NativeInvoke,
  profile: SavedProfile,
  restoreKeys = true,
): Promise<Session> {
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
  return Object.freeze({ ...value, clientId: profile.clientId }) as Session;
}
export async function forgetProfile(invoke: NativeInvoke, profileId: string) {
  if (!uuid(profileId)) throw new Error('invalid_input');
  const result = await invoke('forget_profile', { profileId });
  if (result !== null) fail();
}
export async function profileStatus(invoke: NativeInvoke, sessionId: string): Promise<ProfileStorageStatus> {
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
  return Object.freeze({ ...value }) as ProfileStorageStatus;
}
export async function saveProfileState(invoke: NativeInvoke, session: Session) {
  if (!uuid(session?.sessionId) || !['v2', 'v3'].includes(session.apiVersion))
    throw new Error('invalid_input');
  const result = await invoke('save_profile_state', {
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
  });
  if (result !== null) fail();
}

/** File paths and encrypted backup bytes stay inside the native file-dialog operation. */
export async function exportProfileBackup(invoke: NativeInvoke, profileId: string) {
  if (!uuid(profileId)) throw new Error('invalid_input');
  const value = await invoke('export_profile_backup', { profileId });
  if (typeof value !== 'boolean') fail();
  return value;
}
export async function importProfileBackup(invoke: NativeInvoke) {
  const value = await invoke('import_profile_backup');
  if (value === null) return null;
  return profileSummary(value);
}
// Keep the persisted v1 marker so existing protected backups remain importable.
const backupMagic = new TextEncoder().encode('FIT-Connect Test-Client protected profile v1\n');
const backupLimit = 8 * 1024 * 1024 + backupMagic.length;
/** The WebView forwards only a bounded encrypted file. DPAPI decryption stays native. */
export async function importProfileBackupFile(invoke: NativeInvoke, file: File) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= backupMagic.length || file.size > backupLimit)
    throw new Error('vault_invalid');
  let bytes: Uint8Array | undefined;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    const contents = bytes;
    if (contents.length !== file.size || !backupMagic.every((value, index) => contents[index] === value))
      throw new Error('vault_invalid');
    const result = await invoke('import_profile_backup_file', bytes);
    return profileSummary(result);
  } finally {
    bytes?.fill(0);
  }
}
export async function updateProfile(
  invoke: NativeInvoke,
  profileId: string,
  name: string,
  newSecret: string | null = null,
) {
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
  const result = profileSummary(value);
  if (result.profileId !== profileId || result.name !== name) fail();
  return result;
}

function defaultsContext(session: Session) {
  if (
    !uuid(session?.sessionId) ||
    !['v2', 'v3'].includes(session.apiVersion) ||
    !validEnvironment(session.environment) ||
    session.connected !== true
  )
    throw new Error('session_missing');
  return { apiVersion: session.apiVersion, sessionId: session.sessionId };
}
function checkedDefaults(value: unknown, apiVersion?: ApiVersion): ProfileDefaults {
  if (
    !exact(value, ['sourceDestination', 'receiverDestination']) ||
    ![value.sourceDestination, value.receiverDestination].every((id) => id === null || uuid(id)) ||
    (apiVersion === 'v2' && value.sourceDestination !== null)
  )
    fail();
  return Object.freeze({ ...value }) as ProfileDefaults;
}
export async function getProfileDefaults(invoke: NativeInvoke, session: Session) {
  const value = await invoke('get_profile_defaults', defaultsContext(session));
  return value === null ? null : checkedDefaults(value, session.apiVersion);
}
export async function saveProfileDefaults(invoke: NativeInvoke, session: Session, defaults: ProfileDefaults) {
  const expected = checkedDefaults(defaults, session?.apiVersion);
  const result = checkedDefaults(
    await invoke('save_profile_defaults', { ...defaultsContext(session), defaults: expected }),
    session.apiVersion,
  );
  if ((['sourceDestination', 'receiverDestination'] as const).some((key) => result[key] !== expected[key]))
    fail();
  return result;
}

/** Clone only protected credentials; protocol-bound keys and cases stay with their API profile. */
export async function copyProfileForApi(
  invoke: NativeInvoke,
  profile: SavedProfile,
  apiVersion: ApiVersion,
  targetProfileId: string = crypto.randomUUID(),
) {
  if (
    !uuid(profile?.profileId) ||
    !profile.available ||
    !['v2', 'v3'].includes(apiVersion) ||
    apiVersion === profile.apiVersion ||
    !uuid(targetProfileId) ||
    targetProfileId === profile.profileId
  )
    throw new Error('invalid_input');
  const value = await invoke('copy_profile_for_api', {
    profileId: profile.profileId,
    targetProfileId,
    apiVersion,
  });
  const result = profileSummary(value);
  if (
    result.profileId !== targetProfileId ||
    result.apiVersion !== apiVersion ||
    result.clientId !== profile.clientId ||
    result.role !== profile.role ||
    result.environment !== profile.environment
  )
    fail();
  return result;
}
