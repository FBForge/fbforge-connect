# Roadmap

Stand: 16. Oktober 2026. Die Entwicklung erfolgt schrittweise. Veröffentlichungstermine sind noch nicht festgelegt.

## Erste Alpha

Die Alpha soll den grundlegenden Austausch von Einreichungen auf der FIT-Connect-Testumgebung ermöglichen. API v2 und v3 bleiben getrennt auswählbar.

### Bereits umgesetzt

Die folgenden Funktionen sind im lokalen Entwicklungsstand vorhanden. Die vollständige Erprobung aller Abläufe gegen die Testumgebung ist noch offen.

* Desktop-Oberfläche mit Vue und Tauri: feste Navigation, globale Verbindung, Statusleiste, gegliederter Versand und getrennte Diagnose-/Informationsansichten.
* Lokaler Java-Kern mit getrennten SDK-Adaptern für v2 und v3.
* Gemeinsamer Verbindungsbereich für Senden, Empfangen und Event Log.
* Lokales Laden und Zuordnen privater Testschlüssel.
* Mehrfachauswahl und Drag and Drop für Schlüssel und Anlagen.
* Auswahl angebotener Leistungen und Fachdaten-Schemata über den Empfängerzustellpunkt.
* Erzeugung fiktiver JSON- und XML-Fachdaten.
* Versandvorbereitung, Bestätigung und Schutz vor unbemerktem Wiederholen ungewisser Übertragungen.
* Auflisten und Abrufen von Einreichungen.
* Lokale Entschlüsselung, technische Prüfung sowie Annahme und Ablehnung.
* Formularansicht für JSON und XML mit Feldgruppen, Suche, Feldherkunft und Originalquelltext; durchsuchbare JSON-Struktur und Downloads.
* Antragsansicht nach dem Entschlüsseln mit separater Anlagenliste; lokale Vorschau auch vor dem Versand und beim Verfassen einer Antwort.
* Grundlagen für Antwortkanäle, Replies und Event Logs.
* Erste Verwaltung vorhandener eigener Zustellpunkte: authentifizierte Detailansicht und v3-PATCH für Name, Kontakt, Metadatenversionen und Aktiv-/Inaktiv-Wechsel.
* Bulk-Edit für bis zu zehn Zustellpunkte mit Vorschau, erneuter Zustandsprüfung, explizitem Speichern und Ergebnis je Zustellpunkt.

Der Versand über API v2 wurde bereits erfolgreich gegen TEST erprobt. `0.1.0-dev.2` korrigiert den unnötigen V3-Zugriff auf die Vorgangsliste und akzeptiert die zweite offizielle TEST-Ausstelleradresse im Event Log. Roundtrip-Tests decken SDK-Versand und Empfang in allen vier v2/v3-Kombinationen mit Metadaten 2.0.0 und Anlagen ab. Fehler beim Abruf von Signaturschlüsseln bleiben als konkrete Fehlercodes erhalten. Windows-CI läuft auch auf `develop`.

Die erneute Live-Erprobung von V3, Empfang und Event Log ist noch offen. Der [Alpha-Testplan](ALPHA_TESTPLAN.md) enthält die Schritte und Abnahmekriterien.

### Vor einer ausführbaren Alpha

* Versand über v3 zuverlässig abschließen und gegen TEST prüfen.
* Empfang, Entschlüsselung, Schema-Prüfung und Event Log mit repräsentativen Testfällen erproben.
* XRepository-Auflösung und erzeugte XML-Beispiele anhand realer Standards prüfen.
* Diagnoseexport anhand der Live-Abnahme bewerten; fachliche Prüfresultate und detaillierte Versanddiagnose bei Bedarf gezielt ergänzen.
* Bekannte Einschränkungen dokumentieren.
* Windows-Build und Installation auf einem frischen System prüfen.
* Signierung und Bereitstellung des Windows-Pakets vorbereiten.

`0.1.0-dev.4` ergänzt den Desktop-Aufbau und einen lokalen Diagnoseexport mit festgelegten technischen Feldern. Herstellerwerbung entfällt in der Oberfläche. V3-Verwaltung wird weitergeführt; eine zusätzliche V2-Schreibverwaltung ist nicht geplant. Die Anwendung bleibt auf TEST beschränkt.

`0.1.0-dev.5` führt den Namen **FIT-Connect Test-Client** in Oberfläche, Fenstertitel, Installer und Diagnosebericht ein. Vorhandene Installationskennung und interne Paketnamen bleiben für die Kontinuität bestehender Installationen bestehen. Die Formularansicht ist nur lesend und verwendet die vorhandenen Originalfelder. Ein fachliches Mapping oder ein Formular-Editor wird damit noch nicht versprochen.

## Richtung Beta

### Alpha abschließen

