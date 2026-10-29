# Roadmap

## 0.2.0

Die Version bündelt die vereinfachten Abläufe für Windows x64:

- FIT-Connect TEST, STAGE und PROD mit getrennten Verbindungen und Profilen, V-PKI-Import sowie zusätzlichen Bestätigungen für produktive Schreibaktionen.
- Senden, Empfangen und Antworten über API v2/v3, Schema-Prüfung für JSON/XML und gezielte Freigabe öffentlicher Schemaquellen.
- Lesbare Formularansichten, erreichbare Anlagen und Aktionen, nachvollziehbarer Tastaturfokus sowie überarbeitete Destination-Verwaltung und PDF-Steuerung.
- Gemeinsamer Nachrichtendownload und Sammelannahme mit manueller Entscheidung bei technischen Fehlern.
- Geschützte Vorgangsablage und Testfall-Sammlung, wiederverwendbare Testpakete und lokaler Schema-Vergleich.
- Zentral gepflegte Web-Anleitung, aktuelle Bilder und dokumentierte Build- und Release-Abläufe.

Die Freigabe benötigt die v2/v3-Regression, Tastatur-/NVDA- und Skalierungsprüfungen sowie ein unabhängig geprüftes signiertes Windows-Upgrade. Details stehen in [RELEASING.md](RELEASING.md).

## Goal 0.3.0: Wiederholbare Integrationsabläufe und sicherer Betrieb

Auf `release/0.3.0` entstehen integrierte Updates und die folgenden Komfortfunktionen. Die bisherigen 0.2.1-Fehlerkorrekturen sind vollständig integriert; ein separates 0.2.1-Release ist nicht vorgesehen. Die Version ist noch nicht veröffentlicht. Der öffentliche Update-Prüfschlüssel ist hinterlegt; Signier-Runner-Einrichtung und Windows-Update-Abnahme stehen vor der Freigabe an.

- Beim Start eine begrenzte, abschaltbare Hintergrundprüfung und unter „Info“
  eine manuelle Suche anbieten. Ohne Internet weiterarbeiten; eine fehlgeschlagene
  Prüfung nicht als „aktuell“ ausgeben. Keine FIT-Connect-Zugangsdaten übertragen.
- Nur neuere stabile Releases für die passende Plattform und Architektur anbieten.
  Entwürfe und Vorabversionen standardmäßig ausschließen; keine automatischen
  Downgrades. Gefundene Version und Versionshinweise verständlich anzeigen.
- „Update herunterladen“, „Installieren und neu starten“ und „Später“ anbieten. Fortschritt und Fehler
  anzeigen; ohne ausdrückliche Zustimmung keinen Installer starten.
- Den offiziellen Tauri-Updater mit verpflichtender Update-Signatur verwenden.
  Öffentlichen Prüfschlüssel in der Anwendung hinterlegen; privaten Schlüssel
  geschützt außerhalb des Repositorys speichern und sichern. Diese Signatur
  ergänzt die vorhandene Windows-Authenticode-Signatur und ersetzt sie nicht.
- Den Release-Ablauf um `latest.json` und die Update-Signatur des endgültigen,
  bereits Authenticode-signierten Installers erweitern. Signatur, Download und
  Manifest müssen zum unabhängig geprüften Paket gehören; danach keine
  Veränderung des signierten Installers. Fester HTTPS-Endpunkt im öffentlichen
  GitHub-Repository, beispielsweise `releases/latest/download/latest.json`.
- Vor dem Beenden ungespeicherte Entwürfe und laufende Schreibaktionen behandeln.
  Keine Unterbrechung mitten im Versand, in einer Annahme oder einem Export.
  Java-Kern geordnet beenden, Installer starten und Neustart ermöglichen.
  Abbruch oder Installationsfehler dürfen keinen erneuten Fachversand auslösen.
- Bestehende Installation, Profile, Schlüssel und geschützte Vorgänge erhalten.
  Native NSIS-Vorlage und Update-Modus ausdrücklich mit dem Updater abnehmen.
  Für verwaltete/offline betriebene Rechner den manuellen Download beibehalten.
- Regressionstests für Versionsvergleich, Release-Auswahl, falsche Plattform,
  Offline-/HTTP-/Manifestfehler, ungültige oder fehlende Signaturen, Abbruch und
  Zustände mit laufenden Aktionen schreiben. Unter Windows ein echtes Update vom
  installierten Vorgänger samt Profilerhalt, Neustart und Fehlerfällen prüfen.

