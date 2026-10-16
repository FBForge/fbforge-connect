# Mitwirken

Der FIT-Connect Test-Client ist eine Windows-Desktop-Anwendung für Integrationstests auf TEST. Vor Änderungen bitte [Architektur](ARCHITECTURE.md), [Work-Goal](ALPHA1_GOAL.md) und [Umsetzungsstand](ALPHA1_PROGRESS.md) lesen. Ausschließlich fiktive Testdaten verwenden.

## Lokal starten und prüfen

Benötigt werden Node.js ab 22.12, JDK 25 und die im Desktop-Verzeichnis festgelegte Rust-Version. Windows benötigt außerdem die Tauri-Buildvoraussetzungen. Die README beschreibt den vollständigen Windows-Build.

```sh
npm ci --ignore-scripts
./engine/mvnw -f engine/pom.xml verify
npm test
npm run build:frontend
npm run stage:engine
npm run test:engine
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
