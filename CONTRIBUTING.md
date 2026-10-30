# Mitwirken

Beiträge auf eigenen Arbeitsbranches vorbereiten und per Pull Request nach `main` einreichen. Vor größeren Änderungen bitte ein Issue öffnen. Die [Architektur](ARCHITECTURE.md) beschreibt die Modulgrenzen.

## Entwicklung

Die [Buildanleitung](BUILDING.md) beschreibt Voraussetzungen, Entwicklungsstart, lokale Tests und Windows-Installer. Die [Architektur](ARCHITECTURE.md) zeigt die zuständigen Module.
Der [Release-Ablauf](RELEASING.md) beschreibt Abnahme, Branch-Übernahme, Signierung, Tag und Veröffentlichung.

Formatieren: `npm run format`, `./mvnw spotless:apply` im Engine-Verzeichnis und `cargo fmt --manifest-path desktop/Cargo.toml --all`.

Nach Updates der Frontend-Abhängigkeiten `npm run licenses:update` ausführen. `npm run licenses:check` prüft die mitgelieferten Lizenztexte gegen die installierten, festgelegten Versionen.

## Skripte und Tests

`scripts/` enthält ausführbare Projektwerkzeuge und deren gemeinsame Hilfsmodule.
Sie werden über npm, GitHub Actions oder bewusst von Hand gestartet, nicht allein
durch ihre Ablage in diesem Verzeichnis.

| Aufgabe | Beispiele |
| --- | --- |
| Entwicklungsstart und Paketbau | `desktop.mjs`, `stage-engine.mjs`, `stage-scanner.mjs`, `stage-permissions.mjs` |
| Signierung und Release-Dateien | `build-signed-windows.ps1`, `windows-signing.psm1`, `candidate.py`, `attach-candidate.py`, `update-release.py` |
| Paket- und echte Integrationstests | `live-readonly.mjs`, `live-exchange.mjs`, `live-ui/`, `windows-install-smoke.ps1`, `windows-accessibility-smoke.ps1`, `scanner/smoke.mjs` |
| Dokumentation, Lizenzen und CI-Steuerung | `capture-help.mjs`, `export-guide.mjs`, `export-wiki.mjs`, `frontend-licenses.mjs`, `ci/` |

Die automatisierten JavaScript- und Browser-Testfälle liegen unter `tests/`,
Java-Tests in den jeweiligen Maven-Modulen, Rust-Tests bei ihren Modulen und unter
`desktop/native-contracts/`. Die ausführbaren Integrationstest-Treiber unter
`scripts/` brauchen teilweise einen gebauten Installer, Windows, einen echten
Scanner oder ausdrücklich bereitgestellte TEST-Zugänge. `npm test` startet diese
externen Abläufe nicht. Test-Fixtures und Test-Treiber werden nicht mit der App
ausgeliefert.

`scripts/verify-windows.cmd` ist ein manuell aufrufbarer Einstieg für einen Teil
der lokalen Prüfungen; die Workflows verwenden ihn nicht. Er ersetzt weder die
vollständigen Prüfungen nach [BUILDING.md](BUILDING.md) noch die Release-Abnahme.

## Änderungen

- Logik im zuständigen Modul halten. SDK-Unterschiede gehören in die Adapter.
- Verhalten mit passenden Tests prüfen, einschließlich Abbruch und Fehlerfällen bei Schreibaktionen.
- Jeder Fehlerfix erhält einen automatisierten Regressionstest, der das gemeldete Fehlverhalten reproduziert und mit der Korrektur besteht. Betroffene API-Versionen sowie relevante Fehler-, Abbruch- und Grenzfälle berücksichtigen. Falls eine automatische Reproduktion technisch nicht möglich ist, die konkrete Grenze und die manuelle Prüfung dokumentieren.
- Tastaturbedienung, Fokus und verständliche Fehlermeldungen berücksichtigen. Oberfläche und Hilfe verwenden die Sie-Anrede.
- Keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten einchecken oder in Logs und Screenshots übernehmen.
- README, PRs, Releases und Commit-Meldungen kurz und sachlich halten: Änderung, Grund, relevante Tests. Keine Arbeitsprotokolle, Wiederholungen oder Werbetexte. Commit-Beispiel: `fix: authenticate process search`.

