import { errorMessage } from '../diagnostics.js';
export const messages = {
  example_unavailable:
    'Für dieses Schema konnte kein vollständiger fiktiver Antwortentwurf erzeugt werden. Bitte geben Sie die Antwort manuell ein. Ihr bisheriger Antwortinhalt bleibt erhalten.',
  schema_http_error:
    'Das Antwortschema ist nicht verfügbar. Die Quelle hat den Abruf mit einem HTTP-Fehler abgewiesen. Ihr bisheriger Antwortinhalt bleibt erhalten.',
  schema_required:
    'Bitte das aktuelle Antwortschema laden. Die Vorbereitung benötigt eine native Schemaprüfung.',
  schema_id_mismatch:
    'Die Kennung $id Ihrer lokalen Schemadatei fehlt oder stimmt nicht mit dem angebotenen Antwortschema überein. Wählen Sie das passende Schema des Onlinedienstes. Ihr Antwortentwurf bleibt erhalten.',
  data_schema_invalid:
    'Der Antwortinhalt entspricht nicht dem ausgewählten Schema. Bitte Fachdaten und Pflichtfelder prüfen. Es wurde nichts versendet.',
  schema_unavailable:
    'Das Antwortschema ist nicht verfügbar oder die Quelle hat eine Fehlerantwort statt eines Schemas geliefert. Ihr bisheriger Antwortinhalt bleibt erhalten. Alternativ können Sie eine lokale JSON-Schemadatei mit passender $id verwenden.',
  schema_consent_required:
    'Erlauben Sie den Abruf öffentlicher Schemaquellen oder hinterlegen Sie ein lokales Schema.',
  data_format_invalid: 'Der Antwortinhalt passt nicht zum gewählten JSON-/XML-Format.',
  reply_channel_missing:
    'In den geprüften Metadaten ist kein unterstützter FIT-Connect-Antwortkanal enthalten. Der Absender muss eine neue Einreichung mit Antwortschlüssel und Antwortschema senden. In FBForge Connect aktivieren Sie dafür unter „Anlagen & Antwortkanal“ die Option „Antworten über FIT-Connect anbieten“. Bei anderen Onlinediensten prüfen Sie deren Versandkonfiguration. Die vorhandene Einreichung können Sie weiterhin annehmen oder ablehnen.',
  verification_failed:
    'Der geprüfte Antwortkanal ist nicht mehr verfügbar oder enthält widersprüchliche Angaben. Bitte die Einreichung erneut prüfen.',
  invalid_resource: 'Das Ergebnis passt nicht mehr zur aktuellen Einreichung. Bitte erneut prüfen.',
  invalid_submission:
    'Bitte Antwortschema, Format und Inhalte prüfen. Höchstens 32 MiB je Datei und 64 MiB insgesamt.',
  resource_denied: 'Diese TEST-Zugangsdaten dürfen die Antwort nicht versenden.',
  resource_unavailable:
    'Der Reply-Versand konnte nicht abgeschlossen werden. Bei ungewissem Ausgang bitte nicht erneut senden.',
  confirmation_expired: 'Die Bestätigung ist abgelaufen. Bitte die Antwort erneut vorbereiten.',
  send_locked: 'Der letzte Reply-Versuch ist gesperrt. Bei ungewissem Ausgang zuerst den Vorgang prüfen.',
  content_cleanup_failed:
    'Lokale Dateien konnten nicht vollständig entfernt werden. Bitte die Sitzung abmelden.',
};
export function explain(cause) {
  const code = typeof cause === 'string' ? cause : cause?.message;
  return typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] : errorMessage(cause);
}
