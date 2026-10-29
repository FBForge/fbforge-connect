# Release vorbereiten und veröffentlichen

Für 0.3.0 ist eine reguläre Version ohne Alpha-, Beta- oder RC-Zusatz vorgesehen.
Main behält seine veröffentlichte Historie; `v0.2.0` bleibt unverändert.
Die Entwicklung liegt auf `release/0.3.0`, getrennt von den 0.2.1-Fixes.
Die Veröffentlichung bleibt eine bewusste Aktion nach abgeschlossener Abnahme.

## 1. Lokal abnehmen

Den aktuellen Stand von `release/0.3.0` beziehen und nach [BUILDING.md](BUILDING.md) bauen.
Wer das separate PowerShell-Skript für WSL-Quellen verwendet, aktualisiert zuerst die WSL-Arbeitskopie
und wiederholt anschließend seinen bisherigen Buildaufruf mit den bisherigen Signierparametern.
Das Skript ist eine lokale Arbeitshilfe und gehört nicht zu den Voraussetzungen des Projekts.

Vor dem Release auf dem Windows-Zielgerät prüfen:

- Anmeldung mit gespeichertem Profil und temporären Zugangsdaten. API-Wechsel in beide Richtungen,
  getrennte Schlüssel und Vorgänge sowie Verhalten bei fehlgeschlagener Anmeldung.
- Versand, Empfang und Antwort mit den tatsächlich verwendeten JSON- und XML-Schemata.
  STAGE und PROD benötigen gültige V-PKI-Zertifikate samt Kette und erreichbare Sperrprüfungen.
- Einzelannahme mit und ohne Download. Bei gewähltem Download müssen Metadaten, Fachdaten und Anlagen
  vor der Annahme vollständig gespeichert sein. Abbruch der Ordnerwahl und Speicherfehler dürfen
  keine Annahme auslösen. Die Freigabe einer vorbereiteten Empfangsaktion gilt höchstens 60 Sekunden.
- Sammelannahme mit gültigen und fehlerhaften Einreichungen. Schema- und Entschlüsselungsfehler
  bleiben manuell. Es gibt keine automatische Ablehnung. Fachliche Fehler können technisch gültig sein.
- „Auswahl herunterladen“ übermittelt keine Empfangsbestätigung und benötigt erfolgreiche
  Entschlüsselung und technische Prüfung. Ungeprüfte Rohdaten werden nicht exportiert.
- Geschützte Aufbewahrung, Neustart, Profil-Backup und Upgrade von der veröffentlichten 0.1-Version.
  Ein normaler Download speichert entschlüsselte Dateien außerhalb der geschützten Vorgangsablage.
- Tastaturbedienung, Screenreader, Textvergrößerung, schmale Fenster und beide Farbschemata.
- Abhängigkeiten gegen aktuelle Sicherheitsmeldungen prüfen, einschließlich aufgelöster Maven-
  Abhängigkeiten und plattformspezifischer Rust-Pfade. Bekannte Hinweise und ihre Bewertung unter
  [SECURITY.md](SECURITY.md) aktualisieren. JDK und WebView2 benötigen zusätzlich aktuelle Sicherheitsupdates.
