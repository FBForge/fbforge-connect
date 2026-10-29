// Fixed explanations only: native SDK and HTTP exception text can contain received data.
export const receiveFailures = Object.freeze({
  receive_response_invalid: {
    title: 'API-Antwort nicht lesbar',
    message:
      'Beim Laden der Nachrichteninformationen konnte eine API-Antwort nicht im erwarteten Format gelesen werden. Sie ist leer, unvollständig oder enthält ungültige Angaben. Öffnen Sie die Einreichung erneut und prüfen Sie das Event Log.',
  },
  receive_message_mismatch: {
    title: 'Nachrichtenkennungen stimmen nicht überein',
    message:
      'Beim Zuordnen der Nachricht passen Destination, Einreichung oder Vorgang nicht zum angeforderten Datensatz. Öffnen Sie die Einreichung erneut aus dem Eingang.',
  },
  receive_message_changed: {
    title: 'Nachrichteninformationen haben sich geändert',
    message:
      'Während der Prüfung haben wiederholte Abrufe unterschiedliche Nachrichteninformationen oder Anlagen geliefert. Die Prüfung wurde abgebrochen. Öffnen Sie die Einreichung erneut.',
  },
  receive_attachments_invalid: {
    title: 'Anlagenverzeichnis ist ungültig',
    message:
      'Beim Lesen des Anlagenverzeichnisses fehlen Angaben, sind Anlagenkennungen mehrfach vorhanden oder wird die zulässige Anzahl überschritten. Prüfen Sie die Nachricht beim Absender.',
  },
  receive_key_mismatch: {
    title: 'Öffentlicher Prüfschlüssel passt nicht zur Abfrage',
    message:
      'Beim Laden eines öffentlichen Prüfschlüssels stimmt die gelieferte Schlüsselkennung nicht mit der angeforderten Kennung überein. Dieser Fehler betrifft die API-Antwort, nicht die Auswahl Ihres privaten Schlüssels.',
  },
  receive_payload_invalid: {
    title: 'Verschlüsseltes Nachrichtenformat ist ungültig',
    message:
      'Beim Prüfen der Verschlüsselungshülle wurde ein unvollständiges oder nicht unterstütztes JWE-Format erkannt. Prüfen Sie das Nachrichtenformat beim Absender.',
  },
  receive_metadata_invalid: {
    title: 'Metadaten sind nicht lesbar',
    message:
      'Nach der Entschlüsselung sind die Metadaten kein eindeutiges JSON-Objekt oder überschreiten die zulässigen Strukturgrenzen. Prüfen Sie insbesondere die JSON-Syntax und doppelte Feldnamen beim Absender.',
  },
  receive_metadata_schema_missing: {
    title: 'Schema-Kennung der Metadaten fehlt',
    message:
      'Beim Prüfen der Metadaten fehlt eine verwendbare $schema-Kennung als Text. Der Absender muss die Metadatenversion angeben. Ein lokales Fachdaten-Schema ersetzt diese Kennung nicht.',
  },
  receive_metadata_schema_unsupported: {
    title: 'Metadatenversion wird nicht unterstützt',
    message:
      'Beim Prüfen der Metadaten wird deren $schema-Kennung vom gewählten API-Adapter nicht unterstützt. Prüfen Sie die Metadatenversion und API-Version beim Absender. Ein lokales Fachdaten-Schema behebt diesen Fehler nicht.',
  },
  receive_filename_invalid: {
    title: 'Dateiname einer Anlage ist nicht verwendbar',
    message:
      'Beim Prüfen der Metadaten wurde ein leerer, zu langer oder unzulässiger Anlagenname erkannt, etwa ein Pfad oder ein unter Windows reservierter Name. Der Absender muss einen zulässigen Dateinamen verwenden.',
  },
});
export const isReceiveFailure = (code) => typeof code === 'string' && Object.hasOwn(receiveFailures, code);
