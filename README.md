# FBForge Connect

<img src="frontend/src/assets/test-client.png" alt="" width="80" height="80">

Desktop-Client für FIT-Connect. Für Entwickler, Integratoren und Mitarbeiter der öffentlichen Verwaltung.

- Einreichungen und Antworten über API v2/v3 senden, empfangen und prüfen.
- JSON/XML lesen, Nachrichten gesammelt herunterladen und geprüfte Einreichungen gemeinsam annehmen.
- Anlagen ansehen und Vorgänge lokal aufbewahren.
- Event Logs durchsuchen, eigene v3-Destinations verwalten und BPMN-Nachrichten auswählen.
- Zugänge und Schlüssel optional mit Windows-DPAPI speichern.
- Testfälle als Paket wiederverwenden und Schemaänderungen lokal vergleichen.

Für **Windows x64 und FIT-Connect TEST, STAGE und PROD**. Kein offizielles Produkt der FITKO. Für Tests verwenden Sie fiktive Daten. In PROD werden Nachrichten tatsächlich zugestellt.

## Installation

1. Das signierte Windows-Setup unter [Releases](https://github.com/FBForge/fbforge-connect/releases) herunterladen und installieren.
2. FBForge Connect starten, die Umgebung wählen und mit passenden Zugangsdaten verbinden.
3. Einen Testantrag senden oder eine Einreichung empfangen und prüfen.

Die Pakete werden mit digitaler Signatur, Zeitstempel und SHA-256-Prüfsumme bereitgestellt. Java wird mitgeliefert.

STAGE und PROD benötigen gültige V-PKI-Zertifikate mit vollständiger Zertifikatskette. PROD-Schreibaktionen werden zusätzlich bestätigt. Die veröffentlichte Version 0.1 bleibt auf TEST beschränkt.

Die [Anleitung mit Bildern und Beispielen](https://fbforge.de/connect/hilfe/0.2/start) wird auf der Website gepflegt. In der Anwendung finden Sie Hinweise und Links zum passenden Kapitel.

[Versionshinweise](RELEASE_NOTES.md) · [Roadmap](ROADMAP.md) · [Lokal bauen](BUILDING.md) · [Mitwirken](CONTRIBUTING.md) · [Issues](https://github.com/FBForge/fbforge-connect/issues) · [Sicherheit](SECURITY.md)

## Lizenz

[EUPL-1.2](LICENSE). Siehe auch [Drittanbieter-Lizenzen](THIRD_PARTY_NOTICES.md).
