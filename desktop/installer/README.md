# Windows-Installer

Die NSIS-Vorlage stammt aus Tauri-CLI 2.12.3. `UNINSTKEY` und `MANUPRODUCTKEY` behalten die frühere technische Identität „FIT-Connect Test-Client“, damit Updates bestehende Installationen erkennen. Anzeigename und Herausgeber sind FBForge Connect und FBForge.

`compatibility.nsh` entfernt alte Verknüpfungen nur bei passendem Ziel. Die Anwendung heißt auch intern `fbforge-connect`, die Windows-Datei `fbforge-connect.exe`. Alte Binärnamen und Verknüpfungen werden beim Upgrade bereinigt. App-ID, Profilspeicher und Verschlüsselungsformat bleiben für vorhandene Profile unverändert.

Bei einem CLI-Update die Originalvorlage aus dem passenden Tag übernehmen, beide Registry-Anpassungen prüfen und den Windows-Upgrade-Test ausführen. Herkunft und Originalhash: `upstream.json`. Test: `tests/installer-template.test.js`.

Copyright (c) 2017 - Present Tauri Apps Contributors. MIT oder Apache-2.0. Lizenztexte unter `licenses/tauri-MIT.txt` und `licenses/Apache-2.0.txt`.
