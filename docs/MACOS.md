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

Geprüfter Produktquellstand: `4a0f2cc6e478fd6ce10051f5e8ac96162ae5403b`.
Die nachfolgende Dokumentation ändert diesen getesteten Produktstand nicht.

| Prüfung | Ergebnis |
| --- | --- |
| macOS 15, native Apple-Silicon-App | Erfolgreich gebaut und gestartet, sichtbarer Inhalt zusätzlich per lokalem OCR geprüft, Aufnahme visuell angesehen |
| Bundle-Inventar | 37 native Mach-O-Dateien, ausschließlich arm64, private Java-25-Laufzeit |
| Schlüsselbund und Speicherung | Reale Keychain-Verträge, geschütztes Profil über getrennte Prozesse und sicherer Fehler nach Entfernen des Testschlüssels bestanden |
| Mac Desktop-Rust | 155 Tests bestanden |
| Java-Reaktor | 306 Tests bestanden |
| FIT-Connect TEST | Sender und Subscriber für v2/v3 mit der tatsächlich gebündelten Laufzeit lesend geprüft |
| Lokaler Scanner auf Mac | Upstream-/Datei-/Datenbanksignaturen, Offline-Import, eigener Prozess, saubere Datei, EICAR, normales Ende und Lease-Aufräumen nach erzwungenem Elternprozessende bestanden |
| Gemeinsame Oberfläche | 334 Browser-/Produktregressionen in CI bestanden, Produktionseinstieg unter 500 kB |
| Windows-Regression | Native Verträge, vollständige Desktop-Tests und Abdeckungsgates bestanden |
| Website-Hilfe | 16 Kapitel und 66 Bilder auf separatem Doku-Branch, 180 Browser-Zugänglichkeitsprüfungen bestanden |

Nachweise: [nativer Mac-Lauf](https://github.com/FBForge/fbforge-connect/actions/runs/43663398316)
und [gemeinsame Checks](https://github.com/FBForge/fbforge-connect/actions/runs/43663398284).
Interne Pakete und Aufnahmen bleiben nur kurzzeitig als Actions-Artefakte erhalten.
Die versionierte Hilfe liegt auf `docs/connect-0.5.0` im Website-Repo. Sie ist
noch nicht veröffentlicht. Kein Workflow signiert oder veröffentlicht einen Mac-Release.

Diese Nachweise belegen den internen Kandidaten. Die folgenden Distributions-
und manuellen Abnahmen sind weiterhin offen.

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

- ClamAV im installierten Client: Signaturupdate, Proxy, Abbruch und Quarantäne
  zusätzlich zum bestandenen nativen Komponentenlauf abnehmen.
- Schreibende FIT-Connect-TEST-Abnahme mit beiden APIs auf macOS. Der bestandene CI-Lesetest verwendet die
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
- Abschließende Sicherheitsfreigabe des Distributionspakets. Auditberichte und
  offene Prüffragen bleiben wie vereinbart außerhalb des Repos. Signierung
  und echte Upgrades benötigen eigene Nachweise.

Diese Liste ist absichtlich offen. Ein interner Debug-Build wird weder als fertiger
Installer noch als Nachweis für signierte Updates oder Gatekeeper bezeichnet.
