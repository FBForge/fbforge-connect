# Mitwirken

Änderungen auf einem Arbeitsbranch vorbereiten und per Pull Request nach `main`
einreichen. Vor größeren Änderungen ein Issue öffnen. Beiträge stehen unter EUPL-1.2.

- [Lokal bauen und testen](BUILDING.md)
- [Architektur und Modulgrenzen](ARCHITECTURE.md)
- [Release, Signierung und Live-Abnahme](RELEASING.md)
- [Sicherheitslücken melden](SECURITY.md)

## Entwicklungsregeln

- SDK-Unterschiede in den Adaptern halten. Neue Module nach ihrer Aufgabe benennen.
  Ab 500 Zeilen verlangt `npm run quality:check` eine Aufteilung oder begründete Ausnahme.
- Jeder Fehlerfix erhält einen Regressionstest, der den Fehler reproduziert und
  mit der Korrektur besteht. Betroffene APIs, Abbruch-, Fehler- und Grenzfälle
  berücksichtigen. Technische Grenzen automatischer Tests konkret dokumentieren.
- Möglichst vollständige Abdeckung der Anwendungslogik und ihrer Entscheidungszweige
  anstreben. Testzahlen belegen keine hundertprozentige Codeabdeckung. Prozentangaben
  benötigen einen gemessenen Bericht mit benannten Modulen und Abdeckungsart.
- Tastatur, Fokus und verständliche Fehlermeldungen berücksichtigen. Oberfläche und
  Hilfe verwenden die Sie-Anrede. Produktname: **FBForge Connect**.
- Keine Secrets, privaten Schlüssel oder echten Antragsdaten in Git, Logs und Bildern.
- Commits nach `type(scope): imperative description` benennen. Scope optional.
  `fix` für Fehlerkorrekturen, `feat` für Funktionen, `docs` für Dokumentation und
  `chore(deps)` für reine Abhängigkeitsupdates. Beschreibungen kurz und sachlich halten.
- Öffentliche Frontend-Typen in `frontend/src/contracts.ts` pflegen. Laufzeitprüfungen
  für native Antworten und Dateien bleiben neben der schrittweisen Typisierung nötig.

Formatieren: `npm run format`, im Engine-Verzeichnis `./mvnw spotless:apply` und
`cargo +1.99.0 fmt --manifest-path desktop/Cargo.toml --all`.
Nach Frontend-Abhängigkeitsupdates `npm run licenses:update` ausführen.

## Skripte und Tests

`scripts/` enthält ausführbare Build-, Export-, Signier- und Integrationstest-Werkzeuge.
Sie werden durch npm, Actions oder ausdrücklich von Hand gestartet. `tests/` enthält
JavaScript-/Browser-Testfälle, Maven-Module ihre Java-Tests und Rust-Module ihre
nativen Tests. `desktop/native-contracts/` prüft isolierte native Verträge.

`npm test` führt keine echten FIT-Connect-Schreibaktionen aus. Live-Treiber unter
`scripts/live-ui/` und `scripts/live-exchange.mjs` benötigen Windows, einen gebauten
Installer und ausdrücklich bereitgestellte TEST-Zugänge. Sie werden nicht ausgeliefert.
`scripts/verify-windows.cmd` ist nur ein manueller Einstieg für einen Teil der Prüfungen.

## Anleitung pflegen

Textquelle: `docs/guide/topics.js`, Bilder: `docs/guide/images/`.
Die Anwendung enthält kurze Hinweise und Links. Website und Wiki werden exportiert:

```sh
node scripts/capture-help.mjs <neues-Bildverzeichnis>
node scripts/export-guide.mjs <neues-Webverzeichnis>
node scripts/export-wiki.mjs <neues-Wikiverzeichnis>
```

Die Bildaufnahme benötigt einen laufenden Entwicklungsserver und fiktive Daten.
Bilder vor Übernahme prüfen. Den Webexport in `FBForge/fbforge` unter
`nginx/connect/hilfe/0.3/` importieren und dort `python3 scripts/brand-guide.py`
ausführen. Generierte Kapitel nicht unabhängig bearbeiten. Ältere veröffentlichte
Anleitungen erhalten. Änderungen mit `node --experimental-strip-types --test tests/documentation.test.js` prüfen.

## CI

`Checks` testet auf allen Branches und bei Pull Requests die betroffenen Codebereiche.
Markdown-Änderungen erhalten nur einen Statuslauf, `docs/guide/` eine Exportprüfung.
`Checks passed` bestätigt dabei den angeforderten Umfang, keine ungeprüften Funktionen.

- `[ci full]` in der letzten Commit-Nachricht fordert alle normalen Prüfungen an.
- `[release-check]` ergänzt auf `main`, `fix/...` und `release/...` die vollständige
  Windows-Validierung des angeforderten Commits. Keine Signierung oder Veröffentlichung.
- Manuelle Workflow-Aufrufe bleiben möglich. `[skip ci]` vermeiden, da sonst der
  erforderliche Status fehlen kann.

Die Windows-Validierung prüft Paket, Installation, Profilerhalt, NVDA und lesende
TEST-Aufrufe. `upgrade_run` wählt ein geprüftes signiertes Vorgängerpaket.
Ohne diese Eingabe wird dieselbe Version erneut installiert. Den schreibenden
TEST-Nachrichtenfluss separat nach [RELEASING.md](RELEASING.md#live-abnahme) prüfen.
