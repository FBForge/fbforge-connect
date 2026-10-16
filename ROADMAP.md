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
* Inhaltsvorschau, durchsuchbare JSON-Struktur und Downloads.
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

## Richtung Beta

1. Live-Abnahme von V3-Versand, Empfang, Entschlüsselung, Schema-Prüfung, Event Log und Zustellpunktänderungen abschließen; konkrete Fehler mit dem Diagnosebericht zuordnen.
2. Installation und Aktualisierung auf einem frischen Windows-System, Tastaturbedienung, kleine Fenster, hohe Skalierung und Hell-/Dunkeldesign prüfen. Signierung und Verteilung klären.
3. Vorhandene Zustellpunktverwaltung um Anlegen und die notwendige Schlüsselregistrierung über V3 erweitern. Mehrfach-Schlüsselwechsel benötigt vor seiner Umsetzung ein eigenes Konzept für Zuordnung, Teilausfälle und den Erhalt der Empfangsfähigkeit.
4. Erst anschließend Replies, Prozesskommunikation und BPMN weiter ausbauen. ZBP-Adapter und Produktivumgebung gehören nicht zum aktuellen Alpha-/Beta-Arbeitsumfang.

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
