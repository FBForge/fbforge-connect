# Versionshinweise

## 0.3.0 (in Entwicklung)

- Formulare, Dropdowns und Checkboxen mit einheitlichen Abständen, breiten mehrzeiligen Feldern und lesbaren Auswahltexten. Testpakete und Abläufe sind gemeinsam gruppiert. Der Assistent heißt „Antwortschemas“.
- Virenscan direkt in der Navigation und mit sichtbarem Status beim Senden und Empfangen. Tatsächlich geprüfte Anlagen und Scan-Ergebnisse werden ausdrücklich ausgewiesen. Signaturaktualisierungen bleiben nach einem Seitenwechsel sichtbar und abbrechbar, ohne die übrigen Arbeitsbereiche zu sperren.
- Einzeldownloads und lokale Exporte verwenden in der Desktop-Anwendung den nativen Speichern-Dialog. Der Benutzer-Downloadordner wird vorgeschlagen. Erfolg, Abbruch und Schreibfehler bleiben sichtbar. Das Empfangsergebnis bleibt nach einem Speicherfehler nutzbar.
- Event-Log-Details einschließlich Anlagen, Authentifizierungstags und Problemen direkt in der Übersicht. Originaldokumente bleiben zusätzlich erreichbar.
- „Bestehende Destinations“ lädt die Übersicht und führt aus der Detailansicht zurück. Fehlende veröffentlichte Update-Informationen werden von Netzwerk- und Signaturfehlern unterschieden. Update-Downloads unterstützen die gleiche Größenbegrenzung wie der native Kern.

- Windows-Installer-Builds bereiten ein fehlendes optionales Scanner-Paket automatisch vor dem Rust-Build vor; eine fehlgeschlagene Vorbereitung stoppt den Ablauf. Entwicklungsstarts und Debug-Builds bleiben ohne automatischen Scanner-Download.
- Lizenztexte und Destination-Werkzeuge in eigene Frontend-Pakete aufgeteilt. Eine zusätzliche Produktionsprüfung kontrolliert Paketgrößen und die Ausführung der gebauten Oberfläche.

- Prozessantworten direkt aus übernommenen Modellzuordnungen oder vereinbarten Kennungen zusammenstellen. Schemahinweise, Duplikate und Limits prüfen; Modellzuordnungen auch beim Bearbeiten von Destination-Prozessnachrichten übernehmen.
- Lokaler Assistent für JSON-Antwortschemas für fachliche Statusmitteilungen und Nachforderungen: editierbare Felder, Pflichtangaben und Statuswerte; Schema-, Beispiel- und Entwurfsexport mit Wiederimport. Schema-Kennungen aus Dateien in die Konfiguration übernehmen; der Versand bleibt an das aktuelle Antwortangebot des Empfängers gebunden.

- Empfang mit Alter aus geprüften Serverereignissen, Filtern und „Nächste Einreichung öffnen“. Technische Abholfristen und unbekannte Zeitpunkte ausdrücklich anzeigen.
- Ungewissen Versand mit bekannten Nachrichtenkennungen lesend gegen signierte Serverereignisse prüfen; keine automatische Wiederholung.
- Zertifikatswarnungen mit 30/90 Tagen Vorlauf. Empfänger-Favoriten und zuletzt verwendete Destinations geschützt im Profil speichern.
- Destination-Vorlagen mit Import, Export und Feldvergleich. Profil-, umgebungs- und API-gebundene Windows-DPAPI-Historie für Konfigurationsänderungen einschließlich ungewissem Ausgang.
- Wiederholbare Testabläufe ergänzen Testfälle: Versand, Eingang, Inhalts-/Anlagenvergleich, erwartete Bestätigung und Antwort anhand lokaler Nachrichten prüfen; Definition und Durchlaufergebnis exportieren.
- Optionaler lokaler ClamAV 1.5.4 im Windows-Setup, offline nachinstallierbares Komponentenpaket und bewusste Online-Einrichtung. Geprüfte offizielle Engine-Dateien, signierte Virendatenbanken, sichtbarer Signaturstand und zustimmungspflichtige FreshClam-Updates. Eigene ClamAV-/ICAP-Gegenstellen bleiben auswählbar.
- Metadaten, Fachdaten und Anlagen beim Empfang scannen. Vor Versand und Antwort werden Fachdaten und Anlagen geprüft. Betroffene Anlagen bleiben gesperrt; geprüfte übrige Inhalte bleiben lesbar. Einzelannahmen mit Anlagenproblemen benötigen zusätzliche Bestätigung und melden die Kennungen im signierten Accept. Sammelannahme und vollständiger Originalexport bleiben dafür gesperrt. Unvollständige Scans bleiben blockierend. Kein gehosteter Dienst, Sanitizing oder zusätzliche Quarantäne.

