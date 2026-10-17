# Windows-Signierung mit Certum

Stand: 17. Oktober 2026. Das Certum-Signaturzertifikat ist laut Projektinhaber bestellt und noch nicht verfügbar. Der aktuelle dev.8-Kandidat ist ausdrücklich **unsigniert**. Ein unsignierter Build wird nicht als signiert ausgegeben; die Veröffentlichung als Alpha bleibt eine gesonderte Entscheidung.

## Vorbereitung bis zur Zertifikatsausgabe

Installerbau, tatsächliche Installation/Upgrade und SHA-256-/Build-Manifest sind bereits eingerichtet. Signierung lässt sich ergänzen, sobald Zertifikat und konkrete Nutzungsart feststehen. Certum kann je nach Produkt einen lokalen Zertifikatsspeicher mit Hardware-/SimplySign-Anbindung oder einen anderen bereitgestellten Signierweg verwenden. Es wird deshalb jetzt weder ein exportierbarer PFX-Schlüssel vorausgesetzt noch eine ungetestete CI-Integration versprochen.

Private Signaturschlüssel, PINs und OTPs gehören nicht in das Repository, Logs oder Installer. Der öffentliche Zertifikat-Fingerabdruck und die Aussteller-/Inhaberdaten werden nach Ausgabe geprüft. Der Anzeigename des Installers ersetzt nicht die tatsächliche Identität im Zertifikat.

## Nach Ausgabe konkret prüfen

1. Den unterstützten Certum-Signierweg auf einem vertrauenswürdigen Windows-Buildsystem einrichten. Bei benutzergebundener Freigabe/PIN/OTP zunächst lokal signieren; eine automatische GitHub-CI-Nutzung nur mit einem tatsächlich unterstützten sicheren Signierdienst einrichten.
2. Mit der festgelegten Tauri-Version die eigene Anwendungsdatei und den NSIS-Installer signieren. Die vorhandenen Konfigurationsfelder `certificateThumbprint` beziehungsweise `signCommand`, `digestAlgorithm`, `timestampUrl` und `tsp` anhand des gewählten Dienstes setzen. SHA-256 und den vom Anbieter vorgesehenen vertrauenswürdigen Zeitstempel verwenden; keine geratenen Serveradressen eintragen.
3. Anwendungsdatei und Installer mit Windows-Authenticode prüfen: gültige Signatur, erwartetes Zertifikat/Identität, gültige Kette und Zeitstempel. `Get-AuthenticodeSignature` und `signtool verify /pa /all /v` gehören zur Abnahme. Ein erfolgreicher Signierbefehl allein reicht nicht.
4. Die tatsächliche Installation und das dev.7-Upgrade mit dem signierten Paket wiederholen. Dabei die installierte Anwendungsdatei gegen den final signierten Build vergleichen; Tauri-Bündel-/Signierverhalten erneut prüfen.
5. Erst aus den endgültigen signierten Dateien neue Prüfsummen und Build-Metadaten erzeugen. Das bisherige `signing: unsigned` im Workflow dann durch den tatsächlich geprüften Signierstatus ergänzen. Auch `scripts/verify-installer.mjs` akzeptiert bisher ausdrücklich nur unsignierte Kandidaten; seine Freigabe für signierte Pakete muss an die erfolgreiche Authenticode-Prüfung gebunden werden. Frühere unsignierte Prüfsummen gelten nicht für neu signierte Dateien.

Auch ein gültiges neues Zertifikat garantiert noch keine sofort aufgebaute SmartScreen-Reputation. Bereits jetzt werden keine Schritte zum Abschalten von Windows-Schutzmechanismen vorausgesetzt.
