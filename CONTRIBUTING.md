# Mitwirken

Beiträge per Pull Request nach `develop`. Vor größeren Änderungen bitte ein Issue öffnen. Die [Architektur](ARCHITECTURE.md) beschreibt die Modulgrenzen.

## Entwicklung

Benötigt: Node.js ab 22.13.0, JDK 25 und Rust gemäß `desktop/rust-toolchain.toml`. Für Windows gelten die [Tauri-Buildvoraussetzungen](https://v2.tauri.app/start/prerequisites/). `JAVA_HOME` muss auf JDK 25 zeigen.

Unter Windows:

```powershell
.\scripts\verify-windows.cmd
npm run desktop:dev
```

Auf anderen Entwicklungssystemen lassen sich Engine, Frontend und isolierte native Module prüfen:

```sh
npm ci --ignore-scripts
(cd engine && ./mvnw verify)
npm run stage:engine
npm run lint
npm run format:check
npm test
npm run test:engine
npm run build:frontend
cargo test --manifest-path desktop/native-contracts/Cargo.toml --locked
```

Browsertests: `npx playwright install chromium`, danach `npm run test:ui`. Öffentliche FIM-Beispiele bei Bedarf mit `node scripts/fetch-public-schemas.mjs` laden. Ohne Cache werden diese Integrationstests übersprungen.

Formatieren: `npm run format`, `./mvnw spotless:apply` im Engine-Verzeichnis und `cargo fmt --manifest-path desktop/Cargo.toml --all`.

## Änderungen

- Logik im zuständigen Modul halten. SDK-Unterschiede gehören in die Adapter.
- Verhalten mit passenden Tests prüfen, einschließlich Abbruch und Fehlerfällen bei Schreibaktionen.
- Tastaturbedienung, Fokus und verständliche Fehlermeldungen berücksichtigen. Oberfläche und Hilfe verwenden die Sie-Anrede.
- Keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten einchecken oder in Logs und Screenshots übernehmen.
- README, PRs, Releases und Commit-Meldungen kurz und sachlich halten: Änderung, Grund, relevante Tests. Keine Arbeitsprotokolle, Wiederholungen oder Werbetexte. Commit-Beispiel: `fix: authenticate process search`.

## Hilfe und Wiki

Texte: `frontend/src/help/topics.js`. Screenshots mit fiktiven Daten: `frontend/src/help/screenshots/`.

`npm run dev` starten. `node scripts/capture-help.mjs <neues-Verzeichnis>` erstellt Abbildungen mit fiktiven Daten. Bilder vor der Übernahme nach `frontend/src/help/screenshots/` prüfen.

`node scripts/export-wiki.mjs <neues-Verzeichnis>` exportiert die Hilfe. Seiten und `images/` in einen separaten Checkout von `https://github.com/FBForge/fbforge-connect.wiki.git` übernehmen, Diff prüfen und pushen. Manuell gepflegte Seiten erhalten. Generierte Inhalte nur an der Quelle bearbeiten.

## Live-Tests

`live-exchange.yml` läuft manuell auf `main` oder `develop` mit `confirm_test_writes`. Benötigte Actions-Secrets: `SENDERID`, `SENDERSECRET`, `SENDERDEST`, `SUBSCRIBERID`, `SUBSCRIBERSECRET`. Der Sender braucht eine aktive Typ-C-Destination samt Verwaltungsrechten. Der Subscriber Rechte zur Destination-Verwaltung und zum Empfang.

Der Test schreibt fiktive Nachrichten und deaktiviert seinen temporären Destination anschließend. `canBeDecommissionedAt` im Laufprotokoll nennt die früheste Löschung. Vor dem Löschen Eigentümer und Zustand erneut prüfen.

## Windows-Pakete

Installer: `npm run desktop:build -- -- --locked`. Ausgabe: `desktop/target/release/bundle/nsis/`. Für ein Paket mit eingebettetem WebView2-Installer: `npm run desktop:build:offline -- -- --locked`.

Vor einem Release Funktionen, Neuinstallation, Upgrade mit Profilerhalt, Tastatur, Screenreader und Monitor-Skalierung prüfen. Automatisierte CI-Prüfungen ersetzen die manuelle Zielgeräteabnahme nicht.

Das finale Setup signieren und mit `signtool verify /pa /all /v` prüfen. Prüfsumme und `build-info.json` aktualisieren. Installation und Upgrade am signierten Paket wiederholen.

`attach-candidate.yml` hängt einen geprüften Build an einen unveröffentlichten Entwurf. Eingaben: Lauf-ID, Commit, Version, Installer-SHA-256 und Entwurfs-ID. Es veröffentlicht nichts und ersetzt keine abweichenden Dateien.

Beiträge stehen unter der EUPL-1.2. Lizenzhinweise erhalten. Sicherheitslücken gemäß [SECURITY.md](SECURITY.md) melden.
