# Mitwirken

Beiträge auf eigenen Arbeitsbranches vorbereiten und per Pull Request nach `main` einreichen. Vor größeren Änderungen bitte ein Issue öffnen. Die [Architektur](ARCHITECTURE.md) beschreibt die Modulgrenzen.

## Entwicklung

Die [Buildanleitung](BUILDING.md) beschreibt Voraussetzungen, Entwicklungsstart, lokale Tests und Windows-Installer. Die [Architektur](ARCHITECTURE.md) zeigt die zuständigen Module.
Der [Release-Ablauf](RELEASING.md) beschreibt Abnahme, Branch-Übernahme, Signierung, Tag und Veröffentlichung.

Formatieren: `npm run format`, `./mvnw spotless:apply` im Engine-Verzeichnis und `cargo fmt --manifest-path desktop/Cargo.toml --all`.

Nach Updates der Frontend-Abhängigkeiten `npm run licenses:update` ausführen. `npm run licenses:check` prüft die mitgelieferten Lizenztexte gegen die installierten, festgelegten Versionen.

## Änderungen

- Logik im zuständigen Modul halten. SDK-Unterschiede gehören in die Adapter.
- Verhalten mit passenden Tests prüfen, einschließlich Abbruch und Fehlerfällen bei Schreibaktionen.
- Tastaturbedienung, Fokus und verständliche Fehlermeldungen berücksichtigen. Oberfläche und Hilfe verwenden die Sie-Anrede.
- Keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten einchecken oder in Logs und Screenshots übernehmen.
- README, PRs, Releases und Commit-Meldungen kurz und sachlich halten: Änderung, Grund, relevante Tests. Keine Arbeitsprotokolle, Wiederholungen oder Werbetexte. Commit-Beispiel: `fix: authenticate process search`.

Neue Module nach einer Aufgabe benennen. Etwa 150 bis 350 Zeilen sind ein guter Ausgangspunkt. Ab 500 Zeilen verlangt `npm run quality:check` eine Aufteilung oder eine begründete Ausnahme im Prüfsystem. Kommentare erklären Entscheidungen, Sicherheitsbedingungen und Ressourcenbesitz. Offensichtliche Abläufe benötigen keine Nacherzählung.

Die Frontend-Typisierung wird schrittweise erweitert. Öffentliche Typen stehen in `frontend/src/contracts.ts`. `npm run lint` umfasst ESLint, die strenge Typprüfung der TypeScript-Module und die Größenprüfung aller Produktionsquellen. Bestehende JavaScript-Module werden nicht pauschal als typgeprüft behandelt. Laufzeitprüfungen für native Antworten und Dateien bleiben erforderlich.

Die SDK-Integrationstests sind nach Versand, Empfang, Replies, Empfangsbestätigungen und Event Logs gegliedert. Gemeinsame fiktive Schlüssel und HTTP-Fixtures liegen in `SenderTestSupport`, `ReceiverTestSupport` und den zugehörigen Fixture-Klassen. Der Speichergrenzentest startet weiterhin eine eigene JVM mit dem tatsächlich konfigurierten Desktop-Limit.

## Anleitung

Quelle: `docs/guide/topics.js`, Abbildungen: `docs/guide/images/`. Die Anwendung enthält nur kurze Hinweise und Links.

`node scripts/capture-help.mjs <neues-Verzeichnis>` erstellt Abbildungen mit fiktiven Daten bei laufendem Entwicklungsserver. Bilder vor der Übernahme prüfen.

`node scripts/export-guide.mjs <neues-Verzeichnis>` erzeugt die Web-Anleitung. Den Export im Website-Repository unter `nginx/connect/hilfe/0.2/` übernehmen. Generierte Seiten nicht von Hand bearbeiten.

`node scripts/export-wiki.mjs <neues-Verzeichnis>` erzeugt die versionierten Wiki-Kapitel samt Bildern aus derselben Quelle. Die vorhandenen Kapitel für 0.1 bleiben erhalten.

## Live-Tests

`live-exchange.yml` läuft ausschließlich manuell auf `main` oder `release/0.2.0` mit `confirm_test_writes`. Benötigte Actions-Secrets: `SENDERID`, `SENDERSECRET`, `SENDERDEST`, `SUBSCRIBERID`, `SUBSCRIBERSECRET`. Der Sender braucht eine aktive Typ-C-Destination samt Verwaltungsrechten und bereits freigegebenen Metadatenversionen 2.0.0 und 3.0.0. Der Test ändert diese vorhandene Destination nicht. Der Subscriber braucht Rechte zur Destination-Verwaltung und zum Empfang.

