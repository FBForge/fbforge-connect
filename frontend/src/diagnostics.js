import { receiveFailures } from './receive/failures.js';
const sdkVersions = Object.freeze({ v2: '3.5.2', v3: '4.0.0' });

export async function probeAdapter(invoke, apiVersion, environment = 'TEST') {
  if (!Object.hasOwn(sdkVersions, apiVersion)) throw new Error('unsupported_api');
  const result = await invoke('probe_engine', { apiVersion });
  if (
    !result ||
    result.apiVersion !== apiVersion ||
    result.environment !== environment ||
    result.sdkVersion !== sdkVersions[apiVersion] ||
    result.isolated !== true ||
    typeof result.entrypoint !== 'string' ||
    !/^[A-Za-z0-9_.]{1,200}$/.test(result.entrypoint)
  ) {
    throw new Error('engine_protocol_error');
  }
  return result;
}

export function errorMessage(code) {
  const receiveCode = typeof code === 'string' ? code : (code?.code ?? code?.message);
  if (typeof receiveCode === 'string' && Object.hasOwn(receiveFailures, receiveCode))
    return receiveFailures[receiveCode].message;
  const messages = {
    scanner_busy:
      'Der Virenscan wird gerade eingerichtet oder aktualisiert. Sie können weiterarbeiten. Warten Sie vor der Inhaltsprüfung oder öffnen Sie „Virenscan“, um den Vorgang abzubrechen.',
    export_busy: 'Ein Speichern-Dialog ist bereits geöffnet. Schließen Sie ihn zuerst.',
    batch_selection_limit: 'Bitte höchstens 100 Nachrichten für einen Durchlauf auswählen.',
    export_failed:
      'Die Dateien konnten nicht vollständig gespeichert werden. Bitte Schreibrechte und freien Speicherplatz im Zielordner prüfen.',
    message_content_blocked:
      'Ein vollständiger Originaldownload ist wegen gesperrter Anlagen nicht möglich. Unauffällige Inhalte können Sie einzeln speichern.',
    message_content_missing:
      'Für diese lokale Kopie sind noch keine entschlüsselten Fachdaten verfügbar. Öffnen Sie die Nachricht im Empfang und entschlüsseln und prüfen Sie die Inhalte zuerst.',
    export_expired:
      'Der Zielordner ist nicht mehr für diesen Durchlauf freigegeben. Bitte den Download erneut starten.',
    receipt_review_required: 'Bitte die Schemaabweichungen im Annahmedialog ausdrücklich bestätigen.',
    batch_review_required:
      'Die Dateien wurden gespeichert. Offene technische Prüfungen oder die fehlende Malwarescan-Freigabe erfordern eine manuelle Entscheidung.',
    batch_list_changed:
      'Der Eingang hat sich während der Auswahl geändert. Bitte die Übersicht neu laden und erneut auswählen.',
    case_limit:
      'Die lokale Vorgangsablage ist voll. Löschen Sie unter „Vorgänge“ nicht mehr benötigte Kopien und bereiten Sie die Aktion erneut vor. Es wurden keine Serverdaten verändert.',
    case_storage_pending:
      'Die Vorgangskopie konnte noch nicht geschützt gespeichert werden. Prüfen Sie unter „Vorgänge“ den Speicherstatus und den freien Speicherplatz, bevor Sie den Empfang bestätigen.',
    desktop_required: 'Diese Funktion ist nur in der Desktop-Anwendung verfügbar.',
    engine_not_staged: 'Die lokale Java-Laufzeit fehlt. Bitte zuerst den Java-Kern bauen und bereitstellen.',
    engine_start_failed: 'Der lokale Java-Kern konnte nicht gestartet werden.',
    adapter_unavailable:
      'Der ausgewählte SDK-Adapter konnte nicht vollständig geladen werden. Bitte den Java-Build prüfen.',
    engine_timeout: 'Die lokale Aktion hat das Zeitlimit überschritten. Der Java-Kern wurde beendet.',
    engine_busy: 'Es läuft bereits eine lokale Aktion.',
    engine_disconnected: 'Die Verbindung zum lokalen Java-Kern wurde beendet.',
    engine_protocol_error: 'Die Antwort des lokalen Java-Kerns ist ungültig.',
    vault_profile_required:
      'Bitte zuerst mit einem gespeicherten Windows-Profil verbinden. Die automatisch erzeugten privaten Schlüssel müssen vor der Registrierung gesichert sein.',
    backup_invalid: 'Die Zustellpunkt-Sicherung ist ungültig oder beschädigt.',
    backup_unavailable: 'Die Zustellpunkt-Sicherung konnte nicht gelesen oder gespeichert werden.',
    schema_library_invalid:
      'Ein gespeichertes Antwortschema ist ungültig. Bitte die Definition in den Testwerkzeugen prüfen.',
    schema_library_conflict: 'Das Antwortschema wurde inzwischen geändert. Bitte die Bibliothek neu laden.',
    schema_library_limit:
      'Die Antwortschema-Bibliothek ist voll. Pro Profil können bis zu 32 Definitionen gespeichert werden.',
    vault_unavailable:
      'Der geschützte Windows-Speicher ist nicht verfügbar. Bitte das Benutzerkonto und den freien Speicherplatz prüfen.',
    vault_pending:
      'Der bisherige Schlüsselbestand konnte noch nicht gesichert werden. Bitte im bestehenden Profil erneut sichern, bevor Sie die Verbindung wechseln.',
    key_rejected:
      'Der private Schlüssel kann der gewählten Destination nicht eindeutig zugeordnet werden. Prüfen Sie API-Version, Verwendung und registrierte Schlüssel.',
    profile_api_ambiguous:
      'Für diese API gibt es mehrere passende Profile. Bitte wählen Sie das gewünschte Profil direkt aus.',
    vault_conflict:
      'Dieses Profil ist bereits gespeichert und wird nicht überschrieben. Für eine bewusste Wiederherstellung zuerst den aktuellen Stand sichern und den vorhandenen Profileintrag entfernen.',
    vault_invalid:
      'Das gespeicherte Profil ist beschädigt oder hat ein nicht unterstütztes Format. Die vorhandene Datei wurde nicht ersetzt.',
    vault_unsupported:
      'Geschütztes Speichern wird in diesem Entwicklungsstand nur unter Windows unterstützt. Bitte ohne Speichern verbinden.',
    vault_limit:
      'Es können höchstens 32 Profile gespeichert werden. Bitte ein nicht mehr benötigtes Profil entfernen.',
    vault_restore_failed:
      'Gespeicherte Schlüssel konnten nicht vollständig wiederhergestellt oder gegen die gewählte Umgebung geprüft werden. Das Profil bleibt erhalten. Sie können zunächst nur seine Zugangsdaten verwenden und die Schlüsselzuordnung prüfen.',
    invalid_credentials:
      'Bitte eine Client-ID und ein Client-Secret innerhalb der zulässigen Länge eingeben.',
    reply_metadata_required:
      'An der Absender-Destination fehlt eine passende Metadatenversion für Replies. Der Betreiber muss in der Destination-Verwaltung 2.0.0 oder 3.0.0 freigeben. Prozessantworten benötigen 3.0.0. Es wurde nichts versendet.',
    verification_failed:
      'Die Prüfung durch das FIT-Connect-SDK ist fehlgeschlagen. Prüfen Sie die technischen Fehlerangaben und das Event Log.',
    reply_channel_missing:
      'Diese Einreichung bietet keinen unterstützten FIT-Connect-Antwortkanal an. Für einen Antworttest muss der Absender beim Versand ein Antwortangebot mitgeben.',
    schema_id_mismatch:
      'Die Kennung $id der lokalen Schemadatei fehlt oder passt nicht zum angebotenen Schema. Bitte wählen Sie die passende Schemadatei.',
    destination_no_keys:
      'Onlinedienst-Destinations vom Typ C benötigen keine Zertifikate oder dauerhaften Destination-Schlüssel. Antwortschlüssel werden je Antwortkanal erzeugt.',
    content_cancelled: 'Aktion abgebrochen. Es wurde nichts übertragen.',
    environment_mismatch:
      'Die Umgebung passt nicht zum gespeicherten Profil. Bitte die passende Umgebung wählen und neu anmelden.',
    vpki_certificate_required:
      'STAGE und PROD benötigen gültige V-PKI-Zertifikate mit vollständiger x5c-Zertifikatskette. Bitte Gültigkeit, Schlüsselverwendung und Vertrauenskette prüfen. Eine fehlgeschlagene Sperrprüfung wird nicht übergangen.',
    certificate_status_unknown:
      'Der Sperrstatus des V-PKI-Zertifikats konnte nicht sicher festgestellt werden. Bitte die Erreichbarkeit der Zertifikatsdienste prüfen und erneut versuchen. Die Aktion wurde nicht freigegeben.',
    authentication_failed: 'Die Anmeldung ist fehlgeschlagen. Bitte Client-ID und Client-Secret prüfen.',
    network_tls_error:
      'Die TLS-Verbindung wurde abgelehnt. Prüfen Sie das Zertifikat der Gegenstelle und bei HTTPS-Prüfung durch Ihren Proxy das von Ihrer IT freigegebene CA-Zertifikat unter Einstellungen → Netzwerk und Proxy.',
    network_dns_error:
      'Der Servername konnte nicht aufgelöst werden. Prüfen Sie DNS, Proxy-Host und Netzwerkverbindung.',
    network_timeout:
      'Die Netzwerkverbindung hat das Zeitlimit überschritten. Prüfen Sie Proxy, Firewall und die Erreichbarkeit des Dienstes.',
    network_connection_failed:
      'Die Verbindung konnte nicht aufgebaut werden. Prüfen Sie Proxy-Host, Port und Firewall.',
    proxy_authentication_required:
      'Der Proxy verlangt eine Anmeldung. Hinterlegen Sie die freigegebenen Proxy-Zugangsdaten unter Einstellungen → Netzwerk und Proxy.',
    network_trust_unavailable:
      'Die zusätzlichen CA-Zertifikate konnten nicht sicher eingerichtet werden. Prüfen Sie die Netzwerkeinstellungen und verbinden Sie das Profil erneut.',
    auth_unavailable: 'Der Anmeldedienst konnte nicht sicher erreicht werden. Bitte erneut versuchen.',
    endpoint_blocked:
      'Ein unzulässiges Ziel oder eine Weiterleitung wurde blockiert. Erlaubt sind ausschließlich die festen Endpunkte der gewählten Umgebung.',
    session_missing: 'Diese Sitzung ist nicht mehr verfügbar. Bitte erneut anmelden.',
  };
  const key = typeof code === 'string' ? code : (code?.code ?? code?.message);
  return typeof key === 'string' && Object.hasOwn(messages, key)
    ? messages[key]
    : 'Die lokale Aktion ist fehlgeschlagen.';
}

