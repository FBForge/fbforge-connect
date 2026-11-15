# macOS 0.5.0: Entwicklung und Abnahme

Stand: 15. November 2026. Branch: `release/0.5.0`.
Noch kein veröffentlichtes oder zur Distribution freigegebenes Mac-Paket.
Windows bleibt unterstützt. Linux und Intel-Macs sind nicht Teil dieses Releases.

## Umsetzung

- Gemeinsamer Vue-/Tauri-/Java-Client, native Apple-Silicon-Binaries und private
  Java-25-Laufzeit. Vorläufige Mindestversion: macOS 15.
- Lokaler, nicht synchronisierter Keychain-Schlüssel. Geschützte Dateien verwenden
  AES-256-GCM mit Versions-/Zweckbindung und zufälligen Nonces. Verlorene Schlüssel
  werden bei vorhandenen Daten nicht still neu angelegt. Windows-DPAPI bleibt erhalten.
- Dauerhafte Profile, Vorgänge, Testvorbereitungen, Testsammlungen, Ergebnisse und
  Netzwerkeinstellungen verwenden die gemeinsame Plattformfähigkeit.
- Native Menüs, Bearbeitung mit Cmd, Einstellungen mit Cmd+, und kontrolliertes
  Beenden mit Cmd+Q. Fenster schließen sich nach Sicherung in den Hintergrund;
  das Dock öffnet das Hauptfenster erneut.
- Plattformgebundene Updateprüfung für `windows-x86_64` und `darwin-aarch64`.
  Das Mac-Updatepaket heißt `FBForge.Connect_<Version>_aarch64.app.tar.gz`.
  Ein DMG ist kein Updaterpaket. Apple-Code-Signierung und Updater-Signatur
  benötigen jeweils eigene Nachweise.
- Eigenes ClamAV-Manifest für das signierte offizielle macOS-Paket. Der Import
  führt keine Installer-Skripte aus. Hashgeprüfte Programme und Bibliotheken
  werden privat extrahiert. Ein Pipe-Wächter bindet den Scanner an den App-Prozess.
  Ein vollständiger Scanner-Abnahmelauf ist noch erforderlich.

## Bisherige Nachweise

Echte macOS-15-arm64-Runner prüfen die nativen Verträge einschließlich Schlüsselbund,
geschütztem Profil über getrennte Prozesse und dem Fehlerfall eines entfernten
Testschlüssels. Java-Reaktor, Engine-Smoke und vollständige Desktop-Rust-Tests
wurden auf macOS erfolgreich ausgeführt. Das interne Debug-App-Bundle wurde gebaut.
ClamAVs Programme starten aus einem verschobenen privaten Verzeichnis.

Diese Einzelnachweise ersetzen noch keinen vollständig grünen Releasekandidaten.
Die konkreten Läufe stehen in [macOS validation](https://github.com/FBForge/fbforge-connect/actions/workflows/macos.yml).
Der Workflow lädt interne Pakete und Aufnahmen nur kurzzeitig als Actions-Artefakte
hoch; er signiert und veröffentlicht keine Releases.

## Lokaler Ablauf

Siehe [BUILDING.md](../BUILDING.md#macos-auf-apple-silicon). Vor dem Bauen müssen
Node, Rust und ein natives arm64-JDK bereitstehen. Für Anwender werden diese
Abhängigkeiten im späteren Paket mitgeliefert.

Zur Prüfung eines bereits gebauten internen Bundles:

```sh
node scripts/macos/verify-bundle.mjs \
  'desktop/target/debug/bundle/macos/FBForge Connect.app' \
  /tmp/fbforge-mac-inventory.json
```

Die Prüfung inventarisiert alle Mach-O-Dateien, verlangt arm64 und prüft
Bundle-interne Verweise. Sie startet und verändert die App nicht. Für bereits
signierte und notarisierte Distributionspakete ergänzt `--distribution` die
Prüfung von Team-ID, Hardened Runtime, Code-Signaturen, Gatekeeper und Stapling.
Dazu `FBFORGE_APPLE_TEAM_ID` auf die eigene zehnstellige Team-ID setzen. Das
Inventar muss neu angelegt werden; vorhandene Berichte werden nicht überschrieben.
Das Werkzeug ersetzt keinen Signier- oder Notarisierungsprozess.

## Offene Freigabekriterien

- Vollständig grüner nativer Paketlauf: Engine aus dem Bundle, App-Start und
  tatsächlich betrachtete WKWebView-Aufnahmen. Alle gemeinsamen Browserregressionen.
- ClamAV: signierte Datenbanken, Offline-Import, saubere Datei, EICAR, eigener
  Loopback-Port, normales Ende und Beenden des Elternprozesses ohne Scannerreste.
  Zusätzlich Online-Update, Proxy und Abbruch prüfen.
- FIT-Connect-TEST-Abnahme mit beiden APIs auf macOS. Der CI-Lesetest verwendet die
  vorhandenen Projekt-Secrets und gibt keine Zugangsdaten oder SDK-Antworten aus.
  Er sendet und bestätigt keine Einreichungen. Schreibende Ende-zu-Ende-Tests sind
  ein eigener Nachweis.
- Fenster/Dock, Leerlaufprozesse, Schlafen/Aufwachen, Dateidialoge, Drag-and-drop,
  Zwischenablage, PDF-Ansicht, Zoom und VoiceOver am nativen Client abnehmen.
- Signierarchitektur für eingebettetes Java und optionale ClamAV-Dateien praktisch
  abnehmen. JIT-Ausnahmen so eng wie möglich begrenzen. Unveränderte Vendor-Hashes
  gelten nicht automatisch nach einer erneuten Signierung.
- Nach Nutzerabnahme: Developer ID, Notarisierung und Gatekeeper auf einem frischen
  Mac; Installation nach `/Applications` und `~/Applications`; echtes signiertes
  Upgrade mit einer älteren Version und erhaltenen Profildaten.
- Abschließender Security-Audit und Website-Hilfe mit echten Mac-Abbildungen.

Diese Liste ist absichtlich offen. Ein interner Debug-Build wird weder als fertiger
Installer noch als Nachweis für signierte Updates oder Gatekeeper bezeichnet.
