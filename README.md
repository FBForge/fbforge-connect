# FIT-Connect Testclient

Der **FIT-Connect Testclient** von **FBForge** ist eine Desktop-Anwendung für Integrationstests mit FIT-Connect. Entwickler und Integratoren können damit Onlinedienste und Fachverfahren simulieren und Einreichungen über die FIT-Connect-Testumgebung austauschen.

Das Projekt ist unabhängig von FITKO und unterstützt ausschließlich die Testumgebung.

## Entwicklungsstand

Wir arbeiten an der ersten Alpha. Der Funktionsumfang wird schrittweise erweitert und gegen die FIT-Connect-Testumgebung erprobt. Ein erster Versand über API v2 wurde erfolgreich getestet. Für API v3 und weitere Abläufe laufen noch Fehlerbehebung und Integrationstests.

Dieser Branch enthält die öffentliche Projektübersicht. Der Anwendungscode soll nach Abschluss der Veröffentlichungsprüfung auf `develop` bereitgestellt werden. Dort wird anschließend der aktuelle Entwicklungsstand gepflegt. Eine veröffentlichte Alpha und ausführbare Downloads stehen noch nicht bereit.

## Ziel der Alpha

Die erste Alpha konzentriert sich auf den Austausch von Einreichungen über API v2 und v3: Senden mit Fachdaten und Anlagen, Abrufen, lokales Entschlüsseln und Prüfen sowie Annehmen und Ablehnen.

Ein gemeinsamer Verbindungsbereich verwaltet die Zugangsdaten für die laufende Sitzung. Die technische Diagnose soll API-Aufrufe, Prüfergebnisse und Fehler nachvollziehbar machen. Der FIT-Connect Event Log ergänzt diese lokale Sicht um die Ereignisse einer Einreichung.

Antworten, Prozessnachrichten, interaktive BPMN-Darstellungen und die Zustellpunktverwaltung einschließlich Sammelbearbeitung werden schrittweise ergänzt.

## Technische Grundlage

Die Oberfläche basiert auf Vue und Tauri. Ein lokaler Java-Kern bindet die FIT-Connect-Java-SDKs über getrennte Adapter für API v2 und v3 ein.

Windows ist die erste Zielplattform. Die Java-Laufzeit soll mit der Anwendung ausgeliefert werden. Ein separat betriebener Backend-Server ist nicht erforderlich.

Zugangsdaten werden vom Benutzer eingegeben und standardmäßig nicht dauerhaft gespeichert. Private Schlüssel werden lokal verarbeitet. Für registrierte Zustellpunktschlüssel werden passende selbstsignierte Testzertifikate geprüft.

## Mitwirken

Fehlerberichte, Anwendungsfälle und Verbesserungsvorschläge sind über die [GitHub Issues](https://github.com/FBForge/fit-connect-testclient/issues) willkommen.

Bitte keine Zugangsdaten, privaten Schlüssel oder echten Einreichungsdaten veröffentlichen. Build- und Installationsanleitungen folgen mit dem Anwendungscode.

## Lizenz

Die veröffentlichten Dokumentationstexte stehen unter [EUPL-1.2](LICENSE). Für den Anwendungscode ist dieselbe Lizenz vorgesehen. Die Rechte an übernommenen Komponenten werden vor dessen Veröffentlichung geklärt. Abhängigkeiten behalten ihre jeweiligen Lizenzen.