Neue Module nach einer Aufgabe benennen. Etwa 150 bis 350 Zeilen sind ein guter Ausgangspunkt. Ab 500 Zeilen verlangt `npm run quality:check` eine Aufteilung oder eine begründete Ausnahme im Prüfsystem. Kommentare erklären Entscheidungen, Sicherheitsbedingungen und Ressourcenbesitz. Offensichtliche Abläufe benötigen keine Nacherzählung.

Die Frontend-Typisierung wird schrittweise erweitert. Öffentliche Typen stehen in `frontend/src/contracts.ts`. `npm run lint` umfasst ESLint, die strenge Typprüfung der TypeScript-Module und die Größenprüfung aller Produktionsquellen. Bestehende JavaScript-Module werden nicht pauschal als typgeprüft behandelt. Laufzeitprüfungen für native Antworten und Dateien bleiben erforderlich.

Die SDK-Integrationstests sind nach Versand, Empfang, Replies, Empfangsbestätigungen und Event Logs gegliedert. Gemeinsame fiktive Schlüssel und HTTP-Fixtures liegen in `SenderTestSupport`, `ReceiverTestSupport` und den zugehörigen Fixture-Klassen. Der Speichergrenzentest startet weiterhin eine eigene JVM mit dem tatsächlich konfigurierten Desktop-Limit.

Ziel ist eine möglichst vollständige Abdeckung der Anwendungslogik und ihrer Entscheidungszweige. Testanzahl und erfolgreiche Läufe belegen keine hundertprozentige Codeabdeckung. Prozentangaben benötigen einen gemessenen Bericht mit Angabe der erfassten Module und der Zeilen- beziehungsweise Zweigabdeckung. Tests prüfen beobachtbares Verhalten und Sicherheitsbedingungen; sie sollen nicht lediglich die Implementierung wiederholen.

## Anleitung

Quelle: `docs/guide/topics.js`, Abbildungen: `docs/guide/images/`. Die Anwendung enthält nur kurze Hinweise und Links.

`node scripts/capture-help.mjs <neues-Verzeichnis>` erstellt Abbildungen mit fiktiven Daten bei laufendem Entwicklungsserver. Bilder vor der Übernahme prüfen.

`node scripts/export-guide.mjs <neues-Verzeichnis>` erzeugt die Web-Anleitung. Den Export im Website-Repository unter `nginx/connect/hilfe/0.3/` übernehmen. Generierte Seiten nicht von Hand bearbeiten.

`node scripts/export-wiki.mjs <neues-Verzeichnis>` erzeugt die versionierten Wiki-Kapitel samt Bildern aus derselben Quelle. Die vorhandenen Kapitel für 0.1 und 0.2 bleiben erhalten.

## Live-Tests

`live-exchange.yml` läuft ausschließlich manuell auf `main`, `release/...` oder `fix/...` mit `confirm_test_writes`. Benötigte Actions-Secrets: `SENDERID`, `SENDERSECRET`, `SENDERDEST`, `SUBSCRIBERID`, `SUBSCRIBERSECRET`. Der Sender braucht eine aktive Typ-C-Destination samt Verwaltungsrechten und bereits freigegebenen Metadatenversionen 2.0.0 und 3.0.0. Der Test ändert diese vorhandene Destination nicht. Der Subscriber braucht Rechte zur Destination-Verwaltung und zum Empfang.

Optional startet die Eingabe `validation_run` die echte Oberflächenabnahme eines erfolgreich geprüften Windows-Installers. Die Abnahme prüft Herkunft, Commit und SHA-256 des ausgewählten Pakets und protokolliert dessen Quell-Commit. Sie bedient die installierte Anwendung mit echten TEST-Zugängen. Der lokale Debugging-Zugang besteht ausschließlich im eigenen CI-Prozess auf Loopback. Traces, Screenshots und Zugangsdaten werden nicht hochgeladen. Diese Skripte sind interne Tests und werden nicht mit dem Desktop-Client ausgeliefert. Die offizielle Signierung verlangt weiterhin eine Windows-Abnahme des exakten Main-Commits.

