# Release vorbereiten und veröffentlichen

0.3.0 ist noch nicht veröffentlicht. Die Entwicklung liegt auf `release/0.3.0`,
einschließlich der ursprünglich für 0.2.1 vorgesehenen Korrekturen. Der
[Prüfbericht](docs/design-review/README.md) nennt den abgenommenen Stand und offene
Freigabepunkte. Ein erfolgreicher Branch-Test ersetzt keine Freigabe des endgültigen Main-Pakets.

## Live-Abnahme

1. Nach [BUILDING.md](BUILDING.md) bauen und die normalen `Checks` ausführen.
2. `Windows release validation` für den vollständigen Commit starten. Der Workflow
   prüft Installation, Profilerhalt, NVDA und lesende TEST-Aufrufe. Mit `upgrade_run`
   eine geprüfte signierte Vorgängerversion für den Upgrade-Test wählen.
3. `Real TEST exchange acceptance` auf demselben Branch mit `confirm_test_writes=true`,
   `local_scanner=true` und der erfolgreichen Lauf-ID als `validation_run` starten.
   Er installiert genau diesen unabhängig geprüften Kandidaten und bedient seine
   WebView2-Oberfläche samt nativen Dialogen mit echten TEST-Zugängen.

Benötigte Actions-Secrets: `SENDERID`, `SENDERSECRET`, `SENDERDEST`, `SUBSCRIBERID`
und `SUBSCRIBERSECRET`. Der Sender benötigt eine aktive eigene Typ-C-Destination
mit Verwaltungsrechten und bereits freigegebenen Metadatenversionen 2.0.0 und 3.0.0.
Der Subscriber benötigt Destination-Verwaltung und Empfang. Die vorhandene
Sender-Destination wird nicht verändert. Alle Schreibtests verwenden fiktive Daten
und eine eigens angelegte TEST-Destination. Diese wird anschließend deaktiviert.
Die früheste Löschung nach `canBeDecommissionedAt` sowie Eigentümer und Zustand
vor einer späteren Löschung erneut prüfen. Schlüssel und Sicherungen werden nicht hochgeladen.

Die Absenderbeschränkungsprobe erlaubt nur die konfigurierte Sender-Destination,
prüft v2/v3 mit leeren Client-Freigaben und nimmt die Beschränkung wieder zurück.
Bearbeitungen betreffen ausschließlich die neue Test-Destination.

| Modus | Umfang |
| --- | --- |
| Ohne `validation_run` | Nur nativer Kern, keine installierte Oberfläche |
| `ui_probe=true` | App-Start, reguläres Fensterschließen mit Neustart und NVDA ohne TEST-Zugänge. Standardmodus: native Dateiexporte, bei lokalem Scanner auch Start und Signaturupdate-Abbruch. Online-Modus siehe unten. |
| `ui_only=true` | Vollständige installierte Client-Abnahme mit echter TEST-Verbindung und validiertem Installer. Die separate SDK-Matrix wird ausdrücklich nicht ausgeführt. |
| `review_only=true` | Neue 0.3-Oberflächenfunktionen und vollständiger nativer TEST-Austausch |
| Keine Umfangsbeschränkung | Separate SDK-Matrix und vollständige Oberflächenabnahme des angegebenen Installers |

`ui_only` benötigt eine gültige `validation_run` und ist nicht mit `ui_probe`
kombinierbar. Die Ausgabe benennt den begrenzten Umfang ausdrücklich. Ein Fehler in
der normalen SDK-Matrix bleibt ein Fehler und wird nicht automatisch wiederholt.
Getrennte Läufe helfen, Plattformstörungen von der Client-Abnahme zu unterscheiden.

