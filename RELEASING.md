# Release vorbereiten und veröffentlichen

Für 0.3.0 ist eine reguläre Version ohne Alpha-, Beta- oder RC-Zusatz vorgesehen.
Main behält seine veröffentlichte Historie; `v0.2.0` bleibt unverändert.
Die Entwicklung liegt auf `release/0.3.0`. `fix/0.2.1` ist vollständig darin zusammengeführt; ein gesondertes 0.2.1-Release ist nicht vorgesehen.
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
- Geschützte Aufbewahrung, Neustart, Profil-Backup und Upgrade von der veröffentlichten Version 0.2.0.
  Ein normaler Download speichert entschlüsselte Dateien außerhalb der geschützten Vorgangsablage.
- Tastaturbedienung, Screenreader, Textvergrößerung, schmale Fenster und beide Farbschemata.
- Abhängigkeiten gegen aktuelle Sicherheitsmeldungen prüfen, einschließlich aufgelöster Maven-
  Abhängigkeiten und plattformspezifischer Rust-Pfade. Bekannte Hinweise und ihre Bewertung unter
  [SECURITY.md](SECURITY.md) aktualisieren. JDK und WebView2 benötigen zusätzlich aktuelle Sicherheitsupdates.
- Die in der Anwendung verlinkte [0.3-Anleitung](https://fbforge.de/connect/hilfe/0.3/start)
  vor der Veröffentlichung auf der Website bereitstellen und ihre Links im Browser prüfen.

Die Windows-Workflows können diese Prüfung mit den hinterlegten TEST-Zugängen ausführen.
Zuerst `Windows release validation` für den vollständigen Branch-Commit starten. Danach
`Real TEST exchange acceptance` auf demselben Branch mit `confirm_test_writes=true`,
`local_scanner=true` und der erfolgreichen Lauf-ID als `validation_run` starten. Der
Lauf mit `validation_run` installiert genau den unabhängig geprüften Kandidaten
und bedient dessen echte WebView2-Oberfläche samt nativen Dialogen. Bleibt der
Produktcode unverändert, kann
derselbe validierte Installer mit einem korrigierten Abnahmetreiber erneut geprüft
werden. Nach Änderungen am Produkt ist die Windows-Validierung zu wiederholen.
Ohne `validation_run` wird nur der native Kern geprüft, keine installierte
Desktop-Oberfläche.

Der Live-Lauf verwendet fiktive Inhalte und eine eigens angelegte TEST-Destination.
Er protokolliert ihre Deaktivierung und die serverseitige Löschfrist. Zugangsdaten,
Schlüssel und geschützte Sicherungen werden nicht als Artefakte hochgeladen.
`ui_probe=true` prüft separat App-Start, optionalen Scanner und native Dateiexporte
ohne Zugangsdaten und TEST-Schreibzugriffe. Mit `local_scanner=true` prüft die Probe
auch den ausdrücklichen Abbruch eines echten FreshClam-Signaturupdates.
`review_only=true` begrenzt die echte
UI-Prüfung auf die neuen 0.3-Funktionen. Beide Modi ersetzen keine vollständige
Live-Abnahme.

Live-Tests bevorzugt in TEST ausführen. Produktive Schreibaktionen einzeln und bewusst bestätigen.
Automatisierte Tests ersetzen weder eine fachliche Prüfung noch eine formale Sicherheitszertifizierung.

## 2. Branches übernehmen

Der vorgesehene Weg ist `release/0.3.0` → `main`. Neue Änderungen entstehen auf
`feature/...`-, `fix/...`- oder `release/...`-Branches. Ein zusätzlicher Develop-Branch
ist nicht vorgesehen. Die Übernahme nach Main erfolgt nach Prüfung per Pull Request.

Die nachvollziehbaren, thematischen Commits bleiben erhalten; ein ganzer Release wird
nicht pauschal zu einem Commit zusammengefasst. Bei der bestehenden linearen Historie
wird Rebase-Merge verwendet. Dabei ändern sich Commit-IDs; deshalb wird der entstandene
Main-Stand vor Signierung und Tag erneut exakt validiert. Merge-Verknüpfungen aus den
Arbeitsbranches werden nicht in die lineare Main-Historie übernommen.

Bei der Übernahme die im Repository konfigurierten Branchregeln einschließlich
Status-, CodeQL- und Code-Quality-Prüfungen beachten. Lösch- und Force-Push-Sperren
nicht für den Release umgehen.
Veröffentlichte Historie und Tags bleiben unverändert. Falls Main inzwischen weitere
Änderungen enthält, werden diese vor der abschließenden Abnahme integriert.

Ein Commit benötigt keine neue veröffentlichte Version. Versionssprung, Installer,
Signierung und Tag gehören zur bewussten Veröffentlichung nach der Abnahme.

Versionsdateien und Versionshinweise vor der letzten Abnahme fertigstellen. Ein abschließender Commit
`chore: prepare 0.3.0` kann diese Änderungen enthalten. Ein zusätzlicher leerer Commit ist nicht erforderlich.
Danach keine Änderungen mehr in den zu veröffentlichenden Stand aufnehmen.

## 3. Exakten Stand auf Main validieren und signieren

### Signier-Runner einmalig einrichten

1. Einen eigenen Windows-x64-Runner mit Label `fbforge-signing` unter einem separaten
   Windows-Benutzer einrichten. Buildwerkzeuge, Windows SDK und lokalen Signaturdienst
   installieren. Den Runner interaktiv starten, nicht als Dienst. Das Zertifikat
   muss im Zertifikatspeicher dieses Benutzers verfügbar sein.
2. Das GitHub-Environment `windows-signing` mit `FBForge` als einzigem Required
   Reviewer einrichten. „Prevent self-review“ bleibt ausgeschaltet, damit der
   Eigentümer seinen eigenen Lauf freigeben kann.
3. Repository-Variablen `WINDOWS_SIGNING_THUMBPRINT` und `WINDOWS_TIMESTAMP_URL`
   setzen: öffentlicher Zertifikatsfingerabdruck ohne Leerzeichen und RFC-3161-
   Zeitstempelserver. Keine Zugangsdaten oder TOTP-Geheimnisse in GitHub speichern.
4. Den passenden privaten Update-Schlüssel und dessen Passwort nach
   [BUILDING.md](BUILDING.md#update-signierung-einmalig-einrichten) lokal bereitstellen.
   Den bereits hinterlegten öffentlichen Projekt-Prüfschlüssel beibehalten.

Externe Fork-PR-Workflows benötigen eine manuelle Freigabe und dürfen niemals auf
dem Signier-Runner ausgeführt werden. Den Runner ausschließlich für den manuellen
Signierjob verwenden und außerhalb der Signierung anhalten. GitHub bietet manuelle
Workflows erst an, wenn deren Definition im Default-Branch liegt.

### Für jeden Release

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
`scripts/export-wiki.mjs` exportieren die Web-Anleitung und die 0.3-Wiki-Kapitel.
Vorhandene 0.1- und 0.2-Kapitel bleiben für Nutzer der früheren Version erhalten.

Die 0.3-Anleitung vor der Softwareveröffentlichung aus dem vorbereiteten Website-Branch
`release/connect-0.3.0` in `FBForge/fbforge` bereitstellen. Ein PR oder Merge wird erst im ausdrücklich beauftragten Release-Prozess erstellt. Bis dahin müssen Downloadlinks und Release-Metadaten weiter auf
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

Der öffentliche Projekt-Prüfschlüssel ist bereits in `desktop/update-public-key.txt`
hinterlegt. Vor der Signierung den dazugehörigen privaten Schlüssel nach
[BUILDING.md](BUILDING.md#update-signierung-einmalig-einrichten) auf dem Signierrechner
bereitstellen; für einen Build keinen neuen Schlüssel erzeugen. Ein fehlender oder
falscher Schlüssel ist ein Freigabeblocker. Der private Schlüssel und sein Passwort bleiben
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

Vor der 0.3.0-Freigabe den integrierten Update-Ablauf gesondert prüfen:
Hinweis, Download, Abbruch, ungültige Signatur, offene Aktionen, gesicherte Profile,
NSIS-Update, Neustart und erneute Anmeldung. Dafür sind eine ältere Testinstallation
mit eingebautem Updater und ein neueres, zur Version passend signiertes Paket
erforderlich; Testaufbau und Ergebnis dokumentieren. Version 0.2.0 hat keinen
Updater und kann diesen Ablauf nicht prüfen. Das Upgrade von 0.2.0 erfolgt durch
manuelles Installieren und prüft Installer sowie Profilerhalt. Diese Abnahme
ersetzt die Bedienung des integrierten Updaters nicht.

Die einmalige Schlüsselerzeugung einschließlich Aufruf aus einem WSL-UNC-Checkout
ist ausschließlich in [BUILDING.md](BUILDING.md#update-signierung-einmalig-einrichten)
beschrieben. Bereits vorhandene private Schlüssel werden nicht überschrieben.

## Optionale Scanner-Komponente ab 0.3.0

Windows-Validierung und Signierlauf führen `stage:scanner` aus. Das Setup bietet
die Komponente ausdrücklich abwählbar an; stille Installationen können
`/SCANNER=0` oder `/SCANNER=1` vor dem abschließenden `/D=...` verwenden. Ein Upgrade
erhält die Auswahl. Mitgelieferte Engine-Dateien werden nicht neu signiert oder
verändert; ihre offiziellen Hashes bleiben Bestandteil der App-Vertrauensgrenze.

Der Signierlauf bewahrt unter `windows-scanner-component` die genau zu diesem
Build gehörende Distribution mit Engine, datierten Datenbanken, zugehörigem
Quellarchiv, Originalsignatur und allen Lizenzhinweisen auf. `attach-candidate.py`
prüft Herkunft und Dateien und hängt diese vollständige Distribution zusätzlich
an den unveröffentlichten Entwurf. Das Archiv enthält das separat importierbare
Komponenten-ZIP. Quellen und Hinweise müssen zusammen mit der Binärkomponente
öffentlich verfügbar bleiben. Nicht nur das innere Komponenten-ZIP veröffentlichen.

Vor Freigabe Setup mit und ohne Komponente, Erhalt der Auswahl beim Upgrade,
Nachinstallation, Signaturimport/-update und Prozessende prüfen. EICAR nur lokal
oder in einer ausdrücklich eigenen TEST-Konstellation verwenden; keine Funde an
fremde Empfänger oder nach STAGE/PROD schicken. Einzelannahme mit Anlagenproblemen
bestätigt die Nachricht insgesamt. Problembezüge in den signierten Event Logs
prüfen; es gibt keinen separaten serverseitigen Anlagenannahmestatus.