1. Live-Abnahme von V3-Versand, Empfang, Entschlüsselung, Schema-Prüfung, Event Log und Zustellpunktänderungen abschließen; konkrete Fehler mit dem Diagnosebericht zuordnen.
2. JSON-/XML-Antragsansicht und Anlagen mit repräsentativen echten Standards und fiktiven Daten prüfen. Große oder nicht darstellbare Dokumente müssen über Quelltext beziehungsweise Download zugänglich bleiben. Eine Vorschau darf keinen Versand, Reply oder Empfangsabschluss auslösen.
3. Installation und Aktualisierung von dev.4 auf dev.5 auf einem frischen Windows-System, Tastaturbedienung, kleine Fenster, hohe Skalierung und Hell-/Dunkeldesign prüfen. Signierung und Verteilung klären.

### Beta: Testarbeitsplatz einrichten

* Eigene TEST-Zustellpunkte über Destination API v3 anlegen und die erforderlichen öffentlichen Schlüssel registrieren, mit Vorschau und ausdrücklicher Bestätigung.
* Testschlüssel und selbstsignierte Testzertifikate lokal erzeugen: Verwendungszweck, Ablaufdatum und Fingerabdruck anzeigen; privaten Schlüssel lokal behalten beziehungsweise ausdrücklich exportieren, ausschließlich den öffentlichen Teil registrieren.
* Optionale Verbindungsprofile und das Merken von Client-Secret/JWK über einen geschützten nativen Speicher vorbereiten. Keine Klartext-Geheimnisse in Browser-Speicher, Konfigurationsdateien oder Diagnoseberichten. Ohne geschützten Speicher bleibt die bisherige sitzungsgebundene Nutzung verfügbar.
* Wiederverwendbare Testanträge und Darstellungsvorlagen je Fachdaten-Schema: Feldbeschriftung, Gruppierung und Reihenfolge explizit zuordnen. XML-Namensräume, Originalwerte und nicht zugeordnete Felder müssen erhalten bleiben. Ein Schema-gestützter Formular-Editor ist eine eigene Ausbaustufe.

### Beta: Fachverfahren und Prozesse erproben

* Den Ablauf „Antrag ansehen → Anlagen prüfen → Antwort vorbereiten → ausdrücklich senden“ mit repräsentativen Antwortkanälen vervollständigen. Replies einschließlich Empfangsbestätigungen prüfen.
* Prozessnachrichten aus den angebotenen Nachrichten und Modellen auswählen und passende eigene TEST-Zustellpunkte ermitteln.
* BPMN.io/bpmn-js für eine begrenzte BPMN-Ansicht mit auswählbaren Nachrichtenschritten integrieren. Ein Klick zeigt die passende Aktion; Übertragungen erfolgen weiterhin ausschließlich nach eigener Bestätigung. Nicht unterstützte Modelle bleiben ohne automatische Prozessausführung lesbar beziehungsweise exportierbar.

Mehrfach-Schlüsselwechsel benötigt vor seiner Umsetzung ein eigenes Konzept für Zuordnung, Teilausfälle und den Erhalt der Empfangsfähigkeit. Routing-Debugger, PROD-Verwaltung und ZBP-Adapter gehören nicht zum aktuellen Alpha-/Beta-Arbeitsumfang. Der Schwerpunkt bleibt auf Testanträgen aus Sicht von Onlinediensten und Fachverfahren.

## Weitere Ausbaustufen

* Einreichungen über mehrere Zustellpunkte hinweg suchen.
* Replies einschließlich Empfangsbestätigungen vervollständigen.
* Prozessnachrichten für die jeweiligen Funktionen von v2 und v3 ausbauen.
* BPMN-Modelle darstellen und Nachrichtenaktionen über Prozessschritte anbieten.
* Zustellpunktverwaltung um Anlegen, Schlüsselregistrierung, Leistungen/Schemata, Prozessnachrichten, Callbacks und Lösch-/Stilllegungsabläufe erweitern.
* Bedienung, Barrierefreiheit und Diagnose anhand der Alpha-Rückmeldungen verbessern.

Die Anwendung bleibt auf Integrationstests beschränkt. Die Produktivumgebung ist nicht vorgesehen.

## Repository und Mitarbeit

`main` enthält die Projektübersicht und diese Roadmap. Der aktuelle Anwendungscode mit Build-Anleitung und Tests liegt auf [develop](https://github.com/FBForge/fit-connect-testclient/tree/develop). Eine Alpha-Veröffentlichung mit Downloads folgt nach der technischen Erprobung.

Fehlerberichte und Vorschläge sind über die [GitHub Issues](https://github.com/FBForge/fit-connect-testclient/issues) willkommen. Bitte ausschließlich fiktive Testdaten verwenden und keine Zugangsdaten oder privaten Schlüssel veröffentlichen.