- Die in der Anwendung verlinkte [0.2-Anleitung](https://fbforge.de/connect/hilfe/0.2/start)
  vor der Veröffentlichung auf der Website bereitstellen und ihre Links im Browser prüfen.

Live-Tests bevorzugt in TEST ausführen. Produktive Schreibaktionen einzeln und bewusst bestätigen.
Automatisierte Tests ersetzen weder eine fachliche Prüfung noch eine formale Sicherheitszertifizierung.

## 2. Branches übernehmen

Der vorgesehene Weg ist `release/0.3.0` → `main`. Neue Änderungen entstehen auf eigenen
`feature/...`-, `fix/...`- oder `release/...`-Branches und werden per Pull Request gegen Main geprüft.
Die aktiven Regeln verlangen eine lineare Historie, erfolgreiche Statusprüfungen sowie CodeQL-
und Code-Quality-Ergebnisse. Lösch- und Force-Push-Sperren bleiben eingeschaltet.

Unveröffentlichte Änderungen können im vereinbarten Umfang zusammengefasst werden.
Veröffentlichte Historie und Tags bleiben unverändert. Ein geänderter Commit benötigt
eigene Prüfungen; frühere Ergebnisse ersetzen seine Windows-Abnahme nicht.

Die Übernahme zuerst per Pull Request prüfen lassen. Ist Main ein Vorfahr des geprüften
Release-Stands, wird dieser per Fast-forward übernommen. So übernimmt Main denselben geprüften
Release-Commit. Der Quell-Commit wird dabei nicht verändert.
Eine solche Übernahme ist auch ohne Merge-Commit mit der linearen Historie vereinbar.
Die Branchregeln und die erforderlichen Prüfungen gelten weiterhin für den Push.

Falls Fast-forward nicht möglich ist, zuerst einen neuen Integrationsbranch mit den zwischenzeitlichen
Änderungen vorbereiten und erneut prüfen. Keine geschützte Historie ersetzen und keinen Force-Push nutzen.
Nicht bei jeder Weitergabe dieselben Änderungen erneut zusammenfassen oder neu schreiben.

Versionsdateien und Versionshinweise vor der letzten Abnahme fertigstellen. Ein abschließender Commit
`chore: prepare 0.3.0` kann diese Änderungen enthalten. Ein zusätzlicher leerer Commit ist nicht erforderlich.
Danach keine Änderungen mehr in den zu veröffentlichenden Stand aufnehmen.

## 3. Exakten Stand auf Main validieren und signieren

1. Den vollständigen Commit-SHA auf Main festhalten und die normalen `Checks` abwarten.
2. `Windows release validation` manuell auf Main starten. Für den Upgrade-Test unter `upgrade_run`
   einen erfolgreichen Signierlauf mit einem noch verfügbaren, veröffentlichten Vorgängerpaket angeben.
   Dieser Lauf muss vollständig erfolgreich sein, einschließlich Installation, Profilerhalt und NVDA.
3. `Sign Windows candidate` ebenfalls auf Main starten. Als `validation_run` die numerische Lauf-ID
   genau dieser erfolgreichen Windows-Abnahme angeben. Branch und Commit müssen übereinstimmen.
4. Den interaktiven Windows-Runner mit Label `fbforge-signing` bereitstellen und den Job im Environment
   `windows-signing` freigeben. Die vorhandenen Signier-Variablen und das lokale Zertifikat verwenden.
5. Den gesamten Signierlauf einschließlich `verify-package` abwarten. Er prüft Anwendung,
   Deinstallationsprogramm, Setup, Zeitstempel, Installation und Upgrade unabhängig.
6. Das geprüfte Setup aus `windows-alpha-signed-setup` herunterladen. Dieser bestehende Artefaktname
   ist ein interner Workflow-Bezeichner. Die Paketversion muss 0.3.0 entsprechen.

Ein früher lokal gebautes Setup ist für den manuellen Test geeignet. Das Veröffentlichungspaket muss
zum exakten freigegebenen Main-Commit gehören. Nach jeder weiteren Codeänderung beginnt die Abnahme neu.

## 4. Release-Entwurf, Tag und Dateien

Einen unveröffentlichten GitHub-Release-Entwurf mit Titel `0.3.0`, Tagname `v0.3.0` und dem vollständigen
geprüften Main-SHA als Ziel vorbereiten. „Pre-release“ bleibt ausgeschaltet.
Die Beschreibung aus dem Abschnitt 0.3.0 in [RELEASE_NOTES.md](RELEASE_NOTES.md) übernehmen.

`Attach verified candidate to draft` hängt ausschließlich das unabhängig geprüfte Paket an den Entwurf.
Erforderlich sind Signierlauf-ID, exakter Commit, Installer-SHA-256, Version `0.3.0` und Entwurfs-ID.
Die Zuordnung von Paket, Version und Commit wird geprüft. Der Workflow veröffentlicht nichts.

Vor dem Veröffentlichen Setup, `SHA256SUMS.txt`, `build-info.json` und `signature-info.json` kontrollieren.
Der endgültige Tag muss auf den geprüften Quell-Commit zeigen. Erst danach den Entwurf veröffentlichen.
Keine Tags früherer Versionen umbenennen und kein bereits veröffentlichtes Paket austauschen.

## 5. Dokumentation und Website

Die Quelle der Anleitung ist `docs/guide/`. Sie enthält ausschließlich fiktive Beispiele und Bilder.
`scripts/capture-help.mjs` erzeugt aktuelle Bilder. `scripts/export-guide.mjs` und
`scripts/export-wiki.mjs` exportieren die Web-Anleitung und die 0.2-Wiki-Kapitel.
Vorhandene 0.1-Kapitel bleiben für Nutzer der früheren Version erhalten.

Die 0.2-Anleitung vor der Softwareveröffentlichung über den vorbereiteten Website-PR in
`FBForge/fbforge` bereitstellen. Bis dahin müssen Downloadlinks und Release-Metadaten weiter auf
das tatsächlich veröffentlichte Paket zeigen. Nach Veröffentlichung übernimmt `Update project information`
die neuen Release-Metadaten und den tatsächlichen Installer-Link. Keine Download-URL vorab erfinden.
Main-Pushes und Projektaktualisierungen können bei aktiviertem `DEPLOY_ENABLED` ein Deployment auslösen.
Die Produktionseinstellungen vor der Übernahme prüfen. Anleitung, Downloadseite und Wiki anschließend
im Browser öffnen. Auf Screenshots dürfen keine echten Zugangsdaten, privaten Schlüssel oder Antragsdaten stehen.

Erst nach erfolgreicher Übernahme nicht mehr benötigte Arbeitsbranches entfernen.
Main, veröffentlichte Tags und Releases bleiben erhalten.

## Actions nach der Abnahme aufräumen

Überholte Entwicklungs- und Fehlversuchsläufe können nach der endgültigen Abnahme
gelöscht werden. Die erfolgreichen Prüfungen des aktuellen Release-Commits und die
Signierläufe veröffentlichter Pakete samt benötigter Upgrade-Grundlage erhalten.
Das Löschen eines Laufs entfernt auch seine Logs und Artefakte; die Signier- und
Release-Workflows benötigen diese Zuordnung weiterhin. Laufende Jobs erst abschließen
oder bewusst abbrechen, niemals eine noch verwendete Paketquelle entfernen.

## Update-Pakete ab 0.3.0

Vor dem ersten offiziellen Build den eigenen Update-Schlüssel nach [BUILDING.md](BUILDING.md)
einrichten und den öffentlichen Schlüssel committen. Ein fehlender oder falscher
Schlüssel ist ein Freigabeblocker. Der private Schlüssel und sein Passwort bleiben
auf dem interaktiven Signierrechner und werden nicht als Release-Artefakt hochgeladen.

Der Signierjob erstellt die zusätzliche Tauri-Signatur **nach** der abschließenden
Authenticode-Signierung des Setups. `--app-version` bindet die Version an die Signatur.
`scripts/update-release.py` erzeugt `latest.json` für genau diesen Installer und
vermerkt den öffentlichen Schlüssel im Herkunftsnachweis. Der unabhängige Windows-
Runner prüft diese Signatur mit `verify-update` und dem Prüfschlüssel desselben
Quell-Commits, bevor er das Paket zur Veröffentlichung bereitstellt.

Der geprüfte Kandidat enthält zusätzlich zum bisherigen Paket `<Installer>.sig`
und `latest.json`. `attach-candidate.py` übernimmt diese Dateien unverändert in den
weiterhin unveröffentlichten Entwurf. Erst das vollständige stabile Release darf
als neueste Version veröffentlicht werden. Danach die öffentliche URL
`https://github.com/FBForge/fbforge-connect/releases/latest/download/latest.json`
und den darin verlinkten, signierten Installer prüfen. Kein separates Neusignieren
oder Neubauen nach der Kandidatenprüfung.

Vor der 0.3.0-Freigabe ein echtes Update vom installierten Vorgänger prüfen:
Hinweis, Download, Abbruch, ungültige Signatur, offene Aktionen, gesicherte Profile,
NSIS-Update, Neustart und erneute Anmeldung. Dieser erste manuelle Installationsschritt
bleibt für Versionen ohne eingebauten Updater erforderlich. Die vorhandene Prüfung
von Neuinstallation und Upgrade ersetzt die Bedienung des Updaters nicht.

Das Schlüssel-Skript kann auch aus einem WSL-UNC-Checkout in Windows-PowerShell aufgerufen werden: `./scripts/setup-update-signing.ps1` ohne Projektpfad als Argument. Es startet die exakt gepinnte Windows-Tauri-CLI aus einem lokalen temporären Verzeichnis, damit CMD weder am UNC-Arbeitsverzeichnis noch an Linux-`node_modules` scheitert. `-KeyPath` bezeichnet ausschließlich eine neue lokale Datei außerhalb des Repositorys; standardmäßig liegt sie unter `%LOCALAPPDATA%\FBForge\signing\connect-updater.key`. Vorhandene Schlüssel werden nicht überschrieben.