Die veröffentlichte Version 0.2.0 kann sich nicht nachträglich selbst aktualisieren.
Die erste Version mit integriertem Updater wird einmal manuell installiert;
anschließend können spätere kompatible Releases über diesen Ablauf angeboten werden.
Für weitere Plattformen werden Updatepakete und Abnahme jeweils separat ergänzt.

Technische Grundlage: [Tauri-Updater](https://v2.tauri.app/plugin/updater/).
Die Einrichtung des Update-Signaturschlüssels und die Paketabnahme sind vor der
Freigabe erforderlich; dieser Roadmap-Eintrag aktiviert keine Updates.

### Vereinbarter Umfang auf `release/0.3.0`

- Empfang: Alter aus geprüften Bereitstellungsereignissen, Filter ab drei/neun Tagen, älteste zuerst und nächste Einreichung. Unbekannte Zeitpunkte nicht aus dem lokalen Abrufdatum ableiten; technische Abhol- und Löschfristen von fachlichen Fristen unterscheiden.
- Ungewissen Versand anhand bekannter Case-/Submission-ID lesend mit signierten Serverereignissen abgleichen. Fehlende Ereignisse nicht als Beweis für einen fehlenden Versand ausgeben; keine automatische Wiederholung.
- Zertifikatswarnungen bei abgelaufenen Zertifikaten sowie 30/90 Tagen Vorlauf. Keine automatische Schlüsselrotation.
- Destination-Konfigurationsvorlagen importieren, exportieren, geschützt speichern und vor Anwendung mit aktuellen Serverwerten vergleichen. Konfigurationsänderungen mit Vorher-/Nachher-Werten profil-, umgebungs- und API-gebunden mit Windows-DPAPI protokollieren. Keine vollständige serverseitige Änderungshistorie behaupten.
- Häufige und zuletzt geladene Empfänger-Destinations im geschützten Profil wiederfinden; deren aktuelles Leistungsangebot weiterhin laden.
- Testabläufe ergänzen vorhandene Testfälle. Versand, Eingang, Fachdaten-/Anlagenvergleich, erwartete Empfangsbestätigung und Antworten anhand lokaler Nachrichtenergebnisse prüfen; Durchläufe neu starten und Definition/Ergebnis exportieren. Schreibaktionen bleiben einzeln bestätigt.
- Optionaler mitgelieferter lokaler ClamAV mit geprüfter Offline-Komponente und signierten Datenbanken; eigene ClamAV-/ICAP-Gegenstellen bleiben möglich. Vor Empfangsfreigabe und Versand prüfen. Anlagenfunde einzeln sperren, manuelle Einzelannahme mit signierten Problembezügen ermöglichen. Unvollständige Scans blockieren. Kein FBForge-Relay, Sanitizing oder zusätzliche Quarantäne.
- Regressionen über API v2/v3, Fehlereingaben, Kontextwechsel, Speicherfehler, Zeitlimits und Wiederholungen; vollständige Java-, native und UI-Prüfungen sowie aktualisierte Anleitung und Versionshinweise.

Nicht enthalten: Callback-/Webhook-Werkzeug, neue Anlage-ID-Funktionen, große XSD-Bibliothek und nicht exportierbare Schlüssel/HSM. Netzwerk-Vorabprüfung (DNS, TLS, Proxy, Firewall sowie V-PKI-OCSP/CRL) und Routing-Debugger gehören zu **FBForge Inspect**.

Die Implementierung auf dem Feature-Branch ist keine Release-Freigabe. Vor Veröffentlichung bleiben Einrichtung des privaten Schlüssels am Signier-Runner, signierter Windows-Upgrade-Test und die Abnahme mit echten TEST-Zugängen erforderlich. Keine PR- oder Tag-Erstellung ohne gesonderten Release-Auftrag.

## Weitere Planung

- macOS und Linux: Paketierung, Installation, Plattform-Schlüsselspeicher und Abhängigkeiten pro Zielplattform prüfen. Es gibt keinen unverschlüsselten Ersatz für die geschützte Speicherung.
- Weitere Vereinfachungen aus Rückmeldungen zum tatsächlichen Einsatz und Beiträge anderer Entwickler.

Diese Punkte sind Planungen ohne zugesagten Veröffentlichungstermin. Neue Funktionen erhalten bei Bedarf eine weitere 0.x-Version; Fehlerkorrekturen eine Patch-Version. Für 1.0.0 ist eine stabile, dokumentierte und auf den zugesagten Plattformen abgenommene Funktionalität maßgeblich. Vorgeschriebene Zwischenversionen gibt es nicht.

Ein BPMN-Prozessmotor ist nicht geplant. Die Anwendung liest Modelle und verwendet geprüfte Nachrichtenbezüge.
