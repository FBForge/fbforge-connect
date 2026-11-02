# Versionshinweise

## 0.3.0 (unveröffentlicht)

### Integrationen und Testabläufe

- Testpakete und Ablaufdefinitionen geschützt im Windows-Benutzerkonto speichern,
  nach Neustart öffnen und bewusst löschen. Testabläufe prüfen Versand, Eingang,
  Fachdaten/Anlagen, Empfangsbestätigung und Antworten anhand lokaler Nachrichten.
  Sender-/Empfängerprofile und Destinations zuordnen, konkrete Inhaltsabweichungen
  anzeigen und Durchläufe nach Neustart mit historischem Prüfstand fortsetzen.
- Prozessantworten aus BPMN-Zuordnungen oder vereinbarten Kennungen zusammenstellen.
  Eigene JSON-Antwortschemas mit Statuswerten, Feldern und Pflichtangaben erzeugen.
  Schema, Beispiel und bearbeitbaren Entwurf exportieren und wieder importieren.
- Eingangsalter aus geprüften Serverereignissen laden, filtern und zur nächsten
  Einreichung wechseln. Ungewissen Versand lesend mit dem Server abgleichen.
- Empfänger-Favoriten, zuletzt geladene Destinations, Konfigurationsvorlagen und
  lokale Änderungshistorie geschützt speichern. Zertifikatswarnungen mit 30/90 Tagen Vorlauf.

### Scanner und Updates

- Optionaler lokaler ClamAV 1.5.4 im Setup, Offline-Import und Online-Einrichtung.
  Geprüfte Engine-Dateien, signierte Datenbanken, sichtbarer Signaturstand und
  zustimmungspflichtige FreshClam-Updates. Eigene ClamAV-/ICAP-Dienste bleiben möglich.
- Virenscan direkt in der Navigation und Ergebnisse beim Senden/Empfangen je Anlage
  sichtbar. Signaturupdates bleiben beim Seitenwechsel bedienbar und abbrechbar.
  Geladene Scanner-Einstellungen werden beim Öffnen korrekt angezeigt.
  Verspätete Statusantworten überschreiben keine laufenden Eingaben. Fortschritt
  und Abbruch bleiben auch beim Wechsel des ausgewählten Verfahrens sichtbar.
  Erfolgreiche Signaturdownloads werden nicht mehr wegen umfangreicher
  FreshClam-Fortschrittsausgaben als fehlgeschlagen gemeldet.
- Anlagenfunde sperren betroffene Dateien. Geprüfte übrige Inhalte bleiben lesbar.
  Ausdrücklich bestätigte Einzelannahme meldet die Anlagenprobleme signiert an
  FIT-Connect. Sammelannahme und vollständiger Export bleiben gesperrt.
  Metadaten-/Fachdatenfunde und unvollständige Scans blockieren die Freigabe.
- Integrierte Suche nach neueren stabilen Windows-x64-Releases, abschaltbar beim Start
  oder manuell unter „Info“. Download mit Fortschritt und Abbruch. Installation erst
  nach Paket-/Versionssignaturprüfung, Schlüsselsicherung und nativer Bestätigung.
  Release-Pakete enthalten Update-Signatur und `latest.json`.
- Die erste Version mit Updater einmal manuell installieren. Die signierte
  Update-Abnahme des endgültigen Release-Pakets steht noch aus.

### Bedienung und Fehlerkorrekturen

- Reguläres Fensterschließen erreicht den Bestätigungsdialog auch im installierten
  Desktop. Die Oberfläche erhält dafür nur die nötigen Ereignis-Empfangsrechte.

- Antworten im geöffneten Vorgang bleiben nach bestätigter Annahme möglich.
  Fensterschließen schützt laufende Aktionen und sichert gespeicherte Profile.
- Einheitliche Proxy-Einstellung für OAuth, FIT-Connect, SDKs, öffentliche Schemata,
  Updates und Scanner-Downloads. Proxy-Passwörter werden benutzergebunden geschützt.
- Update-Abbruch greift auch während des Wartens auf HTTP-Antwort-Header.

- Einheitliche Formularabstände, lesbare Auswahlen, kompakte Profileditoren und
  Antwortschema-Felder. Ereignisse zeigen Gründe, Anlagen und Authentifizierungstags
  direkt. Formularbeschriftungen bei der Formularansicht laden und gezielt neu laden.
- Native Speichern-Dialoge schlagen den Downloadordner vor und melden Erfolg,
  Abbruch und Fehler. Empfangsinhalte bleiben nach einem Speicherfehler nutzbar.
- Vorgänge gespeicherter Profile unter Windows standardmäßig dauerhaft aufbewahren.
  Abwahl bleibt pro Profil/API gespeichert. Ohne gespeichertes Profil nur Sitzungskopien.
- „Bestehende Destinations“ führt zur Übersicht. Einzelbearbeitung schreibt nur
  geänderte Felder. Gespeicherte Antwortschemas trotz normalisierter API-Reihenfolge
  korrekt bestätigen, tatsächliche Abweichungen weiterhin melden.
- Schemaabweichungen über v2/v3 getrennt von Kryptografie behandeln. Geprüfte Daten,
  Anlagen und Schema bleiben lesbar. Zusätzliche Bestätigung für Einzelannahme,
  konkrete JSON-/XML-Fehler und begründete Ablehnung bei `invalid_resource` oder
  `verification_failed`. Vorgänge ohne entschlüsselte Daten bieten keinen Voll-Download.