Optional startet die Eingabe `validation_run` die echte Oberflächenabnahme eines erfolgreich geprüften Windows-Installers. Die Abnahme prüft Herkunft, Commit und SHA-256 des ausgewählten Pakets und protokolliert dessen Quell-Commit. Sie bedient die installierte Anwendung mit echten TEST-Zugängen. Der lokale Debugging-Zugang besteht ausschließlich im eigenen CI-Prozess auf Loopback. Traces, Screenshots und Zugangsdaten werden nicht hochgeladen. Diese Skripte sind interne Tests und werden nicht mit dem Desktop-Client ausgeliefert. Die offizielle Signierung verlangt weiterhin eine Windows-Abnahme des exakten Main-Commits.

Mit `ui_probe` und einem `validation_run` lässt sich ausschließlich der Startzugang des installierten WebViews untersuchen. Dieser Diagnosemodus übergibt keine TEST-Zugangsdaten und erzeugt keine Nachrichten oder Destinations. Ein erfolgreicher Starttest ersetzt keine Funktionsabnahme. Auf einem administrativ gestarteten Hosted-Runner ignoriert WebView2 Umgebungsvariablen; der Test setzt dann vorübergehend die von Microsoft dokumentierten HKLM-Overrides ausschließlich für die beiden Client-Kennungen. Vorhandene Overrides werden nicht überschrieben. Die gesetzten Werte werden beim Beenden wieder entfernt. Diese Einstellung gehört ausschließlich zur Testumgebung.

Der Test schreibt fiktive Nachrichten und deaktiviert seine temporäre Destination anschließend. `canBeDecommissionedAt` im Laufprotokoll nennt die früheste Löschung. Vor dem Löschen Eigentümer und Zustand erneut prüfen.

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

Installer: `npm run desktop:build -- -- --locked`. Ausgabe: `desktop/target/release/bundle/nsis/`. Für ein Paket mit eingebettetem WebView2-Installer: `npm run desktop:build:offline -- -- --locked`.

Vor einem Release Funktionen, Neuinstallation, Upgrade mit Profilerhalt, Tastatur, Screenreader und Monitor-Skalierung prüfen. Automatisierte CI-Prüfungen ersetzen die manuelle Zielgeräteabnahme nicht.

Die offizielle Signierung und Veröffentlichung folgen [RELEASING.md](RELEASING.md). Der Workflow
erzeugt Prüfsumme, `build-info.json` und `signature-info.json`; diese Herkunftsnachweise nicht von Hand
ändern. Installation und Upgrade werden am signierten Paket unabhängig wiederholt.

### Signierung über Actions

1. Einen eigenen Windows-x64-Runner mit Label `fbforge-signing` unter einem separaten Windows-Benutzer einrichten. Buildwerkzeuge, Windows SDK und den lokalen Signaturdienst installieren. Den Runner interaktiv starten, nicht als Dienst. Das Zertifikat muss im Zertifikatspeicher dieses Benutzers verfügbar sein.
2. Das GitHub-Environment `windows-signing` anlegen. Als einzigen Required Reviewer `FBForge` eintragen. „Prevent self-review“ ausschalten, damit der Eigentümer seinen eigenen Lauf freigeben kann.
3. Repository-Variablen `WINDOWS_SIGNING_THUMBPRINT` und `WINDOWS_TIMESTAMP_URL` setzen. Gemeint sind der öffentliche Zertifikatsfingerabdruck ohne Leerzeichen und der RFC-3161-Zeitstempelserver des Anbieters. Keine Zugangsdaten oder TOTP-Geheimnisse in GitHub speichern.
4. Bei diesem öffentlichen Repository müssen alle externen Fork-PRs auf manuelle Workflow-Freigabe warten. Fork-PR-Workflows niemals auf dem Signier-Runner freigeben. Den Signier-Runner ausschließlich für den manuellen Signierjob verwenden und außerhalb der Signierung anhalten.
5. Für den aktuellen Commit `Windows release validation` manuell auf `main` starten und vollständig erfolgreich abschließen. `Sign Windows candidate` auf derselben Branch-Version mit dessen Lauf-ID starten und den Signierjob freigeben.

Der Job signiert Anwendung, Deinstallationsprogramm und Setup. Ein separater GitHub-Runner prüft Signaturen, Zeitstempel, Installation und Upgrade vom unsigned Prüfpaket. Erst danach entsteht das Artefakt `windows-alpha-signed-setup`. Es wird nichts veröffentlicht.

GitHub bietet den manuellen Workflow erst an, wenn er nach Review im Default-Branch liegt.

`attach-candidate.yml` hängt ausschließlich ein unabhängig geprüftes, signiertes Paket an einen unveröffentlichten Entwurf. Eingaben: Lauf-ID, Commit, Version, Installer-SHA-256 und Entwurfs-ID. Es veröffentlicht nichts und ersetzt keine abweichenden Dateien.

Beiträge stehen unter der EUPL-1.2. Lizenzhinweise erhalten. Sicherheitslücken gemäß [SECURITY.md](SECURITY.md) melden.
