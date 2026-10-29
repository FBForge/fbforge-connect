# Lokal bauen

Das Desktop-Paket wird auf Windows x64 gebaut. Frontend, Java-Engine und isolierte Rust-Module können auch unter Linux und macOS entwickelt und getestet werden. Desktop-Pakete für diese Systeme werden derzeit nicht ausgeliefert. Die geschützte Profilspeicherung benötigt Windows-DPAPI.

## Voraussetzungen

- Git und Node.js ab 22.13.0. Die CI verwendet Node.js 24.20.0.
- Ein vollständiges JDK 25 mit `javac` und `jlink`. `JAVA_HOME` muss auf dessen Installationsverzeichnis zeigen.
- Python 3.10 oder neuer für die lokalen Prüfungen. Unter Windows muss `python`, unter Linux und macOS `python3` im `PATH` verfügbar sein.
- Rust über rustup. Die benötigte Version steht in `desktop/rust-toolchain.toml`.
- Für Windows: Visual Studio Build Tools mit „Desktopentwicklung mit C++“, MSVC-x64-Werkzeugen und Windows SDK. Außerdem Microsoft Edge WebView2 Runtime. Einzelheiten stehen in den [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/).

Maven wird durch den mitgelieferten Wrapper geladen. Für den ersten Build ist Internet erforderlich. Zugangsdaten zu FIT-Connect oder ein Signaturzertifikat sind zum Bauen und für die lokalen Tests nicht erforderlich.

Die folgenden Befehle bauen den ausgecheckten Stand. Veröffentlichte Versionen lassen sich nach dem
Klonen über ihren Release-Tag auschecken, zum Beispiel mit `git switch --detach v0.2.0`, sobald dieser
Tag veröffentlicht ist. Neue Entwicklung liegt auf dem jeweiligen Arbeitsbranch,
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

```powershell
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

Der Projekteigentümer erzeugt das dauerhafte Schlüsselpaar **auf dem Windows-
Signierrechner**. Für die einmalige Ersteinrichtung aus dem Checkout ausführen:

```powershell
.\scripts\setup-update-signing.ps1
```

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
node scripts/fetch-public-schemas.mjs
npm run test:ui
cargo +1.99.0 fmt --manifest-path desktop/Cargo.toml --all -- --check
cargo +1.99.0 fmt --manifest-path desktop/native-contracts/Cargo.toml --all -- --check
```

Die öffentlichen Schema-Fixtures werden vor dem Speichern anhand ihrer Prüfsummen geprüft. Ohne diesen Download werden die zugehörigen Integrationstests übersprungen. Auf Linux kann Playwright zusätzlich Systembibliotheken benötigen. Dafür `npx playwright install --with-deps chromium` verwenden, sofern Systempakete installiert werden dürfen.

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
