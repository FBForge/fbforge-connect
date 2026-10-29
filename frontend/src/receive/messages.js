import { receiveFailures } from './failures.js';

export function receiveMessages(reply) {
  const messages = {
    key_missing:
      'Zum Öffnen fehlt der passende private Schlüssel. Öffnen Sie die Empfangseinrichtung und laden Sie ihn dort.',
    key_rejected: reply
      ? 'Für diese Antwort ist in der Sitzung kein passender gebundener Antwortschlüssel verfügbar. Bitte dieselbe Sitzung verwenden, in der das Antwortangebot versendet wurde.'
      : 'Der geladene Schlüssel passt nicht mehr zu einer aktuellen Registrierung. Bitte Destination und Schlüssel erneut laden.',
    test_certificate_required:
      'Für diese Destination fehlt eine gültige Registrierung mit selbstsigniertem Testzertifikat.',
    verification_failed:
      'Die technische Prüfung der Einreichung ist fehlgeschlagen. Prüfen Sie Schlüssel, Event Log und Inhalte. Es liegt kein vollständiges Prüfergebnis vor.',
    schema_consent_required:
      'Das Schema benötigt eine öffentliche Quelle. Erlauben Sie den Abruf oder fügen Sie ein passendes lokales Schema hinzu.',
    schema_unavailable:
      'Die Schema-URI wurde aus den Metadaten gelesen. Das Schema oder eine seiner Referenzen konnte jedoch nicht vollständig geladen oder aufgelöst werden. Es liegt noch keine vollständige Inhaltsprüfung vor. Bei nicht öffentlich erreichbaren Schemata können Sie eine lokale Datei mit passender $id hinzufügen.',
    schema_tls_error:
      'Die Schemaquelle konnte nicht sicher erreicht werden. Prüfen Sie die Quelle oder fügen Sie eine passende lokale Schemadatei hinzu.',
    schema_network_error:
      'Die Schemaquelle ist nicht erreichbar. Prüfen Sie die Netzwerkverbindung oder fügen Sie eine passende lokale Schemadatei hinzu.',
    schema_http_error:
      'Die Schemaquelle hat kein verwendbares Schema geliefert. Prüfen Sie die Schema-URI oder fügen Sie eine passende lokale Schemadatei hinzu.',
    schema_archive_invalid:
      'Das geladene Schemapaket ist beschädigt oder überschreitet die zulässigen Grenzen. Prüfen Sie die Schemaquelle.',
    data_schema_invalid:
      'Die Fachdaten passen nicht zum angegebenen Schema. Prüfen Sie Daten und Schema, bevor Sie die Einreichung annehmen.',
    invalid_input:
      'Bitte eine UTF-8-JSON-Schemadatei mit eindeutiger absoluter $id und höchstens 2 MiB auswählen.',
    content_limit:
      'Die zulässige Größe wurde überschritten. Der Schema-Katalog darf insgesamt höchstens 16 MiB umfassen.',
    resource_unavailable:
      'Die Einreichung oder der lokale Speicher ist nicht verfügbar. Nach einem Bereinigungsfehler bitte abmelden und eine neue Sitzung öffnen.',
    resource_denied: 'Diese Zugangsdaten dürfen die angefragte Einreichung nicht abrufen.',
    resource_missing: 'Dieser Inhalt ist nicht mehr verfügbar. Bitte die Einreichung erneut prüfen.',
    invalid_resource:
      'Die Nachrichteninformationen oder Inhalte konnten nicht zuverlässig verarbeitet werden. Für diesen Fehler hat der Anwendungskern keinen genaueren Grund geliefert. Öffnen Sie die Einreichung erneut und prüfen Sie das Event Log.',
    content_cleanup_failed:
      'Lokale Dateien konnten nicht vollständig entfernt werden. Bitte die Sitzung schließen.',
  };

  return {
    ...messages,
    ...Object.fromEntries(Object.entries(receiveFailures).map(([code, value]) => [code, value.message])),
  };
}

export function receiveErrorTitle(code) {
  if (Object.hasOwn(receiveFailures, code)) return receiveFailures[code].title;
  return (
    {
      schema_consent_required: 'Freigabe für Schemaquellen erforderlich',
      schema_unavailable: 'Schema nicht verfügbar',
      key_missing: 'Schlüssel fehlt',
      vpki_certificate_required: 'V-PKI-Zertifikat nicht freigegeben',
      certificate_status_unknown: 'Zertifikatsstatus nicht feststellbar',
      key_rejected: 'Schlüssel passt nicht',
      test_certificate_required: 'Testzertifikat fehlt',
      resource_denied: 'Zugriffsberechtigung fehlt',
      data_schema_invalid: 'Fachdaten passen nicht zum Schema',
    }[code] || 'Inhalte konnten nicht geprüft werden'
  );
}
