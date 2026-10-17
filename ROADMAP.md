# FBForge Connect: Roadmap

Stand: 17. Oktober 2026. Aktueller Entwicklungsstand: **0.1.0-dev.8, Alpha-1-Kandidat für Windows und FIT-Connect TEST**. Der freigegebene [Arbeitsplan](ALPHA1_GOAL.md) definiert den Umfang; [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md) nennt konkrete Prüfläufe und offene Freigabepunkte.

## Für Alpha 1 umgesetzt

- Normale Einreichungen und Replies über v2/v3 mit JSON/XML, Anlagen, gesonderter Prüfung und bestätigter Annahme oder Ablehnung. Kein automatischer Neuversand bei ungewissem Ausgang.
- Signierte Ereignisse über Case-, Submission- und Reply-ID, mit nachvollziehbarer Zuordnung und vollständiger Seitenprüfung.
- Optionale Windows-DPAPI-Profile für Zugangsdaten, private Schlüssel, Antwortkanäle und Standard-Zustellpunkte. Geschützte Sicherungen und einzelne Schlüssel verwalten; Zugangstokens werden nicht gespeichert.
- Eigene v3-TEST-Zustellpunkte anlegen, Schlüssel/Testzertifikate erzeugen, geschützt sichern und öffentliche Teile registrieren. Aktivierung separat bestätigen; Angebote und Schlüsselwechsel bis zehn Ziele mit Ergebnissen je Ziel verwalten. Keine atomare Bulk-Transaktion behaupten.
- BPMN lokal öffnen, Nachrichten durch Klick oder Tastatur wählen und ausdrückliche beziehungsweise prüfsummengebundene FIT-Connect-Kennungen übernehmen. Passende Ziele finden und v3-Prozess-Submission/-Reply vorbereiten. Ein Modellklick versendet nichts.
- JSON-/XML-Fachdaten mit verfügbaren Schema-Beschriftungen und Feldherkunft lesen, Anlagen separat ansehen; fiktive Beispiele und ein lokaler Demo-Prozess. Keine erfundene Semantik bei unvollständigen Schemata.
- Einheitliche Dateiablage per Drag-and-drop und Tastatur-Dateiauswahl für sämtliche Importe. Feste Desktop-Hülle, Hell/Dunkel, konkrete Hilfen, fokussierbare Dialoge und automatisierte Barrierefreiheits-/Reflow-Prüfungen.
- Produktname und eigene Bildmarke **FBForge Connect**; ältere interne Speicher- und Upgrade-Kennungen bleiben kompatibel.

Die vollständige reale Windows-TEST-Abnahme hat sieben Austauschfälle einschließlich Neustart, Fragmentierung, Quittierungen, Prozesskommunikation und Rotation bestanden; siehe [LIVE_TESTS.md](LIVE_TESTS.md). Diese Nachweise ersetzen weder die eigentliche Desktop-Installation noch die Freigabeentscheidung.

## Vor der Alpha-Veröffentlichung

1. Das abschließende Paket mit Prüfsummen und Build-Manifest bereitstellen. Neuinstallation, native SDK-Diagnose, geschütztes Testprofil, dev.7-Upgrade und profilwahrende Deinstallation wurden erfolgreich geprüft; siehe [INSTALLATION_TESTS.md](INSTALLATION_TESTS.md).
2. Tastatur/Screenreader, Windows-Skalierung und gegebenenfalls Behördenproxy/Endpoint-Schutz auf realen Zielgeräten prüfen. Automatisierte Browserprüfungen werden nicht als vollständige WCAG-Konformität ausgegeben.
3. Herausgeber-/Signierung und Verteilung klären. Aktuelle Kandidaten sind ausdrücklich unsigniert. Release Notes, Prüfsummen und bekannte Grenzen auf den tatsächlich geprüften Build beziehen.

Windows ist der vorläufige Plattformumfang. Die gewünschte [macOS-/Linux-Aufwandsprüfung](PLATFORM_ASSESSMENT.md) ergab zusätzliche sichere Speicherintegration, plattformspezifische Pakete und eigene Abnahmen; das ist kein kleiner Zusatz vor Alpha 1.

## Nach Alpha-Rückmeldungen: Richtung Beta

- Mehr konkrete FIM-/XÖV-Schemata und belegte Codelistenprofile; schemaabhängiger Eingabeeditor als eigener Schritt.
- Wiederverwendbare Testszenarien und Ergebnisvergleiche ohne gespeicherte Geheimnisse in Vorlagen.
- Größere Daten-/Anlagenbestände und weitere angebotene Prozessmuster anhand realer Nutzung verbessern.
- Gezielte UX-, Barrierefreiheits- und Diagnoseverbesserungen aus Entwickler- und Behördenfeedback.
- macOS/Linux mit sicherem nativem Speicher und tatsächlich geprüfter Paketierung separat angehen.

PROD, Routing-Debugger, ZBP-Anbindung, Lasttests sowie vollständiger BPMN-Editor/Prozessmotor bleiben außerhalb dieses Goals. Direkte FIT-Connect-Dokumentationslinks gehören nicht in die Produktoberfläche. Wartbarkeit, nachvollziehbare Schnittstellen, passende Tests und einfache Bedienung gelten für jedes Paket.

## Repository und Mitarbeit

Der Kandidat liegt auf `alpha1-work`, der letzte zusammengeführte Entwicklungsstand auf `develop`. Hinweise stehen in [CONTRIBUTING.md](CONTRIBUTING.md), technische Grenzen in [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Fehlerberichte verwenden ausschließlich fiktive Daten; keine Zugangsdaten oder privaten Schlüssel in Issues.
