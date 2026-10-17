# FBForge Connect

<img src="assets/brand/connect.png" alt="" width="72" height="72">

**Integrationstests für FIT-Connect.**

FBForge Connect ist ein unabhängiges Open-Source-Testwerkzeug von FBForge für öffentliche Verwaltungen, Integratoren und Entwickler. Die Desktop-Anwendung simuliert Onlinedienste und Fachverfahren: Einreichungen senden, empfangen, prüfen und beantworten.

Ausschließlich **FIT-Connect TEST und fiktive Daten**. Kein offizielles Produkt von FITKO.

## Entwicklungsstand

Der aktuelle Stand ist ein **Alpha-1-Kandidat für Windows x64**, noch keine freigegebene Alpha 1. Normale Einreichungen und Replies über v2/v3, signierte Ereignisse, Neustart mit geschützten Schlüsseln, Zustellpunktanlage, Rotation und v3-Prozesskommunikation wurden real gegen TEST geprüft. Die echte Windows-Neuinstallation und das Upgrade von dev.7 einschließlich Profil-Erhalt sind ebenfalls erfolgreich getestet.

Der Kandidat ist **unsigniert**; das bestellte Certum-Zertifikat steht noch aus. Zusätzliche Screenreader- und Skalierungsprüfungen werden vor der Freigabe dokumentiert. Es wird keine BSI- oder vollständige WCAG-Konformität behauptet.

- [Alpha-1-Kandidat und aktuelle Nachweise](https://github.com/FBForge/fbforge-connect/blob/alpha1-work/ALPHA1_PROGRESS.md)
- [Anwendungscode im Kandidatenzweig](https://github.com/FBForge/fbforge-connect/tree/alpha1-work)
- [Zusammengeführter Entwicklungsstand](https://github.com/FBForge/fbforge-connect/tree/develop)
- [Geprüfter unsignierter Windows-Kandidat](https://github.com/FBForge/fbforge-connect/actions/runs/39038478823/artifacts/12103363136)

`main` enthält die öffentliche Projektübersicht. Quellcode, Build-Anleitung und vollständige Entwicklungsdokumentation liegen in den verlinkten Entwicklungszweigen.

## Funktionen im Alpha-Kandidaten

- Anträge und Antworten über API v2/v3 mit JSON/XML und Anlagen austauschen; technische Prüfung und bestätigte Annahme/Ablehnung getrennt ausführen.
- Ereignisse anhand von Case-, Submission- und Reply-ID verifizieren und nachvollziehen.
- Zugangsdaten, private Schlüssel und Antwortkanäle optional mit Windows-DPAPI schützen; Profile, Voreinstellungen und geschützte Sicherungen verwalten.
- Eigene v3-TEST-Zustellpunkte anlegen, Testschlüssel erzeugen, öffentliche Registrierung prüfen und Schlüssel beziehungsweise Angebote für bis zu zehn Ziele bearbeiten.
- BPMN-Nachrichten per Diagrammklick oder Tastatur wählen, ausdrückliche FIT-Connect-Kennungen übernehmen und passende Prozess-Empfänger suchen.
- Fachdaten mit Schema-Beschriftungen und Feldherkunft lesen; alle Dateiimporte per Drag-and-drop oder Dateiauswahl übernehmen.

Die Anwendung führt keinen vollständigen BPMN-Prozess aus und unterstützt keine Produktivumgebung. macOS/Linux sind nach der Aufwandseinschätzung eigene Folgeschritte.

## Einstieg und Mitwirkung

[Kurzanleitung](https://github.com/FBForge/fbforge-connect/blob/alpha1-work/BEDIENUNG.md) · [Build und Entwicklung](https://github.com/FBForge/fbforge-connect/blob/alpha1-work/README.md) · [Mitwirken](https://github.com/FBForge/fbforge-connect/blob/alpha1-work/CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

Normale Fehler und Vorschläge: [GitHub Issues](https://github.com/FBForge/fbforge-connect/issues). Sicherheitslücken bitte privat gemäß [SECURITY.md](SECURITY.md) melden. Keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten veröffentlichen.

## Lizenz

[EUPL-1.2](LICENSE). Abhängigkeiten behalten ihre jeweiligen Lizenzen.
