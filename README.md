# FBForge Connect

> **Hinweis:** FBForge Connect ist für Entwicklungs-, Test- und Integrationszwecke vorgesehen.

<img src="frontend/src/assets/test-client.png" alt="" width="80" height="80">

Open-Source-Desktop-Client für FIT-Connect. Kein offizielles Produkt der FITKO.

- Einreichungen und Antworten über API v2/v3 senden, empfangen und prüfen.
- JSON/XML und Anlagen ansehen, Nachrichten gesammelt herunterladen und annehmen.
- Vorgänge, Profile und Schlüssel optional mit Windows-DPAPI speichern.
- Event Logs prüfen, v3-Destinations verwalten und BPMN-Nachrichten auswählen.
- Testfälle wiederverwenden und Schemaänderungen vergleichen.

Für **Windows x64 und FIT-Connect TEST, STAGE und PROD**. STAGE und PROD benötigen
V-PKI-Zertifikate mit vollständiger Kette. PROD-Aktionen wirken auf echte Daten
und werden zusätzlich bestätigt. Verwenden Sie für Tests fiktive Daten.

## Installation

1. Signiertes Windows-Setup unter [Releases](https://github.com/FBForge/fbforge-connect/releases) installieren. Java wird mitgeliefert.
2. Umgebung wählen und mit passenden Zugangsdaten verbinden.
3. Einreichungen senden oder abrufen und prüfen.

Integrierte Updates sind für 0.3.0 in Entwicklung und noch nicht veröffentlicht.
Details stehen in der [Roadmap](ROADMAP.md).

[Anleitung mit Bildern](https://fbforge.de/connect/hilfe/0.2/start) ·
[Versionshinweise](RELEASE_NOTES.md) · [Lokal bauen](BUILDING.md) ·
[Mitwirken](CONTRIBUTING.md) · [Issues](https://github.com/FBForge/fbforge-connect/issues) ·
[Sicherheit](SECURITY.md)

## Lizenz

[EUPL-1.2](LICENSE). Siehe auch [Drittanbieter-Lizenzen](THIRD_PARTY_NOTICES.md).