Mit `online_scanner=true` beginnt die Oberfläche ohne installierte Scanner-Komponente.
Die Abnahme prüft Online-Einrichtung, ausdrücklichen Abbruch und erneuten Versuch.
Zusammen mit `ui_probe=true` prüft sie diese Einrichtung gezielt ohne FIT-Connect-Zugang
oder Test-Destination. Anschließend prüft sie echte NVDA-Sprachausgabe mit dem aktuellen
Testtreiber am selben validierten Installer. Der vollständige Austausch bleibt ein
eigener anschließender Lauf.
Der installierte Client nutzt einen eigenen lokalen CONNECT-Proxy mit künstlichen
Proxy-Zugangsdaten. OAuth und FIT-Connect müssen darüber kommunizieren. TLS bleibt
unverändert geprüft, Tunnelinhalte und Zugangsdaten werden nicht protokolliert.
Ein Testablauf wird nach regulärem Fensterschließen samt Profilzuordnung wiederhergestellt.
Beim ersten App-Start und beim Fortsetzen eines Durchlaufs nach dem Neustart
wartet die Scanner-Abnahme auf den tatsächlich bereiten und aktiven lokalen Scanner. Während des Datenbankstarts bleibt die Inhaltsfreigabe
mit `scanner_busy` gesperrt. Dieser Zustand ist kein erfolgreicher Scan.

Bei unverändertem Produktcode darf ein korrigierter Abnahmetreiber denselben
validierten Installer erneut prüfen. Produktänderungen benötigen eine neue
Windows-Validierung. Der lokale WebView2-Debuggingzugang bleibt im isolierten
CI-Prozess auf Loopback. Auf administrativen Hosted-Runnern werden notwendige
HKLM-Overrides nur für die Client-Kennungen gesetzt und danach entfernt.
Vorhandene Overrides werden nicht überschrieben.

Vor Freigabe die tatsächlich verwendeten Schemata, Umgebungen und Berechtigungen
berücksichtigen. TEST-Nachweise gelten nicht automatisch für STAGE/PROD.
V-PKI benötigt vollständige Ketten und erreichbare Sperrprüfungen. Außerdem prüfen:

- Anmeldung, API-/Profilwechsel und Abbruch bei offenen Entwürfen.
- Versand, Antworten, Annahme/Ablehnung und Downloads mit gültigen und fehlerhaften
  Daten. Fehlgeschlagene oder abgebrochene Downloads dürfen keine Annahme auslösen.
  Vorbereitete Empfangsaktionen gelten höchstens 60 Sekunden.
- Geschützte Aufbewahrung, Sicherung, Neustart, Tastatur, Skalierung und Screenreader.
- Abhängigkeiten einschließlich Maven-, Rust- und Plattformpfaden gegen aktuelle
  Meldungen prüfen und [SECURITY.md](SECURITY.md) aktualisieren.

## Branch und Veröffentlichung vorbereiten

`release/0.3.0` nach Prüfung per Pull Request nach `main` übernehmen. Thematische
Commits erhalten. Bei Rebase-Merge ändern sich IDs, daher den entstandenen Main-SHA
neu validieren. Branchregeln, erforderliche Prüfungen und Force-Push-/Löschsperren
beachten. Veröffentlichte Historie, Pakete und Tags unverändert lassen.

Versionsdateien und [Versionshinweise](RELEASE_NOTES.md) vor der letzten Abnahme
fertigstellen. Danach keine weiteren Änderungen in den freizugebenden Stand aufnehmen.
Ein Entwicklungscommit benötigt weder eine neue Version noch einen leeren Release-Commit.

## Signier-Runner einrichten

- Eigenen Windows-x64-Runner mit Label `fbforge-signing` unter einem separaten
  Benutzer interaktiv starten. Buildwerkzeuge, Windows SDK, lokaler Signaturdienst
  und Zertifikat im Speicher dieses Benutzers müssen verfügbar sein.
- Environment `windows-signing` mit `FBForge` als einzigem Required Reviewer.
  „Prevent self-review“ bleibt aus, damit der Eigentümer eigene Läufe freigeben kann.
- `WINDOWS_SIGNING_THUMBPRINT` und `WINDOWS_TIMESTAMP_URL` als Repository-Variablen
  setzen. Keine Passwörter oder TOTP-Geheimnisse in GitHub speichern.
- Den passenden privaten Update-Schlüssel lokal bereitstellen, siehe unten.
  Externe Fork-PRs niemals auf dem Signier-Runner ausführen. Runner nur für den
  manuellen Signierjob starten. Workflows müssen dafür im Default-Branch liegen.

## Update-Signierung einmalig einrichten