- Integrierte Updates für Windows x64: automatische, abschaltbare Suche und manuelle Suche unter „Info“, Hinweis auf neue stabile GitHub-Releases, Downloadfortschritt und abbrechbarer Download.
- Installer erst nach erfolgreicher Paket- und Versionssignaturprüfung sowie nativer Bestätigung starten. Laufende Aktionen und offene Exporte blockieren die Installation; gespeicherte Schlüssel werden vor dem Beenden gesichert.
- Release-Paket um Update-Signatur und `latest.json` ergänzen. Der öffentliche Prüfschlüssel ist hinterlegt. Vor der Freigabe müssen der private Schlüssel am Signier-Runner eingerichtet und ein echtes signiertes Windows-Update abgenommen werden. Entwicklungspakete ohne Prüfschlüssel bieten weiterhin den manuellen Download.
- Die erste Version mit Updater muss einmal manuell installiert werden; ältere Versionen erhalten diese Funktion nicht nachträglich.

### Übernommene Fehlerkorrekturen aus 0.2.1

- Bei nicht verwendbaren Empfangsinhalten konkrete Prüfschritte und Gründe anzeigen, etwa fehlende oder nicht unterstützte Metadatenversionen, unzulässige Dateinamen, widersprüchliche Kennungen oder während des Abrufs veränderte Nachrichteninformationen. Ohne näheren Grund bleibt die Diagnose ausdrücklich unbestimmt.

- „Zurück zum Eingang“ beim Empfang in einer beim Scrollen sichtbaren unteren Navigationsleiste anzeigen, auch nach Annahme oder Ablehnung. Lange Anlagenlisten berücksichtigen deren Höhe.
- Nach fehlgeschlagener Inhaltsprüfung mit `invalid_resource` oder `verification_failed` die manuelle Ablehnung direkt an der Fehlermeldung anbieten. Ein Ablehnungsgrund und eine ausdrückliche Versandbestätigung bleiben erforderlich.

- Java-SDK für API v3 von 4.0.0-rc.2 auf die finale Version 4.0.0 aktualisiert. Der getrennte v2-Adapter verwendet weiterhin die aktuelle 3.x-Version 3.5.2.
- Schemaabweichungen beim Empfang über API v2 und v3 getrennt von Entschlüsselung und Integrität anzeigen. Fachdaten, Anlagen und verwendetes Schema bleiben lesbar; JSON-Felder werden mit konkreten Abweichungen markiert, XML meldet Zeile und Spalte.
- Eine Einzelannahme trotz Schemaabweichung benötigt eine zusätzliche native Bestätigung. Die Sammelannahme bleibt für solche Nachrichten gesperrt. Signatur-, Hash- und Entschlüsselungsfehler bleiben blockierend.
- „Alle Dateien herunterladen“ bei lokalen Vorgängen ohne entschlüsselte Fachdaten sperren und zum Empfang führen. Der native Export meldet diesen Zustand verständlich und legt keine scheinbar vollständigen Dateien an.
- „Leistungsnamen aus FIM laden“ direkt bei der Verwaltungsleistung anzeigen, vor der Prozessnachricht und der Absender-Destination. Tastaturreihenfolge und Rückmeldungen bleiben bei der zugehörigen Auswahl.
- Leistungskennungen ohne Namen in der Auswahl vollständig anzeigen, einschließlich URN-Präfix. Ein erfolgloser FIM-Abruf verändert die Kennung nicht.
- Eine eindeutige HTTP-401/403-Ablehnung beim erstmaligen Ankündigen einer Einreichung als fehlgeschlagen anzeigen. Unklare Antworten und Fehler nach einer möglichen Anlage bleiben ungewiss.
- Nach einem ungewissen Versand einen neuen Entwurf ohne erneute Profilanmeldung ermöglichen. Vorher sind Prüfung und ausdrückliche Bestätigung des Doppelversandrisikos erforderlich. Der ursprüngliche Versuch und seine Kennungen bleiben erhalten; es gibt keine automatische Wiederholung.

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
