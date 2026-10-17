# FBForge Test-Client

<img src="frontend/src/assets/test-client.png" alt="" width="80" height="80">

**Unabhängiges Testwerkzeug für FIT-Connect.**

Der **FBForge Test-Client** ist eine Desktop-Anwendung für Integrationstests mit FIT-Connect. Entwickler und Integratoren können damit Onlinedienste und Fachverfahren simulieren und Einreichungen über API v2 und v3 austauschen.

Die Anwendung arbeitet ausschließlich mit der FIT-Connect-Testumgebung. Sie ist ein unabhängiges Projekt und kein offizielles Produkt von FITKO.

Der frühere Anzeigename „FIT-Connect Test-Client“ wird ab diesem Kandidaten durch „FBForge Test-Client“ ersetzt. App-Kennung, Profilordner, interne Paketnamen und das verschlüsselte Sicherungsformat bleiben kompatibel, damit gespeicherte Profile und Upgrades weiter funktionieren.

## Funktionen

- Einreichungen mit Fachdaten und Anlagen über API v2 und v3 versenden, einschließlich Prozessadressierung bei v3.
- Dateien über einheitliche Ablageflächen per Drag-and-drop oder Dateiauswahl übernehmen: BPMN-Modelle, Kennungszuordnungen, Fachdaten, Schemata, Anlagen, private Testschlüssel und verschlüsselte Profilsicherungen. Ablegen versendet keine Nachricht.
- Leistungen und Fachdaten-Schemata aus dem Empfängerzustellpunkt auswählen und fiktive Beispieldaten erzeugen.
- Verfügbare Einreichungen eines Zustellpunkts auflisten, abrufen und lokal entschlüsseln.
- Einreichungen mit den FIT-Connect-SDKs technisch prüfen und anschließend annehmen oder ablehnen.
- JSON-/XML-Fachdaten nach dem Entschlüsseln als gegliederte, durchsuchbare Formularansicht lesen; Originalfelder, Pfade und XML-Namensräume nachvollziehen. Anlagen separat ansehen oder herunterladen. Vor dem Versand und beim Verfassen einer Antwort dieselbe lokale Vorschau nutzen. JSON zusätzlich als Baum durchsuchen und Originalquelltext lesen.
- Zustellpunkte und registrierte Testschlüssel abfragen, private Testschlüssel lokal laden.
- Event Logs nach Case-, Submission- und Reply-ID verifizieren, Ereignisse durchsuchen und ihre signierten JSON-Daten anzeigen.
- Eigene Zustellpunkte über die Destination API laden. Über v3 Name, Kontakt, Metadatenversionen und zulässige Aktiv-/Inaktiv-Wechsel einzeln oder für bis zu zehn Zustellpunkte mit Vorschau bearbeiten.
- Beim Versand einen FIT-Connect-Antwortkanal mit eigenem Antwortschema und sitzungsgebundenem Schlüssel anbieten. Verfügbare Antworten (Replies) und lokale Antwortkanäle auflisten. Replies mit dem zugehörigen temporären Schlüssel entschlüsseln, technisch prüfen, anzeigen und herunterladen.
- Auf geprüfte Einreichungen mit verschlüsselten Fachdaten und Anlagen antworten, bei v3 auch als Prozessnachricht. Der Versand erfordert eine eigene Bestätigung.

## Entwicklungsstand

