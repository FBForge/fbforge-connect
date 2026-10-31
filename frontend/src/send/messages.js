import { testPackError } from '../test-packs.js';
import { errorMessage } from '../diagnostics.js';
const messages = {
  malware_detected:
    'Der Virenscanner meldet einen Fund in den Fachdaten oder einer Anlage. Der Versand wurde blockiert. Entfernen oder ersetzen Sie die betroffene Datei und prüfen Sie den Entwurf erneut. Es wurde keine Einreichung angekündigt.',
  malware_scan_failed:
    'Die Dateien konnten nicht vollständig auf Schadsoftware geprüft werden. Der Versand wurde blockiert. Prüfen Sie Erreichbarkeit, Signaturstand und Einstellungen unter „Virenscan“ und bereiten Sie den Versand erneut vor.',
  invalid_submission:
    'Bitte Adressierung, Fachdaten, Schema und Anlagen prüfen. Höchstens 32 MiB je Datei und 64 MiB insgesamt.',
  data_format_invalid:
    'Die Fachdaten passen nicht zum ausgewählten Format. Für ein XML-Schema wird wohlgeformtes XML benötigt, für ein JSON-Schema gültiges JSON. Nach einer fehlgeschlagenen Beispielerzeugung bleibt der bisherige Inhalt erhalten.',
  invalid_input: 'Bitte die Destination ID und Case ID sowie die übrigen Eingaben prüfen.',
  data_schema_invalid:
    'Die Fachdaten entsprechen nicht dem ausgewählten Schema. Bitte Pflichtfelder, Datentypen, Auswahlwerte und bei XML die gewählte Fachnachricht prüfen.',
  test_certificate_required:
    'Der Empfängerschlüssel benötigt ein gültiges selbstsigniertes TEST-Zertifikat. Es wurde nichts angekündigt.',
  resource_denied: 'Die Zugangsdaten erlauben diese Aktion oder diese Absender-Destination nicht.',
  resource_unavailable: 'Die Aktion konnte nicht vollständig abgeschlossen werden.',
  invalid_resource: 'Die API-Antwort ist unvollständig oder widersprüchlich.',
  send_locked: 'Dieser Versandversuch kann nicht erneut ausgeführt werden. Bitte seinen Status prüfen.',
  confirmation_expired: 'Die Bestätigung ist abgelaufen. Bitte den Versand erneut vorbereiten.',
  schema_consent_required:
    'Erlauben Sie den Abruf öffentlicher Schemaquellen oder hinterlegen Sie ein lokales Schema.',
  schema_unavailable:
    'Das Schema ist nicht verfügbar oder die Quelle hat eine Fehlerantwort statt eines Schemas geliefert. Ihre bisherigen Fachdaten bleiben erhalten.',
  schema_tls_error: 'Die TLS-Verbindung zur Schemaquelle ist fehlgeschlagen. Das Schema wurde nicht geladen.',
  schema_network_error:
    'Die Schemaquelle konnte nicht erreicht oder vollständig gelesen werden (DNS, Verbindung oder Zeitlimit).',
  schema_http_error:
    'Das Schema ist nicht verfügbar. Die Quelle hat den Abruf mit einem HTTP-Fehler abgewiesen. Ihre bisherigen Fachdaten bleiben erhalten.',
  schema_archive_invalid:
    'Das SDK konnte das XRepository-Archiv nicht als verwendbares Schema-Paket auflösen.',
  example_unavailable:
    'Für dieses Schema konnte kein vollständiger Beispielentwurf erzeugt werden. Bitte Fachdaten manuell einfügen. Die bisherigen Fachdaten bleiben erhalten.',
  content_cleanup_failed:
    'Lokale Inhalte konnten nicht vollständig verworfen werden. Bitte die Sitzung abmelden.',
};

export const explain = (cause) => {
  const code = typeof cause === 'string' ? cause : cause?.message;
  if (
    [
      'test_pack_invalid',
      'test_pack_limit',
      'test_data_invalid',
      'test_schema_invalid',
      'test_reply_mismatch',
    ].includes(code)
  )
    return testPackError({ message: code });
  if (code === 'test_offer_mismatch')
    return 'Das aktuelle Empfängerangebot passt nicht zum Testfall. Bitte Destination, Leistung, Prozess und Schema prüfen. Ihr Entwurf wurde nicht ersetzt.';
  return Object.hasOwn(messages, code) ? messages[code] : errorMessage(cause);
};

export const diagnosticLabels = {
  source_access: 'Absenderberechtigung',
  recipient_key: 'Empfängerschlüssel',
  limits: 'Übertragungsgrenzen',
  destination: 'Destination laden',
  credentials: 'Zugriff prüfen',
  announce: 'Einreichung ankündigen',
  attachment: 'Anlage übertragen',
  finalize: 'Einreichung abschließen',
  sdk: 'SDK-Verarbeitung',
};
