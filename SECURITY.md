# Sicherheit

## Sicherheitslücken melden

Über [GitHub Private Vulnerability Reporting](https://github.com/FBForge/fbforge-connect/security/advisories/new)
melden, nicht in öffentlichen Issues. Version, Betriebssystem und Reproduktion
angeben. Keine Secrets, privaten Schlüssel oder echten Antragsdaten mitsenden.

## Speicherung und Exporte

Zugänge und Schlüssel bleiben ohne gespeichertes Profil in der Sitzung.
Gespeicherte Profile, Schlüssel, Vorgänge, Testpakete, Testabläufe und
Profil-Arbeitsdaten schützt Windows-DPAPI für das Benutzerkonto. Vorgänge
gespeicherter Profile werden standardmäßig dauerhaft aufbewahrt. Die Auswahl
lässt sich pro Profil und API abwählen. Tokens werden nicht gespeichert.
Profilsicherungen enthalten weder Vorgänge noch Profil-Arbeitsdaten.

Downloads und exportierte Pakete, Abläufe, Vorlagen und Berichte sind unverschlüsselt.
Sie bleiben beim Löschen eines Profils bestehen. DPAPI schützt nicht vor Schadsoftware
unter demselben Benutzerkonto. Die Vorgangsablage ist kein revisionssicheres Archiv.
Löschen garantiert kein physisches Überschreiben. Abmelden widerruft ausgestellte Tokens nicht.

## Schutzgrenzen

- Keine allgemeinen HTTP-, Shell- oder Dateisystemrechte im Renderer. Schreibaktionen
  benötigen Bestätigung. Ungewisse Übertragungen werden nicht automatisch wiederholt.
- Umgebungswechsel beendet Sitzungen. Profile und Vorgänge bleiben ihrer Umgebung
  und API zugeordnet. STAGE/PROD benötigen V-PKI-Kette und Sperrprüfung nach SDK-Vorgaben.
  Selbstsignierte Destination-Schlüssel sind nur in TEST erlaubt. PROD-Schreibaktionen
  benötigen zusätzlich eine native Bestätigung. Der Server prüft Berechtigungen.
- Öffentliche Schemaquellen benötigen Freigabe und erhalten Schema-URIs. Die optionale
  FIM-Abfrage überträgt LeiKa-Kennungen, keine Zugangsdaten oder Fachdaten.
- Kryptografisch geprüfte Inhalte bleiben trotz Schemaabweichung lesbar. Einzelannahme
  benötigt dann zusätzliche native Bestätigung. Fehlerhafte Sammelfälle bleiben manuell.
  Hash-, Signatur-, Zertifikats- und Entschlüsselungsfehler blockieren die Freigabe.
  Eine technische Prüfung ersetzt keine fachliche Entscheidung.
- Optionaler lokaler ClamAV läuft auf Loopback als eigener Benutzerprozess und endet
  mit der App. Engine-Dateien sind festgelegt, CVD-Datenbanken signiert. Downloads
  und automatische Signaturupdates benötigen Zustimmung. Offline-Bestände altern.
- Eigene ClamAV-/ICAP-Dienste erhalten entschlüsselte Inhalte über unverschlüsseltes
  TCP und benötigen ein vertrauenswürdiges lokales oder anderweitig geschütztes Netz.
  Metadaten-/Fachdatenfunde, Zeitlimits und unvollständige Scans blockieren die Freigabe.
  Anlagenfunde sperren die betroffenen Dateien. Geprüfte übrige Inhalte bleiben lesbar.
  Einzelannahme bestätigt die gesamte Nachricht mit signierten Anlagenproblemen und
  zusätzlicher Bestätigung. Sammelannahme und vollständiger Export bleiben gesperrt.
  Kein Sanitizing oder zusätzliche dauerhafte Quarantäne. Kein Fund ist keine Sicherheitsgarantie.

## Anwendungsupdates

GitHub erhält bei der abschaltbaren Suche IP-Adresse und Updater-Kennung, keine
FIT-Connect-Zugangsdaten oder Fachdaten. Fehlgeschlagene Suche gilt nicht als
Aktualitätsnachweis. Der manuelle Download bleibt verfügbar.

Nur neuere stabile Windows-x64-Pakete aus dem eigenen Repository werden angeboten:
HTTPS, begrenzte Downloads/Weiterleitungen und Paket-/Versionssignaturprüfung.
Authenticode und unabhängige Release-Prüfung bleiben erforderlich. Installation
benötigt native Zustimmung. Laufende Kernaufrufe und offene Exporte blockieren sie.
Gespeicherte Schlüssel werden vorher gesichert. Ungespeicherte Entwürfe und
Sitzungsschlüssel müssen selbst gesichert werden.

Der öffentliche Prüfschlüssel ist hinterlegt. Ohne gültigen Prüfschlüssel bleibt
der Updater deaktiviert. Den privaten Schlüssel außerhalb von Git aufbewahren.
Verlust oder Kompromittierung erfordert einen Migrationsablauf. Schlüssel-Einrichtung
und signierte Update-Abnahme: [RELEASING.md](RELEASING.md#update-signierung-einmalig-einrichten).

## Bekannte Abhängigkeitsbefunde

Stand der Bewertung: 31. Oktober 2026. Lockfiles und Actions-Versionen sind festgelegt.
Vor Releases npm, Maven und Rust einschließlich plattformspezifischer Pfade erneut
gegen Sicherheitsmeldungen prüfen. JDK und WebView2 separat aktuell halten.

- npm meldete keine bekannten Laufzeit-Schwachstellen.
  `GHSA-g3hv-75wg-m249` betrifft `minimatch 10.2.6` im Entwicklungs-/Prüfwerkzeugbaum:
  Ressourcenverbrauch durch präparierte Glob-Muster, 13 moderate abhängige Einträge,
  damals keine korrigierte Version verfügbar. Keine Laufzeitfunktion der Windows-App.
- `GHSA-qwgh-2vcv-g2f7` betrifft laut OSV `block-buffer 0.10.4` im Tauri-Buildbaum,
  nicht im Windows-Laufzeitbaum. Die konkret betroffene `ReadBuffer`-Implementierung
  ist in dieser Version nicht enthalten. Den weit gefassten Versionsbereich bei Updates erneut prüfen.
- Linux-RustSec-Hinweise für `glib`, `proc-macro-error`, `zbus_names`, `zvariant` und
  `zvariant_derive` bleiben offen. Diese Pakete werden im Windows-Build nicht verwendet.
  Linux wird derzeit nicht unterstützt.
