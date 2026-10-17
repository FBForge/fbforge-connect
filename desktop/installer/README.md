# Kompatible Windows-Produktumbenennung

Der Anzeigename lautet ab dev.8 **FBForge Test-Client**. Die bestehenden Dev-Installationen verwenden den Namen **FIT-Connect Test-Client** auch als technische NSIS-Registry-Identität. Tauri leitet diese Identität standardmäßig aus `productName` ab; ein bloßer Namenswechsel würde zwei Installationseinträge erzeugen und den bisherigen Installationsort übersehen.

Die NSIS-Vorlage ist deshalb unverändert aus der gepinnten Tauri-CLI 2.12.3 übernommen, mit genau zwei Ersetzungen: `UNINSTKEY` und `MANUPRODUCTKEY` verwenden weiter die frühere technische Identität. Sichtbarer Produktname, Installer, Deinstallationsanzeige und neue Verknüpfungen tragen den neuen Namen. `compatibility.nsh` entfernt nur alte Verknüpfungen, deren Ziel exakt auf die ersetzte Anwendung zeigt. App-ID, Binärname und Profilformat bleiben unverändert. Ein künftiger Wechsel von Publisher/Hersteller oder App-ID braucht eine eigene Migration.

`upstream.json` hält Herkunft und SHA-256 der Originalvorlage fest. `tests/installer-template.test.js` rekonstruiert aus der angepassten Datei das Original und prüft den Hash sowie die gesperrte CLI-Version. Bei einem Tauri-CLI-Update die Vorlage aus dem neuen passenden Tag erneut übernehmen, die beiden Registry-Ersetzungen prüfen und den echten Windows-Upgrade-Test ausführen. Keine weiteren Anpassungen unbemerkt in diese Vorlage aufnehmen.

Lizenz: MIT oder Apache-2.0, Copyright (c) 2017 - Present Tauri Apps Contributors. Der MIT-Text liegt unter `licenses/tauri-MIT.txt`; Apache-2.0 unter `licenses/Apache-2.0.txt`.
