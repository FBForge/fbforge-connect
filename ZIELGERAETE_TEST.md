# Kurzer Test auf dem eigenen Windows-Gerät

Dieser Test kann später erfolgen. Installation/Upgrade, Protokollabläufe und automatisierte Prüfungen werden zuvor in CI geprüft. Diese Checkliste ergänzt die Bedingungen des eigenen Geräts; sie verlangt keinen erneuten vollständigen FIT-Connect-Austausch.

## Geprüften Build festhalten

Das Installer-Artefakt aus einem erfolgreichen **Push-Lauf auf `alpha1-work`** im [Windows-Workflow](https://github.com/FBForge/fbforge-connect/actions/workflows/windows.yml) laden. Ein Pull-Request-Lauf kann einen synthetischen Merge-Commit bauen und ersetzt den Upgrade-/Live-Nachweis des vertrauten Entwicklungsbranches nicht. Bei einem neuen Installer das Protokoll neu anlegen; alte Ergebnisse nicht pauschal übertragen.

| Angabe | Für diese Abnahme ausfüllen |
| --- | --- |
| Workflow-URL / Lauf-ID | offen |
| Vollständiger Commit aus Workflow und `build-info.json` | offen |
| Version / Installerdatei / Dateigröße | offen |
| SHA-256 des Installers | offen |
| Windows-Version / WebView2 / Bildschirmauflösung | offen |
| Screenreader und Version | offen |
| Datum / prüfende Person | offen |

Commit, Repository und Lauf-ID aus `build-info.json` mit dem tatsächlich gewählten GitHub-Lauf vergleichen. Historische Pakete von vor der Repository-Umbenennung tragen noch den alten Namen. Für die lokale Dateiprüfung genügt Windows PowerShell im entpackten Ordner:

```powershell
$build = Get-Content -LiteralPath './build-info.json' -Raw | ConvertFrom-Json
$setup = @(Get-ChildItem -LiteralPath . -Filter '*-setup.exe' -File)
if ($setup.Count -ne 1 -or $setup[0].Name -ne $build.installer) { throw 'Installer nicht eindeutig' }
$actual = (Get-FileHash -LiteralPath $setup[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $build.sha256 -or $setup[0].Length -ne $build.bytes) { throw 'Paket stimmt nicht mit Manifest überein' }
$sum = (Get-Content -LiteralPath './SHA256SUMS.txt' -Raw).TrimEnd([char[]]"`r`n")
if ($sum -ne ($actual + '  ' + $setup[0].Name)) { throw 'Prüfsummendatei weicht ab' }
Write-Output ('SHA256: ' + $actual)
Write-Output ('Commit: ' + $build.commit + '; Lauf: ' + $build.runId + '; Signierung: ' + $build.signing)
```

Die Prüfsumme ist kein unabhängiger Herkunfts- oder Signaturnachweis. Die aktuelle Ausgabe ist **unsigniert**; „FBForge“ als Installer-Herausgebertext ist kein Authenticode-Zertifikat. Sicherheitsprogramme oder SmartScreen nicht pauschal abschalten. Bei einer Sperre deren Meldung ohne private Daten protokollieren und den vorgesehenen Verteilungsweg klären.

## Ohne Zugangsdaten prüfen

1. Den geprüften dev.8-Kandidaten aus dem verlinkten Actions-Lauf verwenden. Die enthaltene Prüfsummendatei gehört genau zu diesem Installer. Der aktuelle Kandidat ist unsigniert, solange das bestellte Certum-Zertifikat fehlt.
2. Bei der eigenen Windows-Skalierung öffnen und das Fenster verkleinern/vergrößern. Bei Bedarf 125, 150 und 200 Prozent in den Windows-Anzeigeeinstellungen getrennt prüfen. Navigation, Verbindungsdialog, Schließen-Schaltfläche und Statusleiste müssen erreichbar bleiben; lange Inhalte dürfen im Arbeitsbereich scrollen. Keine abgeschnittenen Eingaben oder seitlich verlorenen Bedienelemente.
3. Mit Tab/Shift+Tab durch Kopfzeile und Navigation wechseln. Der Tastaturfokus muss sichtbar sein. „Verbinden“ öffnen, Client-ID und Client-Secret erreichen und den Dialog mit Escape schließen. Der Fokus soll zum Auslöser zurückkehren. Ein Screenreader kann einzelne Tasten zunächst für seinen eigenen Lese-/Eingabemodus verwenden; diesen Modus im Befund angeben.
4. Unter „Prozesse“ den fiktiven Demo-Prozess öffnen. Diagramm einpassen und vergrößern/verkleinern; eine Nachricht mit der Tastatur in der Liste auswählen. Die zugehörigen Kennungen müssen lesbar sein. Dafür ist keine Anmeldung nötig und es wird nichts versendet.
5. Hell-/Dunkeldesign prüfen: Text, Fokus, Warnungen und deaktivierte Bedienelemente sollen erkennbar bleiben. Eine Bedeutung darf nicht allein von einer Farbe abhängen.

## Falls ein Screenreader verwendet wird

Mit der tatsächlich eingesetzten NVDA-/JAWS-/Narrator-Version prüfen, ob Navigation, Überschriften, Dialog, beschriftete Eingaben und Auswahlzustände verständlich angesagt werden. Das Secret-Feld muss als geschützt erkennbar sein. Nicht nur einzelne Beschriftungen, sondern einen zusammenhängenden Ablauf ohne Maus durchführen: Navigation → Verbindungsdialog → zurück → Demo-Modell → Nachrichtenauswahl. Auch die Reihenfolge und Verständlichkeit der hörbaren Ausgabe bewerten.

Der automatische NVDA-Test erfasst erzeugte Sprachsequenzen für ausgewählte Bedienelemente in der installierten Anwendung. Er bestätigt keine allgemeine Unterstützung jedes Screenreaders, keine hörbare Sprachqualität und keine vollständige WCAG-/BITV-Konformität.

## Rückmeldung

Für einen gewöhnlichen Fehler reichen Windows-Version, App-Build/Commit, Skalierung, Fenstergröße, gegebenenfalls Screenreader-Version sowie die betroffene Aktion und das erwartete/tatsächliche Verhalten. Nur fiktive Daten verwenden. Screenshots oder Berichte dürfen keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten enthalten. Sicherheitslücken gemäß [SECURITY.md](SECURITY.md) privat melden.

Das ausgefüllte Protokoll bezieht sich nur auf den festgehaltenen Build. Offene Punkte und Freigabegrenzen stehen in [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md), die geplante Certum-Signierung in [SIGNING.md](SIGNING.md). Ein leeres Protokoll oder ein grüner automatisierter Teiltest ist keine manuelle Abnahme.
