# FBForge Connect

> **Hinweis:** FBForge Connect ist für Entwicklungs-, Test- und Integrationszwecke vorgesehen.

<img src="frontend/src/assets/test-client.png" alt="" width="80" height="80">

Open-Source-Desktop-Client für FIT-Connect. Kein offizielles Produkt der FITKO.
Die aktuelle Veröffentlichung ist **[0.3.0](https://github.com/FBForge/fbforge-connect/releases/tag/v0.3.0)**.
Dieser Branch bereitet **0.4.0, noch nicht veröffentlicht** vor.

Neu sind geführte Integrationstests mit externen Gegenstellen, Tests aus Vorgängen,
variable Testdaten, Testserien für API v2/v3 und mehrere fachliche Antworten im selben
Vorgang. Konkrete Unterschiede bleiben mit dem Prüfverlauf gespeichert.
Einzelheiten stehen in den [Versionshinweisen](RELEASE_NOTES.md).

- Einreichungen und Antworten über API v2/v3 senden, empfangen und prüfen.
- JSON/XML und Anlagen ansehen, Nachrichten gesammelt herunterladen und annehmen.
- Profile und Schlüssel geschützt speichern. Vorgänge gespeicherter Profile bleiben standardmäßig dauerhaft erhalten.
- Event Logs prüfen, v3-Destinations verwalten und BPMN-Nachrichten auswählen.
- Tests an einer Stelle vorbereiten, durchführen und auswerten, mit Profilzuordnung und gespeichertem Fortschritt.
- Eigene JSON-Antwortschemas erstellen, Schemata und erwartete Inhalte vergleichen.
- Optional lokal mit ClamAV oder einer eigenen ClamAV-/ICAP-Gegenstelle scannen.
- Bei Bedarf einen HTTP-Proxy unter „Einstellungen → Netzwerk und Proxy“ einrichten.
- Neue stabile Versionen finden und signierte Updates nach Bestätigung installieren.

Für **Windows x64 und FIT-Connect TEST, STAGE und PROD**. STAGE und PROD benötigen
V-PKI-Zertifikate mit vollständiger Kette. PROD-Aktionen wirken auf echte Daten
und werden zusätzlich bestätigt. Verwenden Sie für Tests fiktive Daten.

## Installation

1. Signiertes Windows-Setup unter [Releases](https://github.com/FBForge/fbforge-connect/releases) installieren. Java wird mitgeliefert.
2. Umgebung wählen und mit passenden Zugangsdaten verbinden.
3. Einreichungen senden oder abrufen und prüfen.

Die [0.3-Anleitung](https://fbforge.de/connect/hilfe/0.3/start) erklärt die aktuelle
Version. [Ältere Anleitungen](https://fbforge.de/connect/hilfe) bleiben verfügbar.
Ihre Quelle liegt unter [docs/guide/](docs/guide/).

[Versionshinweise](RELEASE_NOTES.md) · [Lokal bauen](BUILDING.md) ·
[Mitwirken](CONTRIBUTING.md) · [Issues](https://github.com/FBForge/fbforge-connect/issues) ·
[Sicherheit](SECURITY.md) · [Weitere Planung](ROADMAP.md)

## Lizenz

[EUPL-1.2](LICENSE). Siehe auch [Drittanbieter-Lizenzen](THIRD_PARTY_NOTICES.md).
