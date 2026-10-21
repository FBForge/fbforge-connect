import { diagnosticCode } from './diagnostics.js';
import { productName } from './product.js';

// Deliberately exclude arguments, response bodies, identifiers, paths and free-form messages.
export const operationLabels = Object.freeze({
  case_workspace: 'Lokale Vorgangsablage',
  list_key_inventory: 'Schlüsselbestand ansehen',
  remove_key_inventory_item: 'Einzelnen Schlüsselbestand entfernen',
  update_profile: 'Gespeichertes Profil bearbeiten',
  export_profile_backup: 'Geschütztes Profil sichern',
  import_profile_backup: 'Geschütztes Profil wiederherstellen',
  import_profile_backup_file: 'Geschützte Profildatei wiederherstellen',
  search_process_destinations: 'Prozess-Empfänger suchen',
  prepare_destination_rotation: 'Schlüsselwechsel vorbereiten',
  execute_destination_rotation: 'Schlüsselwechsel ausführen',
  cancel_destination_rotation: 'Schlüsselwechsel verwerfen',
  destination_rotation_state: 'Schlüsselwechsel prüfen',
  prepare_destination_cleanup: 'Entwurfsbereinigung vorbereiten',
  execute_destination_cleanup: 'TEST-Entwurf entfernen',
  cancel_destination_cleanup: 'Entwurfsbereinigung verwerfen',
  destination_cleanup_state: 'Entwurfsbereinigung prüfen',
  probe_engine: 'Lokalen Kern prüfen',
  open_session: 'Bei TEST anmelden',
  check_session: 'Sitzung prüfen',
  close_session: 'Abmelden',
  list_destinations: 'Eigene Destinations laden',
  load_destination: 'Destination prüfen',
  import_key: 'Testschlüssel laden',
  discard_keys: 'Testschlüssel verwerfen',
  load_managed_destination: 'Verwaltung: Details laden',
  prepare_destination_update: 'Verwaltung: Änderung vorbereiten',
  execute_destination_update: 'Verwaltung: Änderung speichern',
  cancel_destination_update: 'Verwaltung: Änderung verwerfen',
  destination_update_state: 'Verwaltung: Ergebnis abrufen',
  load_send_destination: 'Empfängerleistungen laden',
  load_send_schema: 'Versandschema laden',
  prepare_send: 'Versand vorbereiten',
  execute_send: 'Versand bestätigen',
  cancel_send: 'Versand verwerfen',
  send_state: 'Versandstatus abrufen',
  list_submissions: 'Einreichungen laden',
  load_submission: 'Einreichung öffnen',
  verify_submission: 'Einreichung entschlüsseln und prüfen',
  load_schema: 'Prüfschema laden',
  prepare_receipt: 'Empfangsaktion vorbereiten',
  execute_receipt: 'Empfangsaktion bestätigen',
  cancel_receipt: 'Empfangsaktion verwerfen',
  receipt_state: 'Empfangsstatus abrufen',
  generate_test_keys: 'TEST-Schlüssel erzeugen',
  list_generated_keys: 'Erzeugte Schlüssel laden',
  prepare_destination_creation: 'Destination-Anlage vorbereiten',
  execute_destination_creation: 'Destination anlegen',
  cancel_destination_creation: 'Destination-Anlage verwerfen',
  destination_creation_state: 'Anlageergebnis prüfen',
  reconcile_destination_creation: 'Destination zuordnen',
  use_generated_keys: 'Erzeugte TEST-Schlüssel verwenden',
  list_profiles: 'Gespeicherte Profile laden',
  open_saved_profile: 'Mit gespeichertem Profil anmelden',
  forget_profile: 'Gespeichertes Profil entfernen',
  profile_status: 'Speicherstatus prüfen',
  save_profile_state: 'Schlüsselbestand sichern',
  load_event_log: 'Event Log prüfen',
  load_case_event_log: 'Vorgangsereignisse prüfen',
  prepare_reply_receipt: 'Antwortquittierung vorbereiten',
  execute_reply_receipt: 'Antwortquittierung senden',
  cancel_reply_receipt: 'Antwortquittierung verwerfen',
  reply_receipt_state: 'Antwortquittierung prüfen',
  list_case_event_log: 'Vorgangsereignisse anzeigen',
  list_replies: 'Antworten laden',
  list_reply_channels: 'Antwortkanäle laden',
  load_reply: 'Antwort öffnen',
  verify_reply: 'Antwort entschlüsseln und prüfen',
  reply_target: 'Geprüften Antwortkanal laden',
  load_reply_schema: 'Antwortschema laden',
  load_reply_event_log: 'Reply-Event-Log prüfen',
  prepare_reply: 'Antwort vorbereiten',
  execute_reply: 'Antwort bestätigen',
  cancel_reply: 'Antwort verwerfen',
  reply_state: 'Antwortstatus abrufen',
});
const states = new Set([
  'idle',
  'prepared',
  'executing',
  'sent',
  'failed',
  'uncertain',
  'cancelled',
  'expired',
  'completed',
  'partial',
  'conflict',
  'accepted',
  'rejected',
]);
const api = (value) => (['v2', 'v3'].includes(value) ? value : null);
const stateLabels = new Map([
  ['idle', 'Keine Aktion offen'],
  ['prepared', 'Vorbereitet'],
  ['executing', 'Wird ausgeführt'],
  ['sent', 'Gesendet'],
  ['failed', 'Fehlgeschlagen'],
  ['uncertain', 'Ausgang ungewiss'],
  ['cancelled', 'Verworfen'],
  ['expired', 'Abgelaufen'],
  ['completed', 'Abgeschlossen'],
  ['partial', 'Teilweise erfolgreich'],
  ['conflict', 'Konflikt'],
  ['accepted', 'Angenommen'],
  ['rejected', 'Abgelehnt'],
]);
const codeLabels = new Map([
  ['schema_unavailable', 'Schema nicht verfügbar'],
  ['schema_required', 'Schema fehlt'],
  ['schema_consent_required', 'Schemafreigabe fehlt'],
  ['data_schema_invalid', 'Fachdaten passen nicht zum Schema'],
  ['data_format_invalid', 'Datenformat ungültig'],
  ['schema_tls_error', 'Schema-Verbindung nicht sicher'],
  ['schema_network_error', 'Schemaquelle nicht erreichbar'],
  ['schema_http_error', 'Schemaquelle meldet einen Fehler'],
  ['schema_archive_invalid', 'Schemaarchiv ungültig'],
  ['key_missing', 'Schlüssel fehlt'],
  ['key_rejected', 'Schlüssel nicht verwendbar'],
  ['resource_denied', 'Berechtigung fehlt'],
  ['resource_missing', 'Nicht gefunden'],
  ['resource_unavailable', 'TEST-Dienst nicht verfügbar'],
  ['authentication_failed', 'Anmeldung fehlgeschlagen'],
  ['session_missing', 'Sitzung nicht verfügbar'],
  ['engine_timeout', 'Zeitlimit überschritten'],
  ['engine_busy', 'Eine Aktion läuft bereits'],
  ['engine_disconnected', 'Verbindung zum Anwendungskern getrennt'],
  ['engine_protocol_error', 'Ungültige Antwort des Anwendungskerns'],
  ['invalid_input', 'Eingaben prüfen'],
  ['invalid_submission', 'Einreichung prüfen'],
  ['verification_failed', 'Inhaltsprüfung fehlgeschlagen'],
  ['vault_unavailable', 'Geschützter Speicher nicht verfügbar'],
  ['vault_pending', 'Sicherung ausstehend'],
  ['case_storage_pending', 'Vorgang noch nicht gespeichert'],
  ['case_limit', 'Vorgangsablage voll'],
  ['reply_metadata_required', 'Metadatenversion für Replies fehlt'],
  ['reply_channel_missing', 'Kein Antwortkanal angeboten'],
  ['schema_id_mismatch', 'Schema-Kennung passt nicht'],
  ['content_cleanup_failed', 'Lokale Bereinigung fehlgeschlagen'],
]);
export function diagnosticContext(entry) {
  const version = api(entry.apiVersion);
  return version ? `API ${version}` : 'Lokal';
}
export function diagnosticResult(entry) {
  if (entry.code || entry.result === 'rejected')
    return { label: codeLabels.get(entry.code) || 'Fehlgeschlagen', tone: 'warn' };
  return {
    label: stateLabels.get(entry.state) || 'Erfolgreich',
    tone: ['failed', 'uncertain', 'partial', 'conflict', 'expired'].includes(entry.state) ? 'warn' : 'info',
  };
}
function safeEntry(entry) {
  if (!entry || !Object.hasOwn(operationLabels, entry.command)) return null;
  return Object.freeze({
    time:
      typeof entry.time === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(entry.time)
        ? entry.time
        : null,
    command: entry.command,
    apiVersion: api(entry.apiVersion),
    result: entry.result === 'returned' ? 'returned' : 'rejected',
    state: states.has(entry.state) ? entry.state : null,
    code: entry.code === null ? null : diagnosticCode(entry.code),
    durationMs:
      Number.isSafeInteger(entry.durationMs) && entry.durationMs >= 0 && entry.durationMs <= 86400000
        ? entry.durationMs
        : null,
  });
}
export function createDiagnosticLog() {
  let entries = [];
  const listeners = new Set();
  const notify = () => {
    for (const listener of listeners) {
      try {
        listener([...entries]);
      } catch {
        /* Diagnostics must never affect an operation. */
      }
    }
  };
  return {
    record(entry) {
      const safe = safeEntry(entry);
      if (safe) {
        entries = [safe, ...entries].slice(0, 100);
        notify();
      }
    },
    snapshot: () => [...entries],
    clear() {
      entries = [];
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export function observeInvoke(operation, record, clock = () => performance.now()) {
  return async (command, args) => {
    const started = clock();
    let result = 'returned',
      code = null,
      state = null;
    try {
      const response = await operation(command, args);
      const data = response?.data ?? response;
      state = states.has(data?.status) ? data.status : null;
      if (data?.error) code = diagnosticCode(data.error);
      return response;
    } catch (cause) {
      result = 'rejected';
      code = diagnosticCode(cause);
      throw cause;
    } finally {
      try {
        record({
          time: new Date().toISOString(),
          command,
          apiVersion: api(args?.apiVersion),
          result,
          state,
          code,
          durationMs: Math.round(clock() - started),
        });
      } catch {
        /* A diagnostic failure must not replace a result or cause a retry. */
      }
    }
  };
}
export function buildSupportReport({ version, selectedApi, probes = {}, entries = [] }) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version))
    throw new Error('invalid_input');
  return {
    format: 'fit-connect-support-v1',
    application: productName,
    version,
    environment: 'TEST',
    selectedApi: api(selectedApi),
    localAdapters: ['v2', 'v3'].map((apiVersion) => ({
      apiVersion,
      verified:
        probes[apiVersion]?.isolated === true &&
        probes[apiVersion]?.environment === 'TEST' &&
        probes[apiVersion]?.apiVersion === apiVersion,
    })),
    operations: entries.slice(0, 100).map(safeEntry).filter(Boolean),
  };
}
