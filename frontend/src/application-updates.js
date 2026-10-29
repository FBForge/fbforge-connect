/** Update IPC is independent of FIT-Connect and never carries credentials or paths. */
const phases = new Set([
  'idle',
  'checking',
  'current',
  'available',
  'downloading',
  'downloaded',
  'installing',
]);
const messages = Object.freeze({
  update_network_failed:
    'Die Updatesuche oder der Download ist fehlgeschlagen. Prüfen Sie die Internetverbindung und versuchen Sie es später erneut.',
  update_manifest_invalid:
    'Die Update-Informationen sind unvollständig oder passen nicht zu dieser Anwendung. Es wird nichts installiert.',
  update_signature_invalid: 'Die Signatur des Updates ist ungültig. Das Paket wird nicht installiert.',
  update_package_invalid: 'Die heruntergeladene Datei ist kein passendes Update. Es wird nichts installiert.',
  update_package_too_large: 'Das Update überschreitet die erlaubte Downloadgröße.',
  update_activity_pending:
    'Eine Aktion oder ein Dateiexport ist noch offen. Schließen Sie diese Aktion vor der Installation ab.',
  update_install_failed:
    'Der Installer konnte nicht gestartet werden. Die Anwendung bleibt geöffnet. Verbinden Sie Ihre Sitzung bei Bedarf erneut.',
  update_engine_shutdown_failed:
    'Der lokale Kern konnte nicht ordnungsgemäß beendet werden. Das Update wurde nicht gestartet. Verbinden Sie Ihre Sitzung erneut.',
  vault_pending:
    'Der Schlüsselbestand konnte nicht gesichert werden. Sichern Sie ihn vor dem Update unter „Verbindung verwalten“.',
  update_not_ready: 'Das Update ist nicht mehr vorbereitet. Suchen Sie erneut nach Aktualisierungen.',
  update_not_configured:
    'Updates sind in diesem Build noch nicht eingerichtet. Verwenden Sie den manuellen Download.',
  update_platform_unsupported: 'Integrierte Updates sind derzeit für Windows x64 verfügbar.',
});

export function validateUpdateStatus(value) {
  if (
    !value ||
    Object.keys(value).sort().join() !== 'configured,downloaded,notes,phase,supported,total,version' ||
    typeof value.configured !== 'boolean' ||
    typeof value.supported !== 'boolean' ||
    !phases.has(value.phase) ||
    (value.version !== null &&
      (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version))) ||
    typeof value.notes !== 'string' ||
    value.notes.length > 12000 ||
    !Number.isSafeInteger(value.downloaded) ||
    value.downloaded < 0 ||
    value.downloaded > 160 * 1024 * 1024 ||
    (value.total !== null &&
      (!Number.isSafeInteger(value.total) ||
        value.total < value.downloaded ||
        value.total > 160 * 1024 * 1024)) ||
    (['available', 'downloading', 'downloaded', 'installing'].includes(value.phase) && !value.version)
  )
    throw 'update_manifest_invalid';
  return { ...value };
}

export function createUpdateController(
  invoke,
  { changed = () => {}, installing = () => {}, disconnected = () => {}, storage } = {},
) {
  const key = 'fbforge-connect.updates.automatic';
  let automatic = true;
  try {
    storage ??= globalThis.localStorage;
    automatic = storage?.getItem(key) !== 'false';
  } catch {
    /* Optional preference. */
  }
  let state = {
    configured: false,
    supported: false,
    phase: 'idle',
    version: null,
    notes: '',
    downloaded: 0,
    total: null,
    automatic,
    error: '',
    code: '',
    working: false,
    dismissed: false,
  };
  let disposed = false;
  let generation = 0;
  const publish = (values) => {
    state = { ...state, ...values };
    if (!disposed) changed(state);
    return state;
  };
  async function refresh() {
    const expected = generation;
    const value = validateUpdateStatus(await invoke('application_update_status'));
    if (expected !== generation) return state;
    return publish(value);
  }
  async function run(command) {
    if (state.working || disposed) return;
    const isInstall = command === 'install_application_update';
    generation++;
    publish({ working: true, error: '', code: '', dismissed: false });
    if (command === 'check_application_update') publish({ phase: 'checking' });
    if (isInstall) installing(true);
    try {
      const args = command === 'check_application_update' ? undefined : { version: state.version };
      const result = validateUpdateStatus(await invoke(command, args));
      if (args && result.version !== args.version) throw 'update_manifest_invalid';
      publish(result);
    } catch (error) {
      const code = typeof error === 'string' && Object.hasOwn(messages, error) ? error : 'update_unavailable';
      if (isInstall && ['update_install_failed', 'update_engine_shutdown_failed'].includes(error))
        disconnected();
      publish({
        error:
          error === 'update_cancelled'
            ? ''
            : messages[code] ||
              'Die Aktualisierung konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
        code: error === 'update_cancelled' ? '' : code,
      });
      try {
        await refresh();
      } catch {
        /* Retain the actionable error, never claim current. */
      }
      if (command === 'check_application_update') publish({ phase: 'idle' });
    } finally {
      generation++;
      if (isInstall) installing(false);
      publish({ working: false });
    }
  }
  return {
    get state() {
      return state;
    },
    refresh,
    async initialize() {
      try {
        await refresh();
        if (state.automatic && state.configured && state.supported) await run('check_application_update');
      } catch {
        /* A missing updater in browser fixtures must not block the application. */
      }
    },
    check: () => run('check_application_update'),
    async manual() {
      try {
        await invoke('open_update_download');
      } catch {
        publish({
          error:
            'Der Browser konnte nicht geöffnet werden. Öffnen Sie github.com/FBForge/fbforge-connect/releases manuell.',
        });
      }
    },
    download: () => run('download_application_update'),
    install: () => run('install_application_update'),
    async cancel() {
      try {
        await invoke('cancel_application_update');
      } catch {
        publish({
          error: 'Der Abbruch konnte nicht bestätigt werden. Bitte warten Sie auf das Download-Ergebnis.',
        });
      }
    },
    async poll() {
      if (!state.working || disposed) return;
      try {
        await refresh();
      } catch {
        /* The command's final result determines success. */
      }
    },
    setAutomatic(value) {
      if (typeof value !== 'boolean') return;
      publish({ automatic: value });
      try {
        storage?.setItem(key, String(value));
      } catch {
        /* Keep preference for this session. */
      }
    },
    dismiss: () => publish({ dismissed: true }),
    dispose() {
      disposed = true;
    },
  };
}
