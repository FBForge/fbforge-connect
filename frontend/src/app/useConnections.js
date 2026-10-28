import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { invoke } from '../native.js';
import { errorMessage } from '../diagnostics.js';
import { openSession, openSessionForApi, updateSession, resetsSessions } from '../sessions.js';
import {
  listProfiles,
  openSavedProfile,
  forgetProfile,
  profileStatus,
  saveProfileState,
  exportProfileBackup,
  importProfileBackup,
  importProfileBackupFile,
  getProfileDefaults,
  copyProfileForApi,
} from '../profiles.js';

// Owns connection credentials, saved profiles and their session-bound defaults.
export function useConnections({
  apiVersion,
  environment = ref('TEST'),
  beforeChange,
  focusFallback,
  profileOpened,
  addEvent,
}) {
  const busy = ref(false),
    pendingAction = ref(''),
    error = ref('');
  const role = 'online-service';
  const clientId = ref('');
  const clientSecret = ref('');
  const rememberProfile = ref(false),
    profileName = ref(''),
    profiles = shallowRef([]),
    storageStatus = shallowRef(null),
    profileError = ref(''),
    profileNotice = ref(''),
    forgetCandidate = shallowRef(null),
    forgetDialog = ref(null);
  const sessions = ref({});
  const selectedDestination = ref('');
  const defaultDestinations = shallowRef(null);
  const activeSession = computed(() => sessions.value[apiVersion.value]);
  const connectionDialog = ref(null);
  watch(apiVersion, () => {
    clientId.value = '';
    clientSecret.value = '';
    error.value = '';
  });
  watch(
    () => activeSession.value?.sessionId,
    () => {
      selectedDestination.value = '';
      defaultDestinations.value = null;
      storageStatus.value = null;
      void refreshStorageStatus();
    },
  );
  async function sessionAction(action) {
    if (busy.value) return;
    if ((await beforeChange()) === false || busy.value) return;
    busy.value = true;
    pendingAction.value = action;
    error.value = '';
    const version = apiVersion.value;
    const selectedRole = role;
    const key = version;
    const current = sessions.value[key];
    const credentials = { clientId: clientId.value, clientSecret: clientSecret.value };
    clientSecret.value = '';
    if (action === 'open') clientId.value = '';
    const started = performance.now();
    let status = 'Erfolgreich';
    try {
      if (!isTauri()) throw new Error('desktop_required');
      delete sessions.value[key];
      const result =
        action === 'open'
          ? await openSession(
              invoke,
              version,
              selectedRole,
              credentials.clientId,
              credentials.clientSecret,
              rememberProfile.value
                ? { profileId: crypto.randomUUID(), name: profileName.value.trim() }
                : null,
              environment.value,
            )
          : await updateSession(invoke, current, action === 'check');
      if (result.connected) {
        sessions.value[key] = result;
        if (action === 'open') {
          connectionDialog.value?.close();
          void refreshProfiles();
        }
      }
    } catch (cause) {
      status = 'Fehlgeschlagen';
      const code = typeof cause === 'string' ? cause : cause?.message;
      if (
        current &&
        ([
          'engine_busy',
          'invalid_credentials',
          'invalid_input',
          'desktop_required',
          'vault_pending',
        ].includes(code) ||
          (action !== 'open' && code?.startsWith('vault_')))
      )
        sessions.value[key] = current;
      if (resetsSessions(cause)) sessions.value = {};
      error.value = errorMessage(cause);
    } finally {
      credentials.clientId = '';
      credentials.clientSecret = '';
      addEvent(
        version,
        { open: 'Anmeldung', check: 'Sitzung prüfen', close: 'Abmelden' }[action],
        status,
        started,
        selectedRole === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      );
      busy.value = false;
      pendingAction.value = '';
    }
  }
  let connectionOpener;
  function showConnection() {
    connectionOpener = document.activeElement;
    void refreshProfiles();
    if (!connectionDialog.value?.open) connectionDialog.value?.showModal();
  }
  function connectionClosed() {
    clientId.value = '';
    clientSecret.value = '';
    nextTick(() => {
      if (connectionOpener?.isConnected && connectionOpener.checkVisibility()) connectionOpener.focus();
      else focusFallback();
    });
  }
  function closeConnection() {
    if (!['open', 'check', 'close'].includes(pendingAction.value)) connectionDialog.value?.close();
  }
  async function refreshProfiles() {
    if (!isTauri()) return;
    try {
      profiles.value = (await listProfiles(invoke)).filter(
        (profile) => profile.environment === environment.value || !profile.available,
      );
      profileError.value = '';
    } catch (cause) {
      profileError.value = errorMessage(cause);
    }
  }
  async function refreshStorageStatus() {
    const active = activeSession.value;
    if (!isTauri() || !active) return;
    try {
      const status = await profileStatus(invoke, active.sessionId);
      if (activeSession.value?.sessionId !== active.sessionId) return;
      storageStatus.value = status;
      if (status.saved && defaultDestinations.value === null) {
        const defaults = await getProfileDefaults(invoke, active);
        if (activeSession.value?.sessionId === active.sessionId) {
          defaultDestinations.value = defaults;
          if (!selectedDestination.value && defaults?.receiverDestination)
            selectedDestination.value = defaults.receiverDestination;
        }
      }
    } catch {
      /* A failed status read must not change a completed FIT-Connect operation. */
    }
  }
  async function openProfileSession(profile, restoreKeys, targetApi) {
    let target = profile;
    if (targetApi !== profile.apiVersion) {
      const matches = profiles.value.filter(
        (item) =>
          item.available &&
          item.apiVersion === targetApi &&
          item.clientId === profile.clientId &&
          item.role === profile.role &&
          item.environment === profile.environment,
      );
      if (matches.length > 1) throw new Error('profile_api_ambiguous');
      target = await copyProfileForApi(invoke, profile, targetApi, matches[0]?.profileId);
      await refreshProfiles();
    }
    delete sessions.value[targetApi];
    const connected = await openSavedProfile(invoke, target, restoreKeys);
    apiVersion.value = connected.apiVersion;
    sessions.value[connected.apiVersion] = connected;
    connectionDialog.value?.close();
    profileOpened();
    await refreshStorageStatus();
  }
  function apiError(cause, targetApi) {
    const code = typeof cause === 'string' ? cause : cause?.message;
    return ['authentication_failed', 'invalid_credentials', 'resource_denied'].includes(code)
      ? `Die Anmeldung für API ${targetApi} ist fehlgeschlagen. Prüfen Sie die Freischaltung und Berechtigungen für diese API sowie die Zugangsdaten. Die bisherige Verbindung bleibt erhalten.`
      : errorMessage(cause);
  }
  async function changeApi(targetApi) {
    if (busy.value || !['v2', 'v3'].includes(targetApi) || targetApi === apiVersion.value) return;
    if ((await beforeChange()) === false || busy.value) return;
    const source = activeSession.value;
    const existing = sessions.value[targetApi];
    error.value = '';
    if (!source || existing) {
      if (
        source &&
        existing &&
        (source.clientId !== existing.clientId ||
          source.role !== existing.role ||
          source.environment !== existing.environment)
      ) {
        error.value =
          'Für diese API besteht bereits eine Verbindung mit anderen Zugangsdaten. Wählen Sie die gewünschte Verbindung unter „Verbindung verwalten“, damit keine bestehende Sitzung ersetzt wird.';
        return;
      }
      apiVersion.value = targetApi;
      return;
    }
    busy.value = true;
    pendingAction.value = 'open';
    const started = performance.now();
    let status = 'Erfolgreich';
    try {
      const storage = await profileStatus(invoke, source.sessionId);
      if (storage.profileId) {
        profiles.value = (await listProfiles(invoke)).filter(
          (profile) => profile.environment === environment.value || !profile.available,
        );
        const profile = profiles.value.find((item) => item.profileId === storage.profileId);
        if (
          !profile?.available ||
          profile.clientId !== source.clientId ||
          profile.apiVersion !== source.apiVersion ||
          profile.role !== source.role ||
          profile.environment !== source.environment
        )
          throw new Error('engine_protocol_error');
        await openProfileSession(profile, true, targetApi);
      } else {
        const connected = await openSessionForApi(invoke, source, targetApi);
        sessions.value[targetApi] = connected;
        apiVersion.value = targetApi;
        profileOpened();
        await refreshStorageStatus();
      }
    } catch (cause) {
      status = 'Fehlgeschlagen';
      if (resetsSessions(cause)) sessions.value = {};
      error.value = apiError(cause, targetApi);
    } finally {
      busy.value = false;
      pendingAction.value = '';
      addEvent(targetApi, 'API-Version wechseln', status, started);
    }
  }
  async function connectProfile(profile, restoreKeys, targetApi = profile.apiVersion) {
    if (busy.value) return;
    if ((await beforeChange()) === false || busy.value) return;
    busy.value = true;
    pendingAction.value = 'open';
    error.value = '';
    clientId.value = '';
    clientSecret.value = '';
    const started = performance.now();
    let status = 'Erfolgreich';
    try {
      await openProfileSession(profile, restoreKeys, targetApi);
    } catch (cause) {
      status = 'Fehlgeschlagen';
      error.value = targetApi !== profile.apiVersion ? apiError(cause, targetApi) : errorMessage(cause);
      if (resetsSessions(cause)) sessions.value = {};
    } finally {
      busy.value = false;
      pendingAction.value = '';
      addEvent(targetApi, 'Mit gespeichertem Profil anmelden', status, started);
    }
  }
  async function backupProfile(profile) {
    if (busy.value) return;
    busy.value = true;
    profileError.value = '';
    profileNotice.value = '';
    try {
      const saved = await exportProfileBackup(invoke, profile.profileId);
      if (saved)
        profileNotice.value =
          'Geschützte Sicherung gespeichert. Sie benötigt dasselbe Windows-Benutzerkonto und dessen Windows-Schutzschlüssel.';
    } catch (cause) {
      profileError.value = errorMessage(cause);
    } finally {
      busy.value = false;
    }
  }
  async function restoreProfileBackup(files = null) {
    if (busy.value) return;
    busy.value = true;
    profileError.value = '';
    profileNotice.value = '';
    try {
      const profile = Array.isArray(files)
        ? await importProfileBackupFile(invoke, files[0])
        : await importProfileBackup(invoke);
      if (profile) {
        await refreshProfiles();
        profileNotice.value =
          'Profil wiederhergestellt. Beim Verbinden werden Anmeldung und Schlüsselzuordnungen neu geprüft.';
      }
    } catch (cause) {
      profileError.value = errorMessage(cause);
    } finally {
      busy.value = false;
    }
  }
  async function askRemoveProfile(profile) {
    if (busy.value) return;
    forgetCandidate.value = profile;
    await nextTick();
    forgetDialog.value?.showModal();
  }
  async function removeProfile(profile) {
    if (busy.value || !profile) return;
    busy.value = true;
    try {
      await forgetProfile(invoke, profile.profileId);
      await refreshProfiles();
      await refreshStorageStatus();
    } catch (cause) {
      profileError.value = errorMessage(cause);
    } finally {
      busy.value = false;
      forgetDialog.value?.close();
      forgetCandidate.value = null;
    }
  }
  async function retryProfileSave() {
    if (busy.value || !activeSession.value) return;
    busy.value = true;
    try {
      await saveProfileState(invoke, activeSession.value);
      await refreshStorageStatus();
    } catch (cause) {
      profileError.value = errorMessage(cause);
    } finally {
      busy.value = false;
    }
  }

  return {
    busy,
    pendingAction,
    error,
    clientId,
    clientSecret,
    rememberProfile,
    profileName,
    profiles,
    storageStatus,
    profileError,
    profileNotice,
    forgetCandidate,
    forgetDialog,
    sessions,
    selectedDestination,
    defaultDestinations,
    activeSession,
    connectionDialog,
    sessionAction,
    showConnection,
    connectionClosed,
    closeConnection,
    refreshProfiles,
    refreshStorageStatus,
    connectProfile,
    changeApi,
    backupProfile,
    restoreProfileBackup,
    askRemoveProfile,
    removeProfile,
    retryProfileSave,
  };
}
