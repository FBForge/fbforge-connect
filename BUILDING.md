# Lokal bauen

Das Desktop-Paket wird auf Windows x64 gebaut. Frontend, Java-Engine und isolierte Rust-Module können auch unter Linux und macOS entwickelt und getestet werden. Desktop-Pakete für diese Systeme werden derzeit nicht ausgeliefert. Die geschützte Profilspeicherung benötigt Windows-DPAPI.

## Voraussetzungen

- Git und Node.js ab 22.13.0. Die CI verwendet Node.js 24.20.0.
- Ein vollständiges JDK 25 mit `javac` und `jlink`. `JAVA_HOME` muss auf dessen Installationsverzeichnis zeigen.
- Python 3.10 oder neuer für die lokalen Prüfungen. Unter Windows muss `python`, unter Linux und macOS `python3` im `PATH` verfügbar sein.
- Rust über rustup. Die benötigte Version steht in `desktop/rust-toolchain.toml`.
- Für den Scanner-Paketbau: GnuPG (unter Windows beispielsweise aus Git for Windows); offizielle ClamAV-Downloads und FreshClam müssen erreichbar sein.
- Für Windows: Visual Studio Build Tools mit „Desktopentwicklung mit C++“, MSVC-x64-Werkzeugen und Windows SDK. Außerdem Microsoft Edge WebView2 Runtime. Einzelheiten stehen in den [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/).

Maven wird durch den mitgelieferten Wrapper geladen. Für den ersten Build ist Internet erforderlich. Zugangsdaten zu FIT-Connect oder ein Signaturzertifikat sind zum Bauen und für die lokalen Tests nicht erforderlich.

Die folgenden Befehle bauen den ausgecheckten Stand. Veröffentlichte Versionen lassen sich nach dem
Klonen über ihren Release-Tag auschecken, zum Beispiel mit `git switch --detach v0.3.0`.
Main enthält den aktuellen Quellstand. Neue Entwicklung liegt auf dem jeweiligen Arbeitsbranch.

## Windows

PowerShell im Arbeitsverzeichnis öffnen. Nach der Installation der Werkzeuge gegebenenfalls ein neues Fenster öffnen, damit `PATH` und `JAVA_HOME` übernommen werden.
Verwenden Sie ein natives Windows-JDK 25 mit aktuellen Sicherheitsupdates und die MSVC-Variante von Rust.
Ein `JAVA_HOME`-Pfad nach WSL ist für den Windows-Build ungeeignet. Bauen Sie in einem lokalen
Windows-Verzeichnis statt direkt unter `\\wsl.localhost\...`.

```powershell
git clone https://github.com/FBForge/fbforge-connect.git
cd fbforge-connect
# Für den veröffentlichten Stand: git switch --detach v0.3.0
rustup toolchain install 1.99.0 --profile minimal --component rustfmt
npm ci --ignore-scripts
.\engine\mvnw.cmd -f engine/pom.xml --batch-mode verify
npm run stage:engine
npm run test:engine
```

`stage:engine` kopiert beide SDK-Adapter und erzeugt mit `jlink` eine lokale Java-Laufzeit unter `desktop/resources/engine/`. Diese generierten Dateien werden nicht eingecheckt. Nach Änderungen am Java-Code die letzten drei Befehle erneut ausführen.

### Anwendung entwickeln

```powershell
npm run desktop:dev
```

Der Befehl startet Frontend und Desktop-Anwendung gemeinsam. Frontend-Änderungen werden direkt übernommen. Zum Beenden `Strg+C` verwenden.

### Installer bauen

Zuerst die optionale Scanner-Komponente einschließlich geprüfter Datenbanken und passendem Quellcode bereitstellen. Beide Installer enthalten diese abwählbare Komponente; die Unterscheidung bei WebView2 bleibt davon unabhängig.

