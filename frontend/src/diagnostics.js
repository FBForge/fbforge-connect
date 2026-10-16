const sdkVersions = Object.freeze({ v2: '3.5.2', v3: '4.0.0-rc.2' });

export async function probeAdapter(invoke, apiVersion) {
  if (!Object.hasOwn(sdkVersions, apiVersion)) throw new Error('unsupported_api');
  const result = await invoke('probe_engine', { apiVersion });
  if (!result || result.apiVersion !== apiVersion || result.environment !== 'TEST'
      || result.sdkVersion !== sdkVersions[apiVersion] || result.isolated !== true
      || typeof result.entrypoint !== 'string' || !/^[A-Za-z0-9_.]{1,200}$/.test(result.entrypoint)) {
    throw new Error('engine_protocol_error');
  }
  return result;
}

export function errorMessage(code) {
  const messages = {
    desktop_required: 'Diese Funktion ist nur in der Desktop-Anwendung verfügbar.',
    engine_not_staged: 'Die lokale Java-Laufzeit fehlt. Bitte zuerst den Java-Kern bauen und bereitstellen.',
    engine_start_failed: 'Der lokale Java-Kern konnte nicht gestartet werden.',
    adapter_unavailable: 'Der ausgewählte SDK-Adapter konnte nicht vollständig geladen werden. Bitte den Java-Build prüfen.',
    engine_timeout: 'Die lokale Aktion hat das Zeitlimit überschritten. Der Java-Kern wurde beendet.',
    engine_busy: 'Es läuft bereits eine lokale Aktion.',
    engine_disconnected: 'Die Verbindung zum lokalen Java-Kern wurde beendet.',
    engine_protocol_error: 'Die Antwort des lokalen Java-Kerns ist ungültig.',
    invalid_credentials: 'Bitte eine Client-ID und ein Client-Secret innerhalb der zulässigen Länge eingeben.',
    authentication_failed: 'Die TEST-Anmeldung ist fehlgeschlagen. Bitte Client-ID und Client-Secret prüfen.',
    auth_unavailable: 'Der TEST-Anmeldedienst konnte nicht sicher erreicht werden. Bitte erneut versuchen.',
    endpoint_blocked: 'Ein unzulässiges Ziel oder eine Weiterleitung wurde blockiert. Es ist ausschließlich TEST erlaubt.',
    session_missing: 'Diese Sitzung ist nicht mehr verfügbar. Bitte erneut anmelden.',
  };
  const key = typeof code === 'string' ? code : code?.message;
  return typeof key === 'string' && Object.hasOwn(messages, key)
    ? messages[key] : 'Die lokale Aktion ist fehlgeschlagen.';
}