`desktop/update-public-key.txt` ist die gemeinsame öffentliche Schlüsselquelle für
App, Signierung und Paketprüfung. Für Builds keinen neuen Schlüssel erzeugen.
Den vorhandenen privaten Schlüssel und sein Passwort auf dem Signierrechner
bereitstellen. Bei Verlust oder Kompromittierung ist eine Schlüsselrotation zu planen.

Nur zur erstmaligen Einrichtung auf dem Windows-Signierrechner ausführen:

```powershell
.\scripts\setup-update-signing.ps1
```

Der Aufruf funktioniert auch aus einem WSL-UNC-Checkout ohne zusätzlichen Projektpfad.
Das Skript verwendet die festgelegte Windows-Tauri-CLI in einem lokalen temporären
Verzeichnis und überschreibt keine vorhandenen Schlüssel. `-KeyPath` bezeichnet
eine neue private Datei auf einem lokalen Laufwerk außerhalb des Repositorys.
Standard: `%LOCALAPPDATA%\FBForge\signing\connect-updater.key`. Ein nicht leeres
Passwort vergeben und beides sicher sichern. Nur den öffentlichen Prüfschlüssel
in Git übernehmen. Die zusätzliche `.pub` neben dem privaten Schlüssel ist beabsichtigt.

Für den interaktiven Runner das Passwort nur als Prozessvariable bereitstellen:

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

Denselben Windows-Benutzer wie bei der Schlüsselerzeugung verwenden.
`TAURI_SIGNING_PRIVATE_KEY_PATH` erlaubt einen abweichenden lokalen Pfad.
Privaten Schlüssel und Passwort nie in Git, Transkripte oder Artefakte übernehmen.

## Main-Kandidaten signieren und veröffentlichen

1. Den vollständigen Main-SHA festhalten, `Checks` und `Windows release validation`
   für genau diesen Commit erfolgreich abschließen. Für den Upgrade-Test einen
   erfolgreichen Signierlauf mit verfügbarem veröffentlichtem Vorgängerpaket angeben.
2. `Sign Windows candidate` auf Main mit genau dieser `validation_run` starten.
   Interaktiven Runner bereitstellen und `windows-signing` freigeben.
3. Den gesamten Lauf einschließlich `verify-package` abwarten. Geprüft werden App,
   Deinstallationsprogramm, Setup, Zeitstempel, Installation und Upgrade.
4. Einen unveröffentlichten stabilen Release-Entwurf `0.3.0` mit Tag `v0.3.0` und
   geprüftem Main-SHA vorbereiten. Beschreibung aus `RELEASE_NOTES.md` übernehmen.
5. `Attach verified candidate to draft` mit Signierlauf-ID, Commit, Installer-SHA-256,
   Version und Entwurfs-ID ausführen. Zuordnung und Herkunft werden geprüft.
6. Setup, `SHA256SUMS.txt`, `build-info.json`, `signature-info.json`, `<Installer>.sig`
   und `latest.json` prüfen. Erst danach den passenden Tag und Entwurf veröffentlichen.

`windows-alpha-signed-setup` ist ein interner Artefaktname, keine Versionsvorgabe.
Die Paketversion muss 0.3.0 sein. Die Tauri-Signatur entsteht **nach** Authenticode
und bindet mit `--app-version` die Version. `update-release.py` erzeugt das Manifest,
der unabhängige Runner prüft mit `verify-update`. Nach dieser Prüfung weder
Installer verändern noch neu bauen oder separat neu signieren.

Anschließend `https://github.com/FBForge/fbforge-connect/releases/latest/download/latest.json`
und dessen signierten Installer prüfen. Der echte integrierte Update-Test benötigt
eine ältere Installation **mit Updater** und ein neueres passend signiertes Paket:
Hinweis, Download, Abbruch, ungültige Signatur, offene Aktionen, Profilerhalt,
NSIS-Update und Neustart abnehmen. 0.2.0 besitzt keinen Updater. Sein manuelles
Installer-Upgrade prüft Profilerhalt, ersetzt aber diesen Update-Test nicht.

## Scanner-Komponente

