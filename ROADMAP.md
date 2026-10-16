# Roadmap

Stand: 16. Oktober 2026. Die Entwicklung erfolgt schrittweise. Veröffentlichungstermine sind noch nicht festgelegt.

## Erste Alpha

Die Alpha soll den grundlegenden Austausch von Einreichungen auf der FIT-Connect-Testumgebung ermöglichen. API v2 und v3 bleiben getrennt auswählbar.

### Bereits umgesetzt

Die folgenden Funktionen sind im lokalen Entwicklungsstand vorhanden. Die vollständige Erprobung aller Abläufe gegen die Testumgebung ist noch offen.

* Desktop-Oberfläche mit Vue und Tauri.
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

Der Versand über API v2 wurde bereits erfolgreich gegen TEST erprobt. Für andere Abläufe stehen weitere Integrationstests und Fehlerkorrekturen aus.

### Vor einer ausführbaren Alpha

* Versand über v3 zuverlässig abschließen und gegen TEST prüfen.
* Empfang, Entschlüsselung, Schema-Prüfung und Event Log mit repräsentativen Testfällen erproben.
* XRepository-Auflösung und erzeugte XML-Beispiele anhand realer Standards prüfen.
* Technische Diagnose für alle wesentlichen Abläufe vereinheitlichen und exportierbar machen.
* Bekannte Einschränkungen dokumentieren.
* Windows-Build und Installation auf einem frischen System prüfen.
* Signierung und Bereitstellung des Windows-Pakets vorbereiten.

## Weitere Ausbaustufen

* Einreichungen über mehrere Zustellpunkte hinweg suchen.
* Replies einschließlich Empfangsbestätigungen vervollständigen.
* Prozessnachrichten für die jeweiligen Funktionen von v2 und v3 ausbauen.
* BPMN-Modelle darstellen und Nachrichtenaktionen über Prozessschritte anbieten.
* Zustellpunkte auf TEST verwalten und mehrere Zustellpunkte gemeinsam bearbeiten.
* Bedienung, Barrierefreiheit und Diagnose anhand der Alpha-Rückmeldungen verbessern.

Die Anwendung bleibt auf Integrationstests beschränkt. Die Produktivumgebung ist nicht vorgesehen.

## Repository und Mitarbeit

`main` enthält die Projektübersicht und diese Roadmap. Der aktuelle Anwendungscode mit Build-Anleitung und Tests liegt auf [develop](https://github.com/FBForge/fit-connect-testclient/tree/develop). Eine Alpha-Veröffentlichung mit Downloads folgt nach der technischen Erprobung.

Fehlerberichte und Vorschläge sind über die [GitHub Issues](https://github.com/FBForge/fit-connect-testclient/issues) willkommen. Bitte ausschließlich fiktive Testdaten verwenden und keine Zugangsdaten oder privaten Schlüssel veröffentlichen.
