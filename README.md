# FIT-Connect Testclient

Ein unabhängiges Open-Source-Projekt von **FBForge** für FIT-Connect-Integrationstests.

Der geplante Desktop-Client simuliert Onlinedienste und Fachverfahren: Einreichungen senden, empfangen, entschlüsseln und prüfen – ausschließlich auf der FIT-Connect-Testumgebung.

## Stand: In Entwicklung

Dieses Repository startet mit Projektbeschreibung und Roadmap. Anwendungscode und ausführbare Downloads sind noch nicht veröffentlicht. Die Freigabe übernommener Komponenten wird vor der Codeveröffentlichung geprüft.

Die technische Grundlage mit getrennten Java-SDK-Adaptern für API v2 und v3, lokaler TEST-Sitzungsverwaltung und Zertifikatsprüfung ist im bisherigen Entwicklungsstand implementiert und offline geprüft. Ein vollständiger Sende- und Empfangstest ist damit noch nicht nachgewiesen.

Den Fortschritt und die noch offenen Arbeiten dokumentiert die [Roadmap](ROADMAP.md).

## Ziel der ersten Beta

- Einreichungen mit Fachdaten und Anlagen über API v2 und v3 senden.
- Einreichungen suchen, abrufen, lokal entschlüsseln und mit nachvollziehbarem Prüfbericht verifizieren.
- Einreichungen nach Bestätigung annehmen oder ablehnen.
- Antworten und Prozessnachrichten im jeweiligen API-Funktionsumfang unterstützen.
- BPMN-Prozesse anzeigen und passende Nachrichtenaktionen vorbereiten.
- Technische Aktivitäten, Fehler und den FIT-Connect-Event-Log übersichtlich darstellen.

Die Anwendung soll kompakt bleiben. Eine vollständige Zustellpunktverwaltung oder ein allgemeines Administrationsportal ist nicht vorgesehen.

## Geplante technische Grundlage

- Windows-Desktop-Anwendung mit Tauri und Vue.
- Lokaler Java-Kern mit den FIT-Connect-Java-SDKs.
- Mitgelieferte Java-Laufzeit, kein separat betriebener Backend-Server.
- Zugangsdaten werden vom Benutzer eingegeben und standardmäßig nicht dauerhaft gespeichert.
- Private Schlüssel werden lokal verarbeitet. Für registrierte Zustellpunktschlüssel sind passende selbstsignierte Testzertifikate vorgesehen.
- Keine Unterstützung für die Produktivumgebung.

Ein selbstsigniertes Zertifikat allein beweist keine ausschließliche Testverwendung. Die Schlüsselprüfung und die feste Bindung an die Testumgebung werden gemeinsam umgesetzt.

## Mitwirken

Anwendungsfälle, Feedback zur Roadmap und Vorschläge sind über die GitHub-Issues willkommen. Bitte keine Zugangsdaten, privaten Schlüssel oder echten Einreichungsdaten veröffentlichen.

Build- und Installationsanleitungen folgen mit der Veröffentlichung des Anwendungscodes. Die erste Beta wird als Vorabversion gekennzeichnet.

## Lizenz und Unabhängigkeit

Die hier veröffentlichten Dokumentationstexte stehen unter [EUPL-1.2](LICENSE). Für den später veröffentlichten Anwendungscode ist ebenfalls EUPL-1.2 vorgesehen. Rechte an übernommenen Komponenten und deren Lizenzhinweise werden vor der Veröffentlichung geklärt.

Dies ist ein unabhängiges Projekt von FBForge und kein offizielles Produkt von FITKO oder FIT-Connect.