Mit `ui_probe` und einem `validation_run` lässt sich ausschließlich der Startzugang des installierten WebViews untersuchen. Dieser Diagnosemodus übergibt keine TEST-Zugangsdaten und erzeugt keine Nachrichten oder Destinations. Ein erfolgreicher Starttest ersetzt keine Funktionsabnahme. Auf einem administrativ gestarteten Hosted-Runner ignoriert WebView2 Umgebungsvariablen; der Test setzt dann vorübergehend die von Microsoft dokumentierten HKLM-Overrides ausschließlich für die beiden Client-Kennungen. Vorhandene Overrides werden nicht überschrieben. Die gesetzten Werte werden beim Beenden wieder entfernt. Diese Einstellung gehört ausschließlich zur Testumgebung.

Der Test schreibt fiktive Nachrichten und deaktiviert seine temporäre Destination anschließend. `canBeDecommissionedAt` im Laufprotokoll nennt die früheste Löschung. Vor dem Löschen Eigentümer und Zustand erneut prüfen.

Die Probe zur Absenderbeschränkung aktiviert ausschließlich an der neu angelegten, eindeutig benannten TEST-Destination die Freigabe für die konfigurierte Sender-Destination. Sie prüft v2 und v3 mit leeren Client-Freigaben und nimmt die Beschränkung anschließend zurück. Vorhandene Destinations werden dabei nicht verändert. Protokolliert werden nur Ergebnis und begrenzte technische Versanddiagnosen, keine Bearer oder Antwortinhalte.

## CI

`Checks` lässt Dokuänderungen ohne Build- und Testjobs durch einen kleinen Statuslauf prüfen.
Änderungen an `docs/guide/` erhalten nur die gezielte Exportprüfung. Codeänderungen
werden auf allen Branches einschließlich `main` und bei Pull Requests automatisch
für die betroffenen Bereiche getestet. Dafür ist kein Commit-Marker nötig.
Optional erweitert ein Marker in der letzten Commit-Nachricht den Prüfumfang:

- `[ci full]`: alle normalen Prüfungen, auch bei einer Dokuänderung.
- `[release-check]`: alle normalen Prüfungen und danach die vollständige Windows-Abnahme.

`[release-check]` gilt auf `main`, `fix/...` und `release/...` im Original-Repository.
Es startet weder Signierung noch Veröffentlichung. Die Windows-Abnahme prüft den
angeforderten Commit; wurde der Branch inzwischen weitergeschoben, wird sie abgebrochen.
Manuelle Workflow-Aufrufe bleiben möglich. Der erforderliche Status `Checks passed`
bleibt bestehen; sein Laufprotokoll nennt die tatsächlich angeforderten Prüfbereiche.
`[skip ci]` nicht verwenden, da sonst der erforderliche Status fehlen kann.

`Windows release validation` startet über `[release-check]` oder manuell. Beim manuellen
Aufruf kann `upgrade_run` ein vorhandenes signiertes Vorgängerpaket festlegen;
der Marker-Aufruf wählt die letzte gültige signierte Upgrade-Grundlage.
Der Workflow prüft das vollständige Desktop-Paket, Installation, Profilerhalt, NVDA
und die schreibgeschützten TEST-Aufrufe; er veröffentlicht nichts. Das signierte
Vorgängerpaket wird anhand von Herkunft, Prüfsumme, Signatur und Zeitstempel geprüft.
Beim manuellen Start ohne `upgrade_run` werden Neuinstallation und erneute
Installation derselben Version geprüft.

## Windows-Pakete

Lokale Installer, Voraussetzungen und Buildbefehle stehen in [BUILDING.md](BUILDING.md).
Die einmalige Runner-Einrichtung, manuelle Abnahme, unabhängige Paketprüfung,
Signierung und Veröffentlichung stehen in [RELEASING.md](RELEASING.md).
Diese Abläufe werden dort zentral gepflegt. Ein normaler Entwicklungsbuild
benötigt keinen Signier-Runner.

Beiträge stehen unter der EUPL-1.2. Lizenzhinweise erhalten. Sicherheitslücken gemäß [SECURITY.md](SECURITY.md) melden.