Der Stand `0.1.0-dev.8` ist ein **Alpha-1-Kandidat für Windows und TEST**, noch keine freigegebene Alpha 1. Der reale Windows-TEST-Lauf [38988235240](https://github.com/FBForge/fit-connect-testclient/actions/runs/38988235240) hat v2/v3 mit JSON/XML, Anlagen, Replies nach Neustart, signierten Submission-/Case-/Reply-Logs, Annahme/Ablehnung, v3-Prozesskommunikation und Schlüsselwechsel erfolgreich geprüft. Private Checkpoints wurden dabei mit dem tatsächlichen Windows-DPAPI-Tresor gesichert.

Optionale Profile speichern Zugangsdaten, private Schlüssel, Antwortkanäle und Standard-Zustellpunkte geschützt für das Windows-Benutzerkonto. Unter „Verbindung“ lassen sich Profilname/Secret, geschützte Sicherungen, Voreinstellungen und der einzelne Schlüsselbestand verwalten. Ungewisse oder vorbereitete Schlüsselvorgänge bleiben gegen gezieltes Entfernen gesperrt. Das Entfernen eines erzeugten Paars entfernt auch seine geladenen Kopien; andere Schlüssel bleiben erhalten.

Die v3-Zustellpunktverwaltung bietet geführte Anlage, getrennte Aktivierung, Angebots-/Schema-/Prozessbearbeitung und Schlüsselwechsel für bis zu zehn eigene Ziele. Typ A verwendet lokal erzeugte Testschlüssel/Zertifikate; Typ C hat keine langlebigen Zustellpunktschlüssel. Alte Entschlüsselungsschlüssel bleiben beim Wechsel erhalten. Bereits aktivierte Zustellpunkte unterliegen der serverseitigen Aufbewahrungsfrist; eine sofortige Löschung wird nicht versprochen.

Im Bereich „Prozesse“ lassen sich lokale BPMN-Modelle öffnen und Nachrichten per Klick oder Tastatur wählen. FIT-Connect-Kennungen müssen ausdrücklich im Modell oder einer zum Modell passenden Zuordnung stehen. Empfängersuche, Übernahme in einen Versandentwurf und Prozess-Replies verwenden diese geprüfte Zuordnung. Ein Modellklick sendet nichts und führt keinen Prozess aus.

Die Formularansicht übernimmt Bezeichnungen und Erläuterungen aus verfügbaren JSON-/XSD-Schemata, zeigt Originalfelder und Herkunft und verändert keine Fachdaten. Zwei konkrete offizielle FIM-Veröffentlichungen werden zusätzlich mit fiktiven Werten geprüft; das ist keine pauschale Unterstützung jedes Fachstandards. Externe Schemaquellen erfordern Zustimmung, werden ohne FIT-Connect-Zugangsdaten geladen und sind in Umfang und Auflösung begrenzt. Nicht auflösbare oder mehrdeutige Angaben bleiben erkennbar. Ein Malwarescanner ist nicht eingerichtet und wird im Empfangsergebnis ausdrücklich als Warnung ausgewiesen.

Der abschließende Installations-/Upgrade-Ablauf wird gegen die echte Desktop-Anwendung geprüft; Zielgeräte, Screenreader/Skalierung und Herausgeber-/Signierung bleiben Freigabekriterien. macOS/Linux sind nach der [abschließenden Aufwandseinschätzung](PLATFORM_ASSESSMENT.md) ein eigener Folgeschritt. Aktuelle Nachweise und offene Punkte stehen in [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md), der vereinbarte Umfang in [ALPHA1_GOAL.md](ALPHA1_GOAL.md).

## Technische Grundlage

| Komponente | Verwendung |
| --- | --- |
| Vue und Tauri 2 | Desktop-Oberfläche |
| Java 25 | Lokaler Anwendungskern |
| FIT-Connect Java SDK 3.5.2 | API v2 |
| FIT-Connect Java SDK 4.0.0-rc.2 | API v3 |

Die SDK-Versionen werden getrennt geladen. Die Anwendung benötigt keinen separat betriebenen Backend-Server. Die Java-Laufzeit wird beim Paketieren eingebunden.

## Entwicklung unter Windows

Voraussetzungen:

- Windows x64 mit WebView2.
- Node.js ab 22.12.0 und npm.
- JDK 25. `JAVA_HOME` muss auf das JDK zeigen.
- Rust mit MSVC-Toolchain, Visual Studio C++ Build Tools und Windows SDK. Siehe [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/).

Das Projekt in einem lokalen Windows-Verzeichnis auschecken und die Befehle dort in PowerShell ausführen.

Build und automatisierte Tests:

```powershell
.\scripts\verify-windows.cmd
```

Das Skript installiert die npm-Abhängigkeiten, baut den Java-Kern und beide SDK-Adapter, führt die automatisierten Tests aus, stellt die Java-Laufzeit bereit und baut das Frontend. Es benötigt keine FIT-Connect-Zugangsdaten und stoppt beim ersten fehlgeschlagenen Schritt.

Anwendung im Entwicklungsmodus starten:

```powershell
npm run desktop:dev
```

Windows-Installer erstellen:

```powershell
npm run desktop:build -- -- --locked
```

Der Installer wird unter `desktop/target/release/bundle/nsis/` erzeugt. Er kann fehlendes WebView2 nachinstallieren. Für ein Paket mit eingebettetem WebView2-Installer:

```powershell
npm run desktop:build:offline -- -- --locked
```

## Zugangsdaten und Testschlüssel

Zugangsdaten werden im Verbindungsdialog eingegeben und nach der Übergabe aus den Eingabefeldern geleert. Ohne gespeichertes Profil gelten private Schlüssel nur für die aktuelle Sitzung. Optional schützt Windows-DPAPI Profile und private Archive; Zugangstokens werden nicht gespeichert und private Archivdokumente nicht an die Oberfläche zurückgegeben. Eine exportierte Sicherung bleibt an die Windows-Schlüssel des Benutzerkontos gebunden und ist kein frei übertragbarer Passwort-Export.

Reale Secrets gehören ausschließlich in geeignete private Speicher, für CI in GitHub-Actions-Secrets. Kein Verstecken im Repository und keine Weitergabe über Logs oder Artefakte. Native TEST-Schreibtests und deren begrenztes Aufräumen sind in [LIVE_TESTS.md](LIVE_TESTS.md) dokumentiert. Für v3-Replies muss der eigene Absenderzustellpunkt eine vom Client unterstützte Metadatenversion anbieten; Prozessantworten benötigen Version 3.0.0.

## Mitwirken

Fehlerberichte und Beiträge sind willkommen. Hinweise für Änderungen und Tests stehen in [CONTRIBUTING.md](CONTRIBUTING.md). Zugangsdaten, private Schlüssel und echte Einreichungsdaten gehören nicht in Issues oder Testdateien.

## Lizenz

[EUPL-1.2](LICENSE). Abhängigkeiten behalten ihre jeweiligen Lizenzen.

Der Branch `alpha1-work` enthält den dev.8-Kandidaten mit geschützten Profilen/Backups, Zustellpunktanlage und Schlüsselwechsel, BPMN-Nachrichtenauswahl sowie Prozesskommunikation. Noch keine Alpha-1-Freigabe. Offene Abnahmen und aktuelle Einschränkungen stehen in [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md), der Technik-/Sicherheitsprüfung in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