Fehlt das Paket bei einem Windows-Installer-Build, bereitet `desktop:build` es
automatisch vor dem Rust-Build vor. Das gilt auch für `desktop:build:offline` und
lokale PowerShell-Buildhilfen, die diese npm-Befehle verwenden. GnuPG und die
Download-Voraussetzungen bleiben erforderlich. Vorhandene vorbereitete Pakete
werden wiederverwendet; nach Änderungen am Scanner-Manifest erneut ausdrücklich
`npm run stage:scanner` ausführen. Entwicklungsstart und `build --debug` laden
keinen Scanner nach. Ein fehlgeschlagener Vorbereitungsschritt bricht den Build ab.

```powershell
npm run stage:scanner
npm run desktop:build -- -- --locked
```

Das unsignierte Setup liegt unter `desktop/target/release/bundle/nsis/`. Die gebaute Anwendung liegt unter `desktop/target/release/fbforge-connect.exe`. Das Paket enthält Java. Fehlt WebView2 auf dem Zielrechner, lädt das Standard-Setup die Runtime bei der Installation nach.

Für einen Installer mit eingebettetem WebView2-Installer:

```powershell
npm run desktop:build:offline -- -- --locked
```

Der erste Rust-Release-Build kompiliert sämtliche Abhängigkeiten und kann lange dauern.
Auch die letzte Anzeige `487/488` kann mehrere Minuten stehen bleiben, während Rust
optimiert und verlinkt. Die Zahl zählt Aufgaben, keine Zeitanteile. Den Build-Ordner
für Folgebuilds behalten. Das Laden der WebView2-Dateien benötigt zusätzlich Zeit. Beide Varianten verwenden dasselbe Ausgabeverzeichnis. Benötigte Pakete vor dem nächsten Build an einen anderen Ort kopieren.

