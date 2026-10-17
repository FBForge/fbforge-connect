# Mitwirken

FBForge Connect ist eine Windows-Desktop-Anwendung für Integrationstests auf TEST. Vor Änderungen bitte die [Architektur](ARCHITECTURE.md) lesen. Ausschließlich fiktive Testdaten verwenden.

## Lokal starten und prüfen

Benötigt werden Node.js ab 22.13.0, JDK 25 und die im Desktop-Verzeichnis festgelegte Rust-Version. Windows benötigt außerdem die Tauri-Buildvoraussetzungen. Unter Windows werden WebView2, die MSVC-Toolchain, Visual Studio C++ Build Tools und das Windows SDK benötigt; siehe die [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci --ignore-scripts
cd engine
./mvnw verify
cd ..
npm run lint
npm run format:check
npm test
npm run build:frontend
npm run stage:engine
npm run test:engine
cargo fmt --manifest-path desktop/Cargo.toml --all -- --check
cargo test --manifest-path desktop/native-contracts/Cargo.toml --locked
```

Unter Windows kann `engine/mvnw.cmd` verwendet werden. Einige Java-Tests starten lokale HTTP-Server und benötigen dafür eine erlaubte Loopback-Verbindung. Die isolierten Rust-Verträge und Speichertests benötigen keine WebView. Der vollständige Desktop-Test nach dem Staging lautet `cargo test --manifest-path desktop/Cargo.toml --locked`.

## Windows-Anwendung bauen

In einem lokalen Windows-Verzeichnis aus PowerShell ausführen. `JAVA_HOME` muss auf das JDK 25 zeigen.

```powershell
.\scripts\verify-windows.cmd
npm run desktop:dev
```

Das Prüfsystem installiert die npm-Abhängigkeiten, baut und testet die Java-Adapter, stellt die Java-Laufzeit bereit und baut das Frontend. Es benötigt keine FIT-Connect-Zugänge. Der zweite Befehl startet die Anwendung im Entwicklungsmodus.

Den Installer mit `npm run desktop:build -- -- --locked` erstellen. Er liegt unter `desktop/target/release/bundle/nsis/` und kann fehlendes WebView2 nachinstallieren. `npm run desktop:build:offline -- -- --locked` erzeugt das größere Paket mit eingebettetem WebView2-Installer.

## Branches

`main` enthält den zusammengeführten Projektstand, `develop` die laufende Entwicklung. Neue Beiträge verwenden kurze Feature-Branches und Pull Requests nach `develop`. Ein Merge ist keine Release-Freigabe; Veröffentlichungen erhalten einen gesondert geprüften Versionsstand.

## Anwendungshilfe und GitHub-Wiki

Hilfetexte werden ausschließlich in `frontend/src/help/topics.js` gepflegt. Die zugehörigen Bildschirmaufnahmen liegen unter `frontend/src/help/screenshots/` und dürfen nur fiktive Daten zeigen. Die Anwendung bündelt diese Quellen für die Offline-Hilfe; das Wiki verwendet dieselben Inhalte.

Mit `node scripts/export-wiki.mjs <neues-Ausgabeverzeichnis>` werden die zwölf Hilfethemen, Startseite, Seitennavigation und Bilder für das Wiki erzeugt. Der Export benötigt keine Zugangsdaten, führt keine Netzwerkanfragen aus und überschreibt kein vorhandenes Verzeichnis.

Zur Veröffentlichung zuerst das vorhandene Wiki mit `git clone https://github.com/FBForge/fbforge-connect.wiki.git` separat auschecken. GitHub benötigt gegebenenfalls einmalig eine im Web angelegte erste Wiki-Seite. Den Export in ein anderes, neues Verzeichnis erzeugen, die Seiten sowie `images/` in den Wiki-Checkout übernehmen und den Diff prüfen. Andere, manuell gepflegte Wiki-Seiten erhalten. Anschließend die Wiki-Änderung committen und regulär pushen. Bei umbenannten Hilfethemen alte generierte Seiten gezielt entfernen und eingehende Links prüfen. Texte oder Bilder nicht unabhängig im Wiki bearbeiten, da der nächste Export sie ersetzt.

## Änderungen vorbereiten

- Module nach fachlicher Verantwortung schneiden. UI, native Berechtigungen und SDK-Anpassungen haben unterschiedliche Aufgaben.
- Gemeinsame Logik bündeln; tatsächliche SDK-Unterschiede in ihren Adaptern kapseln. Keine Abstraktionen für nur vermutete spätere Anforderungen einführen.
- Öffentliche Verträge und relevante Invarianten erklären. Kommentare sollen insbesondere Gründe und Sicherheitsgrenzen erklären.
- Verhaltensänderungen mit einem aussagekräftigen Test absichern. Kosmetische Änderungen brauchen keinen Test, der nur den Quelltext nachbildet.
- Vollständige Anwenderaufgaben prüfen: klare Sprache, Tastaturbedienung, Fokus und Fehlerhilfe. Eine Erklärung darf nicht ausschließlich bei Maus-Hover erreichbar sein.
- Oberfläche, Hilfe und Dokumentation verwenden die Sie-Anrede und kurze, sachliche Erklärungen. Der Bezug zur Organisation lautet „der FITKO“; FBForge Connect bleibt als unabhängiges Projekt erkennbar.
- Keine Zugangsdaten, privaten Schlüssel, Nutzdaten oder vollständigen SDK-Fehlertexte in Logs, Screenshots, Issues oder Testartefakte übernehmen.
- Änderungen und Prüfergebnisse im Pull Request verständlich beschreiben. Bekannte Einschränkungen und noch ausstehende Live-Prüfungen ausdrücklich nennen.

Neue Schreibaktionen brauchen eine native Vorschau-/Bestätigungsgrenze und Tests für Abbruch, falschen Kontext und einen ungewissen Übertragungsausgang. Neue Renderer-Befehle müssen in Rust, Java und den Tauri-Berechtigungen zusammenpassen. Private Archivbefehle dürfen niemals zu Renderer-Befehlen werden.

## Projektregeln und Lizenz

Die vorhandenen SDKs übernehmen Kryptografie und FIT-Connect-Protokollverarbeitung. API v2 und v3 werden ausdrücklich getrennt geprüft. Produktionsumgebungen, eingebettete Zugangsdaten und automatische Annahme/Ablehnung gehören nicht in dieses Projekt. Farben, Schriften, Bedienelemente und Statusdarstellung kommen aus `frontend/src/site.css`; zusätzliche Styles beschreiben vor allem das Layout.

Mit einem Beitrag bestätigen Sie die Berechtigung, ihn unter der EUPL-1.2 dieses Projekts einzureichen. Bestehende Urheberrechts- und Lizenzhinweise bleiben erhalten. Sicherheitsprobleme bitte privat gemäß [SECURITY.md](SECURITY.md) melden. Größere Beiträge externer Mitwirkender sollten vorab in einem Issue abgestimmt werden.

Formatierung: `npm run format`, im Engine-Verzeichnis `./mvnw spotless:apply`, für Rust `cargo fmt --manifest-path desktop/Cargo.toml --all`. Die Compiler-Modulfreigaben in `engine/.mvn/jvm.config` gelten nur für den Build-Formatter, nicht für die ausgelieferte Laufzeit.

## Öffentliche Schema-Integrationstests

Die normalen lokalen Tests benötigen keine Zugangsdaten. Für die zusätzlichen FIM-Beispiele einmal `node scripts/fetch-public-schemas.mjs` ausführen und anschließend `npm run test:ui` starten. Unveränderliche URLs und SHA-256 stehen in `tests/public-schemas/manifest.json`. Mit `--offline` wird nur ein vollständig vorhandener, korrekt gehashter Cache akzeptiert; ohne Cache wird dieser externe Integrationstest übersprungen. Die Fremddateien bleiben im ignorierten Testcache und werden nicht mit der Anwendung verteilt. Die Beispiele prüfen die Darstellung zweier konkreter Veröffentlichungen und belegen keine vollständige FIM-/XÖV-Unterstützung.

## Reale TEST-Austausche

`live-exchange.yml` startet ausschließlich manuell auf `main` oder `develop` mit ausdrücklich aktivierter Eingabe `confirm_test_writes`. Es erzeugt fiktive Einreichungen, Antworten und einen eigenen temporären Zustellpunkt. Benötigt werden die Actions-Secrets `SENDERID`, `SENDERSECRET`, `SENDERDEST`, `SUBSCRIBERID` und `SUBSCRIBERSECRET`; Werte gehören niemals in Quelldateien, Logs oder Artefakte. PR-Prüfungen erhalten keine Live-Zugänge.

Der Sender benötigt einen bestehenden aktiven Typ-C-Zustellpunkt und Verwaltungsrechte für dessen Metadatenangebote. Der Test ergänzt nach vorherigem Lesen ausschließlich fehlende Versionen `2.0.0`/`3.0.0`. Der Subscriber benötigt Rechte zur Zustellpunktverwaltung und zum Empfang. Geprüft werden v2/v3, JSON/XML, Anlagen, Fragmentierung, Replies nach Neustart, Prozesskommunikation, signierte Ereignisse, Annahme/Ablehnung, lokale Vorgangskopien und Schlüsselrotation. Private Schlüssel werden vor Registrierung beziehungsweise Reply-Angebot mit dem produktiven Windows-DPAPI-Speicher gesichert. Ungewisse Schreiboperationen werden nicht automatisch wiederholt.

Aufräumen betrifft nur den im Lauf erstellten Zustellpunkt nach erneutem Eigentums-/Zustandsabgleich. Nach Aktivierung erzwingt die API eine Aufbewahrungsfrist: Der Test deaktiviert ihn und nennt ID sowie `canBeDecommissionedAt` im Laufprotokoll. Spätere Löschung erfordert einen erneuten Abgleich; keine pauschale Löschung nach Namenspräfix. Vorhandene konfigurierte Zustellpunkte bleiben erhalten.

## Pakete prüfen und veröffentlichen

Der Windows-Workflow baut die tatsächliche Anwendung und prüft Neuinstallation, Upgrade, erhaltene Profile, beide gebündelten SDKs und ausgewählte echte NVDA-Sprachsequenzen. Das Setup-Artefakt enthält `SHA256SUMS.txt` und `build-info.json`. Quelle, Version, Lauf-ID und Installerhash müssen zusammenpassen. Browser-Reflow, Axe und der automatisierte Screenreader-Test ersetzen keine vollständige manuelle Bedienungs-, Audio- oder Monitor-DPI-Abnahme.

Vor einer Veröffentlichung den endgültigen Installer auf einem Windows-Zielgerät prüfen: Senden/Empfangen mit Anlagen, Replies, Ereignissuche, BPMN, Zustellpunkte, Profil-Neustart, Vorgangsablage/Löschen sowie Tastatur, Screenreader und 125/150/200-Prozent-Skalierung. Lizenzinventar, Abhängigkeiten und die Signatur des finalen Pakets prüfen. Authenticode-Identität, Zertifikatskette und Zeitstempel lassen sich mit `Get-AuthenticodeSignature` und `signtool verify /pa /all /v` kontrollieren. Nach Signierung neue Prüfsummen erzeugen und Installation/Upgrade erneut am endgültigen Paket testen. Ein grüner Build oder Merge veröffentlicht keine Alpha.

`attach-candidate.yml` kann manuell ein bereits unabhängig geprüftes Windows-Artefakt an einen vorhandenen Prerelease-Entwurf anhängen. Erforderlich sind Lauf-ID, Quellcommit, Version, Installer-SHA-256 und Entwurfs-ID. Der Schritt prüft Herkunft, Prüfsummen und Entwurfsstatus vor dem Upload, ersetzt keine abweichenden Dateien und veröffentlicht nichts. Das unveränderte ZIP erhält die ursprünglichen Dateinamen für den Prüfsummenabgleich. Der Schritt verwendet ausschließlich das kurzlebige Actions-Token; FIT-Connect-Zugangsdaten werden nicht benötigt.
