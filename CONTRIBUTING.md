# Mitwirken

FBForge Connect ist eine Windows-Desktop-Anwendung für Integrationstests auf TEST. Vor Änderungen bitte [Architektur](ARCHITECTURE.md), [Work-Goal](ALPHA1_GOAL.md) und [Umsetzungsstand](ALPHA1_PROGRESS.md) lesen. Ausschließlich fiktive Testdaten verwenden.

## Lokal starten und prüfen

Benötigt werden Node.js ab 22.13.0, JDK 25 und die im Desktop-Verzeichnis festgelegte Rust-Version. Windows benötigt außerdem die Tauri-Buildvoraussetzungen. Die README beschreibt den vollständigen Windows-Build.

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

## Änderungen vorbereiten

- Module nach fachlicher Verantwortung schneiden. UI, native Berechtigungen und SDK-Anpassungen haben unterschiedliche Aufgaben.
- Gemeinsame Logik bündeln; tatsächliche SDK-Unterschiede in ihren Adaptern kapseln. Keine Abstraktionen für nur vermutete spätere Anforderungen einführen.
- Öffentliche Verträge und relevante Invarianten erklären. Kommentare sollen insbesondere Gründe und Sicherheitsgrenzen erklären.
- Verhaltensänderungen mit einem aussagekräftigen Test absichern. Kosmetische Änderungen brauchen keinen Test, der nur den Quelltext nachbildet.
- Vollständige Anwenderaufgaben prüfen: klare Sprache, Tastaturbedienung, Fokus und Fehlerhilfe. Eine Erklärung darf nicht ausschließlich bei Maus-Hover erreichbar sein.
- Keine Zugangsdaten, privaten Schlüssel, Nutzdaten oder vollständigen SDK-Fehlertexte in Logs, Screenshots, Issues oder Testartefakte übernehmen.
- Änderungen und Prüfergebnisse im Pull Request verständlich beschreiben. Bekannte Einschränkungen und noch ausstehende Live-Prüfungen ausdrücklich nennen.

Neue Schreibaktionen brauchen eine native Vorschau-/Bestätigungsgrenze und Tests für Abbruch, falschen Kontext und einen ungewissen Übertragungsausgang. Neue Renderer-Befehle müssen in Rust, Java und den Tauri-Berechtigungen zusammenpassen. Private Archivbefehle dürfen niemals zu Renderer-Befehlen werden.

## Projektregeln und Lizenz

Die vorhandenen SDKs übernehmen Kryptografie und FIT-Connect-Protokollverarbeitung. API v2 und v3 werden ausdrücklich getrennt geprüft. Produktionsumgebungen, eingebettete Zugangsdaten und automatische Annahme/Ablehnung gehören nicht in dieses Projekt. Farben, Schriften, Bedienelemente und Statusdarstellung kommen aus `frontend/src/site.css`; zusätzliche Styles beschreiben vor allem das Layout.

Mit einem Beitrag bestätigst du die Berechtigung, ihn unter der EUPL-1.2 dieses Projekts einzureichen. Bestehende Urheberrechts- und Lizenzhinweise bleiben erhalten. Sicherheitsprobleme bitte privat gemäß [SECURITY.md](SECURITY.md) melden. Größere Beiträge externer Mitwirkender sollten vorab in einem Issue abgestimmt werden.

Formatierung: `npm run format`, im Engine-Verzeichnis `./mvnw spotless:apply`, für Rust `cargo fmt --manifest-path desktop/Cargo.toml --all`. Die Compiler-Modulfreigaben in `engine/.mvn/jvm.config` gelten nur für den Build-Formatter, nicht für die ausgelieferte Laufzeit. Live-Zugänge ausschließlich über echte Secret-Speicher verwenden; siehe [Sicherheitsprüfung](SECURITY_REVIEW.md).

## Öffentliche Schema-Integrationstests

Die normalen lokalen Tests benötigen keine Zugangsdaten. Für die zusätzlichen versionsgebundenen FIM-Beispiele einmal `node scripts/fetch-public-schemas.mjs` ausführen und anschließend die Browsertests starten. Ein vollständiger Cache kann mit `--offline` geprüft werden. Die Dateien werden nicht mit der Anwendung verteilt; Herkunft und Grenzen stehen in [PUBLIC_SCHEMA_TESTS.md](PUBLIC_SCHEMA_TESTS.md). Reale TEST-Schreibabläufe sind separat in [LIVE_TESTS.md](LIVE_TESTS.md) beschrieben und gehören nicht in gewöhnliche Beitragsprüfungen.