- „Zurück zum Eingang“ bleibt erreichbar. FIM-Namensabfrage steht bei der Leistung.
  Ohne geladene Namen bleiben vollständige URNs erhalten.
- Eindeutige 401/403-Ablehnung beim erstmaligen Ankündigen als fehlgeschlagen anzeigen.
  Ungewisse Versuche bleiben gesperrt. Ein neuer Entwurf erfordert Bestätigung des
  Doppelversandrisikos und wiederholt den alten Versuch nicht.
- SDK v3 auf 4.0.0 aktualisiert, v2 verwendet 3.5.2. Die ursprünglich für 0.2.1
  vorgesehenen Korrekturen sind enthalten. Es gibt kein separates 0.2.1-Release.
- Fehlendes Scanner-Paket vor Installer-Build automatisch vorbereiten. Debug-Starts
  laden es nicht nach. Frontend-Pakete aufgeteilt und Produktionspaketprüfung ergänzt.

## 0.2.0

- Transitive Bouncy-Castle-Kryptografiebibliotheken beider SDK-Adapter auf 1.86 aktualisiert.
- TEST, STAGE und PROD auswählbar. Getrennte Profile, erneute Anmeldung beim Wechsel und zusätzliche native Bestätigung für produktive Schreibaktionen.
- V-PKI-Schlüssel mit Zertifikatsketten als PKCS#12 oder private JWK importieren. STAGE und PROD prüfen Vertrauenskette und Sperrstatus mit dem SDK.
- Geführte Aufgaben für Senden und Abruf auch im Produktivbetrieb. Einheitliche SSP-Umgebungsfarben für TEST, STAGE und PROD.
- Gespeicherte Profile direkt verbinden; neue Zugangsdaten bleiben separat aufklappbar. System, Hell und Dunkel mit automatischer Anpassung während der Sitzung wählen.
- Anlagen und Empfangsaktionen bereits im Standardfenster neben dem Formular; in schmalen Ansichten stehen Aktionen vor langen Anlagenlisten. Kompaktere Fachdaten-Hinweise.
- Lesende Formularansicht mit Anlagen und zusammenhängenden Vorgängen.
- Metadaten, Fachdaten und Anlagen gemeinsam herunterladen. Mehrfachauswahl mit Prüfung, Dateiablage und anschließender Annahme. Fehlerhafte Einreichungen bleiben manuell bearbeitbar.
- Bei der Einzelannahme optional alle Dateien vorher speichern. Abgebrochene oder fehlgeschlagene Downloads senden keine Annahme.
- Kompakte Profilauswahl mit Client-ID und eingeklappter Verwaltung. Aktuelle oder gespeicherte Zugangsdaten über den API-Schalter für v2 und v3 wiederverwenden, mit getrennten Schlüsseln und Vorgängen.
- Beim Profil- oder API-Wechsel beginnt der erhaltene Versandentwurf wieder bei der Adressierung. Empfängerangebote werden erneut geladen.
- Einheitlicher Import privater Schlüssel als JWK, JWKS, PEM oder PKCS#12. Korrekte Zuordnung lokaler Schlüsselkennungen und Unterstützung registrierter V-PKI-Zertifikatsketten.
- Programmdatei `fbforge-connect.exe` und einheitliche Paketnamen. Bestehende Installationen und Profile bleiben erhalten.
- Sichtbare Destination-Details, gemeinsame Bearbeitung und erreichbare PDF-Seitensteuerung.
- Unbekannte OAuth-Scope-Angaben werden nicht als bekannte Lesebeschränkung für die Destination-Verwaltung gewertet. Jede Änderung bleibt serverseitig autorisiert.
- JSON/XML vor dem Versand gegen das Schema prüfen. Nachfrage beim Abruf öffentlicher Schemaquellen.
- Benannte Testfälle geschützt speichern, direkt laden und als Testpaket austauschen. Lokale JSON-Schemata oder XSDs vergleichen.
- Leistungsnamen aus dem FIM-Portal ergänzen und das Schema vor der Beispielerzeugung auswählen.
- Verständliche Schemahinweise und gezielte XML-Nachrichtenauswahl bei Beispieldaten.
- Beim Empfang nachgewiesene JSON- und XML-Schemaabweichungen gezielt anzeigen. Fehlerhafte Inhalte bleiben gesperrt.
- Vollständige Case-Event-Logs einschließlich signierter Empfangsquittungen verschiedener Destinations über API v2 und v3 prüfen.
- Zentral gepflegte Web-Anleitung mit aktuellen Bildern und Beispielen.

## 0.1.0-alpha.1

Erste Alpha für Windows x64 und FIT-Connect TEST.

- Einreichungen und Replies über API v2/v3 mit Inhaltsprüfung und Event Log.
- Lokale Vorgangsübersicht mit Formularansicht, Anlagenvorschau und optionaler verschlüsselter Aufbewahrung.
- Eigene v3-Destinations mit Schlüsselverwaltung und Absender-Auswahl.
- Prozessnachrichten aus BPMN-Modellen auswählen und passende Destinations suchen.
- Bebilderte Offline-Hilfe, Testbeispiele und verständlichere Diagnosemeldungen.

Windows-Setup mit digitaler Signatur und Zeitstempel.