Validierung und Signierung führen `stage:scanner` aus. Das Setup bietet die
Komponente abwählbar an. Stille Installation: `/SCANNER=0` oder `/SCANNER=1` vor
`/D=...`. Upgrades erhalten die Auswahl. Unveränderte offizielle Engine-Dateien
werden nicht neu signiert. Hashes, Quellen und Lizenzhinweise gehören zum Paket.

`windows-scanner-component` enthält die genaue Distribution mit Komponenten-ZIP,
datierten Datenbanken, passendem Quellarchiv, Originalsignatur und Lizenzhinweisen.
`attach-candidate.py` prüft und übernimmt sie in den Entwurf. Die vollständige
Distribution öffentlich mitliefern, nicht nur das innere Komponenten-ZIP.
Setup mit/ohne Komponente, Upgrade-Auswahl, Nachinstallation, Signaturimport/-update
und Prozessende prüfen. EICAR nur lokal oder in einer ausdrücklich eigenen
TEST-Konstellation verwenden. Der kontrollierte Live-ICAP-Test versendet kein EICAR.

Die Windows-Validierung vor dem Signieren mit `offline: true` starten. Das
Signiertor verlangt beide erfolgreich geprüften Installer-Artefakte.

Der Signierlauf erzeugt außerdem einen vollständigen Offline-WebView2-Installer.
Er wird getrennt installiert und geprüft. `windows-alpha-signed-offline-setup`
enthält den geprüften Offline-Kandidaten. Der Entwurf erhält ihn als
`FBForge-Connect_<Version>_windows-x64-offline.zip`. Die automatische Aktualisierung
verwendet weiterhin das normale Setup. Kein unsigniertes Offline-Artefakt veröffentlichen.

Die nativen Updater-Transporttests verwenden eine ausschließlich lokale Test-CA,
eine fiktive signierte Datei und dieselbe Produktionsprüfung. Sie prüfen echten
HTTPS-Download, Versionsbindung und Abbruch vor den Antwort-Headern. Die Datei ist
nicht ausführbar. Native Regressionen prüfen zusätzlich die tatsächlich verwendeten
Update-Zustände, Versionsbindung, fehlgeschlagene Signaturprüfungen und den
Installationsvorlauf. Abbruch, aktive Arbeit und fehlgeschlagene Profil-Checkpoints
verhindern die Installationsfreigabe. Fehler vor der Übergabe an den Installer
erhalten den geprüften Download. Nach fehlgeschlagenem Installer-Aufruf ist ein
neuer geprüfter Download erforderlich. Das ersetzt nicht die Installation des
endgültigen signierten Pakets.

## Anleitung, Website und Aufräumen

Exporte nach [CONTRIBUTING.md](CONTRIBUTING.md#anleitung-pflegen) erzeugen. Die
[0.3-Anleitung](https://fbforge.de/connect/hilfe/0.3/start) ist auf Website-Main
veröffentlicht und bis zum Software-Release als Vorbereitung gekennzeichnet.
Bei Änderungen Website und Wiki im Browser prüfen. Ältere Anleitungen erhalten.
Bei Veröffentlichung von 0.3.0 die Kennzeichnung „In Vorbereitung“ im Hilfe-Einstieg
des Website-Repositories entfernen. Die Versions- und Downloadmetadaten werden automatisch aktualisiert.
Bis zur Veröffentlichung zeigen Download und Metadaten auf das tatsächlich
veröffentlichte Paket. Danach übernimmt `Update project information` die neuen
Metadaten und den tatsächlichen Installer-Link. Main-Pushes können bei aktiviertem
`DEPLOY_ENABLED` ein Deployment auslösen, daher Produktionseinstellungen prüfen.
Keine echten Zugangsdaten oder Antragsdaten auf Bildern.

Nach Abnahme überholte Actions-Läufe und nach Übernahme nicht benötigte Branches
entfernen. Erfolgreiche Nachweise, Signierläufe und benötigte Upgrade-Paketquellen
mit Logs und Artefakten erhalten. Aktive schreibende Live-Tests nicht unterbrechen.
Main, veröffentlichte Tags und Releases bleiben erhalten. Veröffentlichung und
Deployment benötigen weiterhin einen ausdrücklich beauftragten Release-Prozess.