Für normale Entwicklungsbuilds den öffentlichen Projekt-Prüfschlüssel beibehalten.
Ohne veröffentlichte `latest.json` meldet die Updatesuche fehlende Update-Informationen.
Die Einrichtung privater Schlüssel gehört ausschließlich zum
[Release-Ablauf](RELEASING.md#update-signierung-einmalig-einrichten).

## Linux und macOS

JDK 25, Node.js und rustup installieren, dann im Repository ausführen:

```sh
rustup toolchain install 1.99.0 --profile minimal --component rustfmt
npm ci --ignore-scripts
./engine/mvnw -f engine/pom.xml --batch-mode verify
npm run stage:engine
npm run test:engine
npm run build:frontend
cargo +1.99.0 test --manifest-path desktop/native-contracts/Cargo.toml --locked
```

`npm run dev` öffnet das Frontend unter `http://127.0.0.1:1420`. Ein normaler Browser hat keine native Desktop-Anbindung. Die Browsertests verwenden dafür fiktive Testantworten. Für einen vollständigen nativen Linux-Build wären zusätzlich die GTK-/WebKit-Entwicklungsbibliotheken aus den Tauri-Voraussetzungen nötig.

## Prüfungen

Diese Befehle gelten im Repository-Hauptverzeichnis unter Windows, Linux und macOS:

```sh
npm run lint
npm run format:check
npm run licenses:check
npm test
npx playwright install chromium
npm run test:bundle
node scripts/fetch-public-schemas.mjs
npm run test:ui
cargo +1.99.0 fmt --manifest-path desktop/Cargo.toml --all -- --check
cargo +1.99.0 fmt --manifest-path desktop/native-contracts/Cargo.toml --all -- --check
```

Die öffentlichen Schema-Fixtures werden vor dem Speichern anhand ihrer Prüfsummen geprüft. Ohne diesen Download werden die zugehörigen Integrationstests übersprungen. Auf Linux kann Playwright zusätzlich Systembibliotheken benötigen. Dafür `npx playwright install --with-deps chromium` verwenden, sofern Systempakete installiert werden dürfen.

`test:bundle` baut die Produktionsdateien in einem temporären Verzeichnis und
prüft Paketgrößen sowie Start, Navigation, Lizenztexte und dynamisch geladene
Werkzeuge im Browser. Die Warnschwelle des Bundlers bleibt unverändert.

XML-Negativtests übergeben bewusst syntaktisch falsche Daten oder verbotene
DOCTYPE-Angaben an das SDK. Dessen Parser kann dabei `[Fatal Error]` auf die
Konsole schreiben, obwohl der Test die erwartete Ablehnung erfolgreich prüft.
Prüfen Sie die zugehörige JUnit-Zusammenfassung: `Failures: 0, Errors: 0` bedeutet
bestandene Tests. Ein tatsächlicher Test- oder Buildfehler darf nicht übergangen werden.

Die nativen Regressionen verwenden dieselben Module wie die Desktop-Befehle:
`write_gate` für Schreibfreigaben und dauerhafte Checkpoints, `profile_archive`
für begrenzte Schlüsselarchive, `export_source` für gebundene Downloads sowie
`update_state` und `update_install` für Update-Zustände und Installationsfreigaben.
Die Desktop-Adapter liefern Dialoge, Engine-IPC und Dateisystemzugriffe.
Zusätzliche Tests prüfen beschädigte Vorgänge, unterbrochene Exporte und
Scanner-Staging. Windows prüft außerdem echte DPAPI-Dateien und gesperrte Ziele,
bei denen ein fehlgeschlagener Dateitausch die bisherige Kopie erhalten muss.

Unter Windows zusätzlich die vollständigen nativen Tests ausführen:

```powershell
cargo +1.99.0 test --manifest-path desktop/Cargo.toml --locked
```

Installation, Upgrade und NVDA werden im Workflow `Windows release validation` geprüft. Die [Beitragsanleitung](CONTRIBUTING.md) beschreibt Live-Tests und die getrennte Signierung von Veröffentlichungspaketen.

## Testabdeckung messen

```bash
npm run test:coverage:node
npm run test:coverage:ui
(cd engine && ./mvnw --batch-mode -Pcoverage clean verify)
node scripts/coverage-engine.mjs
node scripts/coverage-summary.mjs node browser engine
```

Die Browsermessung lädt und prüft ihre festgelegten öffentlichen Schema-Fixtures
selbst. Ein fehlgeschlagener Lauf entfernt die Freigabe für seine Zusammenfassung,
damit kein alter Bericht als neuer Erfolg ausgewertet wird.

Die HTML-Berichte liegen unter `coverage/node`, `coverage/browser` und
`engine/coverage/target/site/jacoco-aggregate`. Die normale CI lädt sie als Artefakte
hoch. Es gibt keine gemeinsame Prozentzahl über verschiedene Messverfahren.

- Node/c8 zählt alle ausführbaren JS-/TS-Module unter `frontend/src`, auch nie importierte.
- Chromium/V8 misst dieselben Module sowie Vue-Komponenten mit Source-Maps.
  Auch nie geladene Komponenten werden kompiliert und als ungetestet aufgenommen.
  Jeder Test und jeder selbst angelegte Browserkontext verwendet `tests/ui/fixtures.js`.
  Die Messung erfasst Seitenkontexte. Nicht erfasste Workerdateien bleiben als
  ungetestet im Nenner.
- JaCoCo misst die fünf eigenen Java-Module, einschließlich beider isolierter Adapter.
  SDK- und Bibliotheksquellen sowie Testcode sind ausgeschlossen.
- Typdeklarationen, Styles und Test-Fixtures gehören nicht zum ausführbaren Frontend-Umfang.
  Fehlende Quelldateien oder leere Berichte lassen die Messung fehlschlagen.

Native Messung mit festgelegten Werkzeugversionen:

```bash
rustup component add llvm-tools-preview --toolchain 1.99.0
cargo +1.99.0 install cargo-llvm-cov --version 0.9.1 --locked
node scripts/coverage-native.mjs contracts
node scripts/coverage-summary.mjs native-contracts
```

Unter Windows nach dem Staging der Engine zusätzlich
`node scripts/coverage-native.mjs desktop` und
`node scripts/coverage-summary.mjs native-desktop` ausführen. Berichte unter
`coverage/native-*` nennen das gemessene Betriebssystem. `index.html` und `product.lcov`
zeigen eindeutige Produktzeilen aus den LCOV-DA-Daten. Ein Rust-Syntaxbaum schließt
ausschließlich testexklusive Quellbereiche aus. `raw.lcov`, `summary.json` und der
LLVM-Bericht unter `html/` erhalten die ursprünglichen Rohdaten einschließlich
Inline-Tests und expandierter Makrozähler. Die Auswertung erfordert den passenden
Quellstand. Der Analysehelfer unter `desktop/native-contracts/examples/coverage-source.rs`
und seine ausschließlich für Tests verwendeten Parserabhängigkeiten werden nicht ausgeliefert. Linux misst weder Windows-DPAPI
noch den vollständigen Tauri-Befehlsumfang. Native Zweigabdeckung wird derzeit nicht erfasst.
Instrumentierte Rust-Objekte entstehen in einem separaten temporären Verzeichnis und
werden nach der Messung entfernt. Release-Builds bleiben ohne Instrumentierung.

Die Mindestwerte in `scripts/coverage-summary.mjs` sichern den gemessenen Stand:
Node 56 % Zeilen/85 % Zweige, Browser 82 %/70 %, Java 82 %/63 %.
Sie sind eine Untergrenze, kein Qualitätsziel. Weitere Tests sollen besonders bisher
unerreichte Fehler- und Abbruchpfade abdecken.

Native Produktzeilen am Referenzstand `426960a`:

| Umfang | Gemessen | Mindestwert |
| --- | --- | --- |
| Isolierte Verträge unter Linux | 69,08 % | 69 % |
| Isolierte Verträge unter Windows | 79,66 % | 79 % |
| Vollständige Desktop-Tests unter Windows | 37,94 % | 37 % |

Die gemeinsamen Ablaufmodule für Schreibfreigaben, Schlüsselarchive, Exportbindung,
Scanner-Downloads und Updates erreichen dabei 97,30 bis 100 % Zeilenabdeckung. Die vollständige
Desktop-Quote zeigt weiterhin Testlücken bei den Tauri-I/O-Adaptern und weiteren
nativen Pfaden. Die gesonderte installierte UI-Abnahme wird nicht instrumentiert
und fließt daher nicht in diese Quote ein. Keine Linux-Quote ersetzt Windows-Nachweise.

## Häufige Buildfehler

| Meldung oder Verhalten                     | Prüfen                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `JAVA_HOME` fehlt oder `jlink` scheitert   | `JAVA_HOME` auf ein vollständiges JDK 25 setzen, keine reine Java-Runtime verwenden.                            |
| Engine-Artefakte fehlen                    | Den gesamten Maven-Reaktor mit dem oben angegebenen `-f engine/pom.xml` bauen, danach `stage:engine` ausführen. |
| `link.exe` oder Windows SDK fehlt          | Die C++-Arbeitslast der Visual Studio Build Tools einschließlich MSVC und Windows SDK installieren.             |
| Port 1420 ist belegt                       | Einen bereits laufenden Entwicklungsserver beenden. `desktop:dev` startet seinen eigenen Server.                |
| Windows blockiert `build-script-build.exe` | Den Schutzverlauf prüfen. Auf verwalteten Geräten eine gezielte Freigabe mit dem Administrator abstimmen.       |

Bei Fehlern nicht mit späteren Buildschritten fortfahren. Keine Zugangsdaten oder privaten Schlüssel in Fehlerberichte übernehmen.

## Lokaler Scanner und echte Scan-Abnahme

`stage:scanner` prüft ClamAV 1.5.4 anhand des festgelegten Talos-Schlüssels und der
Hashes in `desktop/scanner-component.json`. GnuPG aus einer anderen Installation
kann mit `npm run stage:scanner -- --gpg C:/Pfad/gpg.exe` angegeben werden.
Der öffentliche Schlüsselimport und die Signaturprüfung benötigen keinen
GPG-Agenten. Die Paketvorbereitung verhindert dessen automatischen Start auch
bei Git for Windows. Dessen Agent-Socketpfad muss trotzdem kurz genug bleiben.
Bei `File name too long` ein kurzes Checkout-Verzeichnis verwenden. Für einen
Actions-Runner eignet sich beispielsweise das Arbeitsverzeichnis `C:\w`.
Die festgelegten Signatur- und Hashprüfungen bleiben aktiv.
Downloads werden unter `.cache/scanner/` zwischengespeichert und vor Verwendung
erneut geprüft. Offizielle Datenbanken werden höchstens 24 Stunden aus dem zuvor
geprüften Build-Cache übernommen. Keine Zugangsdaten sind erforderlich.

Ergebnis: `desktop/resources/scanner/component.zip` für das Setup und
`desktop/target/scanner-dist/` für die Weiterverteilung, einschließlich passendem
Quellarchiv, offizieller Quellsignatur, Prüfschlüssel und Lizenzhinweisen.
Diese Dateien gehören nicht ins Git. Ein Release-Build ohne Komponente bricht ab.
Im Entwicklungsmodus ist sie optional; der echte lokale Scanner benötigt Windows.

Eine vorbereitete Offline-Datenbank kann mit `--database-directory` übernommen
werden: `main.cvd`, `daily.cvd`, `bytecode.cvd` und die drei zur Version gehörenden
`.cvd.sign`-Dateien. `sigtool --verify` prüft die offiziellen Signaturen. Unter
Linux zusätzlich `--sigtool /pfad/zu/sigtool` angeben. Für vollständig abgeschottete
Buildrechner den bereits gefüllten Downloadcache mitnehmen und `--cache` angeben.

Die Windows-Validierung führt `scanner-runtime` gegen das echte Paket aus:
Offline-Installation, eigener Loopback-Prozess, saubere Datei, im Speicher erzeugte
EICAR-Testdaten und Prozessende. Der Test verändert keine bestehende Installation.
`npm run test:scanner -- --engine-directory <Verzeichnis-mit-clamd> --database-directory <Datenbanken> --certificates-directory <CVD-Zertifikate>`
prüft ebenfalls die echte Engine mit sauberen Text-/PDF-Dateien und EICAR.
Mit `--java-acceptance` wird zusätzlich der tatsächliche Host über INSTREAM und
einen lokalen, an diese Engine angeschlossenen ICAP-Testdienst geprüft. Das ist
keine Zertifizierung fremder ICAP-Produkte. EICAR ist ein ungefährlicher
standardisierter Erkennungstest, keine allgemeine Sicherheitsgarantie.

Die echte Nachrichtenabnahme mit ClamAV und kontrollierten ICAP-Anlagenproblemen
ist unter [Live-Abnahme](RELEASING.md#live-abnahme) beschrieben. Ein kontrollierter
Protokollbefund ersetzt keinen echten Erkennungstest und überträgt keine EICAR-Datei.

Der rein lesende Workflow `Check ClamAV upstream release` meldet wöchentlich oder
bei manuellem Start eine neuere offizielle Engine-Version. Er installiert oder
veröffentlicht nichts. Ein Engine-Update erfordert neue geprüfte Hashes, Quellen
und die erneute Komponenten-Abnahme; Signaturupdates ersetzen kein Engine-Update.

Für die gezielte Windows-Abnahme einer Scanner-Änderung kann `Windows release
validation` mit `scanner_only=true` gestartet werden. Dieser Modus baut keinen
Installer und ersetzt keine vollständige Release-Validierung oder Signierfreigabe.
