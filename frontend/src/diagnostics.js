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

// Only stable application codes may be copied into a bug report. Never return raw native/SDK text.
const reportableCodes = new Set([
  'destination_conflict', 'destination_update_locked', 'desktop_required', 'engine_not_staged', 'engine_start_failed', 'adapter_unavailable', 'engine_timeout',
  'engine_busy', 'engine_disconnected', 'engine_protocol_error', 'invalid_credentials', 'authentication_failed',
  'auth_unavailable', 'endpoint_blocked', 'session_missing', 'invalid_resource', 'resource_denied',
  'resource_missing', 'resource_unavailable', 'key_rejected', 'key_missing', 'test_certificate_required',
  'invalid_input', 'content_limit', 'verification_failed', 'schema_required', 'data_schema_invalid', 'schema_unavailable', 'schema_consent_required',
  'schema_tls_error', 'schema_network_error', 'schema_http_error', 'schema_archive_invalid',
  'send_locked', 'invalid_submission', 'data_format_invalid', 'content_cleanup_failed',
]);
export function diagnosticCode(cause) {
  const code = typeof cause === 'string' ? cause : cause?.message;
  return typeof code === 'string' && reportableCodes.has(code) ? code : 'unknown_error';
}
