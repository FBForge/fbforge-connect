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
Klonen über ihren Release-Tag auschecken, zum Beispiel mit `git switch --detach v0.2.0`.
Neue Entwicklung liegt auf dem jeweiligen Arbeitsbranch,
aktuell `release/0.3.0`; die bisherigen 0.2.1-Fehlerkorrekturen sind darin einschließlich ihrer Branch-Historie enthalten.

## Windows

PowerShell im Arbeitsverzeichnis öffnen. Nach der Installation der Werkzeuge gegebenenfalls ein neues Fenster öffnen, damit `PATH` und `JAVA_HOME` übernommen werden.
Verwenden Sie ein natives Windows-JDK 25 mit aktuellen Sicherheitsupdates und die MSVC-Variante von Rust.
Ein `JAVA_HOME`-Pfad nach WSL ist für den Windows-Build ungeeignet. Bauen Sie in einem lokalen
Windows-Verzeichnis statt direkt unter `\\wsl.localhost\...`.

```powershell
git clone https://github.com/FBForge/fbforge-connect.git
cd fbforge-connect
# Für die neue Entwicklung: git switch release/0.3.0
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

Der erste Rust-Build und das Laden der WebView2-Dateien können einige Minuten dauern. Beide Varianten verwenden dasselbe Ausgabeverzeichnis. Benötigte Pakete vor dem nächsten Build an einen anderen Ort kopieren.

### Update-Signierung einmalig einrichten

Der öffentliche Projekt-Prüfschlüssel ist in `desktop/update-public-key.txt` hinterlegt. Für normale Entwicklungsbuilds keinen neuen Schlüssel erzeugen. Nur der Projekteigentümer richtet das dauerhafte Schlüsselpaar ein oder plant eine Schlüsselrotation. Ein Build ohne gültigen Prüfschlüssel deaktiviert den Updater erkennbar; der manuelle Download bleibt verfügbar.

Diese Datei ist die gemeinsame Quelle für die Anwendung, den Signierablauf und die
unabhängige Paketprüfung. Der Schlüsselwert wird nicht zusätzlich in der Dokumentation
oder `tauri.conf.json` gepflegt. Bei der Erzeugung entsteht außerdem die öffentliche
Datei `connect-updater.key.pub` neben dem privaten Schlüssel auf dem Signierrechner;
das Skript kopiert deren Inhalt in die Repository-Datei. Beide öffentlichen Kopien
sind beabsichtigt. Die private `.key`-Datei bleibt außerhalb des Repositorys.

Der Projekteigentümer erzeugt das dauerhafte Schlüsselpaar **auf dem Windows-
Signierrechner**. Für die einmalige Ersteinrichtung aus dem Checkout ausführen:

```powershell
.\scripts\setup-update-signing.ps1
```

Diese einmalige Schlüsselerzeugung funktioniert auch aus einem WSL-UNC-Checkout
in Windows-PowerShell, ohne zusätzlichen Projektpfad als Argument. Das Skript
startet die festgelegte Windows-Tauri-CLI aus einem lokalen temporären Verzeichnis;
es verwendet weder WSL-`node_modules` noch einen UNC-Arbeitsordner für CMD.
`-KeyPath` bezeichnet ausschließlich eine neue private Schlüsseldatei auf einem
lokalen Windows-Laufwerk außerhalb des Repositorys.

Ein nicht leeres Passwort vergeben. Standardpfad des privaten Schlüssels:
`%LOCALAPPDATA%\FBForge\signing\connect-updater.key`. Das Skript überschreibt
keine vorhandenen Schlüssel und legt den privaten Schlüssel nicht im Repository ab.
Privaten Schlüssel und Passwort sicher sichern; im Repository wird nur der
öffentliche Prüfschlüssel `desktop/update-public-key.txt` übernommen. Diesen Commit
vor dem offiziellen Build validieren. Mit dem Prüfschlüssel kann die App zukünftige
Pakete prüfen; ein öffentlich geteilter privater Testschlüssel ist dafür ungeeignet.

Für die offizielle Signierung das Passwort über den geschützten lokalen
Signierablauf als `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` bereitstellen. Ein abweichender
Dateipfad kann als `TAURI_SIGNING_PRIVATE_KEY_PATH` gesetzt werden. Diese Werte
nicht in Skripte, Workflow-Dateien, Konsolentranskripte oder das Repository schreiben.
Das Passwort kann beim Start des interaktiven Signier-Runners ausschließlich für dessen Prozess bereitgestellt werden. Im Runner-Verzeichnis mit `run.cmd`:

```powershell
$secureUpdatePassword = Read-Host 'Passwort des Update-Signaturschlüssels' -AsSecureString
try {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new('', $secureUpdatePassword).Password
    .\run.cmd
} finally {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    $secureUpdatePassword.Dispose()
}
```

Dazu denselben Windows-Benutzer wie bei der Schlüsselerzeugung verwenden. Dies schreibt das Passwort weder ins Repository noch als dauerhafte Benutzer-Umgebungsvariable. Die Update-Signatur ergänzt das vorhandene Windows-Zertifikat und ist davon unabhängig.

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

Unter Windows zusätzlich die vollständigen nativen Tests ausführen:

```powershell
cargo +1.99.0 test --manifest-path desktop/Cargo.toml --locked
```

Installation, Upgrade und NVDA werden im Workflow `Windows release validation` geprüft. Die [Beitragsanleitung](CONTRIBUTING.md) beschreibt Live-Tests und die getrennte Signierung von Veröffentlichungspaketen.

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

Der manuelle Workflow `Real TEST exchange acceptance` installiert bei
`local_scanner=true` die optionale Komponente aus dem angegebenen erfolgreichen
Windows-Validierungslauf. Er prüft den echten v2/v3-Nachrichtenfluss mit lokalem
ClamAV. Ein zusätzlicher, ausschließlich lokaler ICAP-Testdienst meldet für eine
festgelegte harmlose Anlage einen kontrollierten Befund: Die übrigen Inhalte
bleiben lesbar, das Vollarchiv bleibt gesperrt und die ausdrücklich bestätigte
Einzelannahme muss genau diesen Anlagenbezug im signierten Event Log enthalten.
Dieser Interoperabilitätstest verschickt keine EICAR-Datei und ersetzt den oben
beschriebenen echten Erkennungstest nicht. Er benötigt die eingerichteten
TEST-Zugangsdaten und verändert ausschließlich seine eigene Test-Destination.

Der rein lesende Workflow `Check ClamAV upstream release` meldet wöchentlich oder
bei manuellem Start eine neuere offizielle Engine-Version. Er installiert oder
veröffentlicht nichts. Ein Engine-Update erfordert neue geprüfte Hashes, Quellen
und die erneute Komponenten-Abnahme; Signaturupdates ersetzen kein Engine-Update.

Für die gezielte Windows-Abnahme einer Scanner-Änderung kann `Windows release
validation` mit `scanner_only=true` gestartet werden. Dieser Modus baut keinen
Installer und ersetzt keine vollständige Release-Validierung oder Signierfreigabe.