// Only stable application codes may be copied into a bug report. Never return raw native/SDK text.
const reportableCodes = new Set([
  'schema_library_invalid',
  'schema_library_conflict',
  'schema_library_limit',
  'backup_invalid',
  'backup_unavailable',
  ...Object.keys(receiveFailures),
  'export_failed',
  'export_expired',
  'message_content_missing',
  'message_content_blocked',
  'scanner_busy',
  'scanner_unsupported',
  'scanner_package_invalid',
  'scanner_install_failed',
  'scanner_database_missing',
  'scanner_database_invalid',
  'scanner_database_rollback',
  'scanner_configuration_invalid',
  'scanner_start_failed',
  'scanner_download_failed',
  'scanner_update_failed',
  'scanner_scan_failed',

  'receipt_review_required',
  'batch_review_required',
  'batch_list_changed',
  'batch_selection_limit',
  'case_limit',
  'case_storage_pending',
  'vault_profile_required',
  'vault_unavailable',
  'vault_pending',
  'vault_invalid',
  'vault_unsupported',
  'vault_conflict',
  'vault_limit',
  'vault_restore_failed',
  'destination_conflict',
  'destination_update_locked',
  'destination_no_keys',
  'reply_metadata_required',
  'reply_channel_missing',
  'desktop_required',
  'engine_not_staged',
  'engine_start_failed',
  'adapter_unavailable',
  'engine_timeout',
  'engine_busy',
  'engine_disconnected',
  'engine_protocol_error',
  'invalid_credentials',
  'authentication_failed',
  'network_tls_error',
  'network_dns_error',
  'network_timeout',
  'network_connection_failed',
  'proxy_authentication_required',
  'network_trust_unavailable',
  'auth_unavailable',
  'endpoint_blocked',
  'session_missing',
  'invalid_resource',
  'resource_denied',
  'resource_missing',
  'resource_unavailable',
  'key_rejected',
  'key_missing',
  'test_certificate_required',
  'vpki_certificate_required',
  'certificate_status_unknown',
  'environment_mismatch',
  'content_cancelled',
  'invalid_input',
  'content_limit',
  'verification_failed',
  'schema_required',
  'schema_id_mismatch',
  'data_schema_invalid',
  'schema_unavailable',
  'schema_consent_required',
  'schema_tls_error',
  'schema_network_error',
  'schema_http_error',
  'schema_archive_invalid',
  'send_locked',
  'invalid_submission',
  'data_format_invalid',
  'content_cleanup_failed',
]);
export function diagnosticCode(cause) {
  const code = typeof cause === 'string' ? cause : (cause?.code ?? cause?.message);
  return typeof code === 'string' && reportableCodes.has(code) ? code : 'unknown_error';
}

/** Preserve fatal transport failures so callers retire native session handles after an uncertain write. */
export function uncertainOperationError(cause) {
  const code = typeof cause === 'string' ? cause : (cause?.code ?? cause?.message);
  return [
    'engine_timeout',
    'engine_disconnected',
    'engine_protocol_error',
    'engine_start_failed',
    'engine_not_staged',
  ].includes(code)
    ? code
    : 'resource_unavailable';
}
