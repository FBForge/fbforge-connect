# Versionshinweise

## 0.1.0-alpha.1.rc.1

Prüfkandidat für Alpha 1. Noch keine endgültige Alpha-Freigabe.

- Einheitliche Sie-Anrede in Oberfläche, Hinweisen, Hilfe und Dokumentation.
- Verständlichere Hinweise zum Verbinden und Senden; Anleitung an die tatsächlichen Bedienelemente angepasst.
- Bebilderte Anleitung im GitHub-Wiki und offline in der Anwendung.

## 0.1.0-dev.9

Entwicklungsbau für Windows x64 und FIT-Connect TEST. Noch keine Alpha-1-Freigabe; der Installer ist unsigniert.

- Vorgangsübersicht für gesendete und empfangene Einreichungen und Antworten, mit Suche, Formularansicht, Anlagen und Löschfunktion.
- Optionale geschützte Windows-Aufbewahrung, getrennt von Profilen und Schlüsseln. Inhalte bleiben nach Annahme oder Ablehnung lokal lesbar.
- Einreichungen direkt öffnen und prüfen; Empfangsbestätigungen und Antworten separat bestätigen.
- Lokale PDF-Vorschau mit Seitenwahl und auslesbarem Text, ohne aktive Dokumentfunktionen.
- Offline-Hilfe mit zwölf Themen und neun vergrößerbaren Bildschirmaufnahmen.

Der [Windows-Prüfbau](https://github.com/FBForge/fbforge-connect/actions/runs/39063273538/artifacts/12112642005) enthält Setup, SHA-256-Prüfsumme und Build-Manifest. Der [zugehörige Prüflauf](https://github.com/FBForge/fbforge-connect/actions/runs/39063273538) umfasst Neuinstallation, Upgrade von dev.7, Profil-Erhalt, beide SDKs und ausgewählte NVDA-Kontrollen. [Sieben reale TEST-Austausche](https://github.com/FBForge/fbforge-connect/actions/runs/39061438414) prüfen das Austauschprotokoll auf dem vorherigen Funktionsstand; spätere lokale Speicher- und Bedienkorrekturen sind im Paketlauf geprüft. Eine vollständige manuelle Zielgeräteabnahme bleibt erforderlich.

## Vorherige Entwicklungsstände

Einreichungen und Replies über v2/v3, signierte Ereignissuche, geschützte Profile und Schlüssel, v3-Zustellpunktverwaltung und BPMN-Nachrichtenauswahl bilden den bisherigen Funktionsumfang. Die v3-Prozesssuche verwendet die bestehende Anmeldung entsprechend der aktuellen TEST-API-Anforderung.

Die Anwendung heißt seit dev.8 **FBForge Connect**. Technische App-Kennung, Profilformat und Upgrade-Registrierung bleiben kompatibel. Profilsicherungen sind an das zugehörige Windows-Benutzerkonto gebunden.

## Grenzen

Derzeit ausschließlich Windows und TEST. Kein integrierter Malwarescanner, universeller Formulareditor oder Prozessmotor. Ungewisse Schreibausgänge werden nicht automatisch wiederholt. Geschützte Vorgangskopien sind kein revisionssicheres Archiv. Hinweise zum Umgang mit Testdaten stehen in [SECURITY.md](SECURITY.md).
