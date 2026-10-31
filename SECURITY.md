# Sicherheit

Die Sicherheitshinweise gelten für Windows sowie FIT-Connect TEST, STAGE und PROD.

## Sicherheitslücken melden

Über [GitHub Private Vulnerability Reporting](https://github.com/FBForge/fbforge-connect/security/advisories/new),
nicht in öffentlichen Issues. Bitte Version, Betriebssystem und Reproduktionsschritte
angeben, keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten.

## Datenspeicherung

Zugänge und Schlüssel bleiben standardmäßig in der Sitzung. Optional gespeicherte
Profile, Schlüssel, Vorgänge, gespeicherte Testpakete und Testabläufe, Destination-Vorlagen und Konfigurationshistorie schützt Windows-DPAPI für das Benutzerkonto. Vorgänge gespeicherter Profile werden standardmäßig dauerhaft aufbewahrt. Die Aufbewahrung lässt sich pro Profil und API abwählen.
Tokens werden nicht gespeichert; Profilsicherungen enthalten weder Vorgänge noch die getrennten Profil-Arbeitsdaten.

Downloads, exportierte Testpakete, Abläufe, Vorlagen und Vergleichsberichte sind unverschlüsselt.
Sie bleiben beim Löschen eines Profils bestehen. DPAPI schützt nicht vor
Schadsoftware unter demselben Benutzerkonto. Die Vorgangsablage ist kein
revisionssicheres Archiv; Löschen garantiert kein physisches Überschreiben.
Eine Abmeldung widerruft keine bereits ausgestellten Tokens.

## Schutzgrenzen

- Ab 0.3.0 optional lokaler ClamAV als geprüfte Windows-Komponente oder eine eigene ClamAV-/ICAP-Gegenstelle. Der mitgelieferte Scanner läuft ausschließlich auf Loopback als Benutzerprozess und endet mit der App. Engine-Dateien sind fest gepinnt; offizielle CVD-Datenbanken benötigen gültige Signaturen. Downloads und automatische Signaturupdates benötigen Zustimmung; Offline-Bestände altern sichtbar.
- Eigene Scanner erhalten entschlüsselte Inhalte über unverschlüsseltes TCP und benötigen ein vertrauenswürdiges lokales oder anderweitig geschütztes Netz. Metadaten-/Fachdatenfunde, Zeitlimits und unvollständige Scans blockieren die Freigabe. Anlagenfunde sperren die betroffenen Dateien; andere geprüfte Inhalte bleiben lesbar. Die Einzelannahme bestätigt die gesamte Nachricht mit nativen Problemangaben und zusätzlicher Bestätigung. Sammelannahme und vollständiger Export bleiben für solche Nachrichten gesperrt. Kein Sanitizing und keine zusätzliche dauerhafte Quarantäne. Ein unauffälliger Scan ist keine Sicherheitsgarantie.
- Keine allgemeinen HTTP-, Shell- oder Dateisystemrechte im Renderer. Schreibaktionen
  benötigen eine Bestätigung; ungewisse Übertragungen werden nicht automatisch wiederholt.
- Umgebungswechsel beendet Sitzungen und erfordert eine neue Anmeldung. Gespeicherte
  Profile und Vorgänge bleiben ihrer Umgebung zugeordnet.
- STAGE und PROD prüfen V-PKI-Kette und Sperrstatus nach SDK-Vorgaben. Selbstsignierte
  Destination-Schlüssel sind nur in TEST erlaubt. PROD-Schreibaktionen benötigen zusätzlich
  eine native Bestätigung; serverseitige Berechtigungen bleiben erforderlich.
- Öffentliche Schemaquellen benötigen eine Freigabe. Schemaabrufe übertragen Schema-URIs;
  die optionale FIM-Abfrage überträgt LeiKa-Kennungen, keine Zugangsdaten oder Fachdaten.
- Fehlerhafte Einreichungen im Sammeldurchlauf bleiben manuell; es gibt keine automatische
  Ablehnung. Fachlich falsche, technisch gültige Daten benötigen ebenfalls eine Entscheidung.
- Ab 0.3.0 bleiben kryptografisch geprüfte Inhalte trotz Schemaabweichungen lesbar.
  Einzelannahme erfordert eine zusätzliche native Bestätigung; Sammelannahme bleibt gesperrt.
  Hash-, Signatur-, Zertifikats- und Entschlüsselungsfehler bleiben blockierend.

## Updates ab 0.3.0 – in Entwicklung

Die automatische Suche ist abschaltbar. GitHub erhält IP-Adresse und Updater-Kennung,
keine FIT-Connect-Zugangsdaten oder Fachdaten. Fehlgeschlagene Prüfungen gelten nicht
als Aktualitätsnachweis; manueller Download bleibt möglich.

Nur neuere stabile Windows-x64-Pakete aus dem eigenen Repository werden angeboten:
HTTPS, begrenzte Downloads und Weiterleitungen sowie Prüfung von Paket- und
Versionssignatur. Authenticode und die unabhängige Release-Prüfung bleiben erforderlich.
Installation benötigt native Zustimmung; laufende Kernaufrufe und offene Exporte
blockieren sie. Gespeicherte Schlüssel werden vorher gesichert; ungespeicherte
Entwürfe und Sitzungsschlüssel müssen Sie selbst sichern.

Ohne Prüfschlüssel bleibt der Updater deaktiviert. Der private Schlüssel bleibt
außerhalb des Repositorys. Verlust oder Kompromittierung erfordert einen eigenen
Migrationsablauf. Der öffentliche Projekt-Prüfschlüssel ist hinterlegt. Die echte
Windows-Update-Abnahme mit dem signierten Release steht vor der Freigabe an.
Details: [BUILDING.md](BUILDING.md) und [RELEASING.md](RELEASING.md).

## Abhängigkeiten und bekannte Befunde

JavaScript, Java, Rust, JDK und WebView2 werden getrennt geprüft. Lockfiles und
Actions-Versionen sind festgelegt. Der Abgleich vom 27. Oktober 2026 nutzte npm-Audit
und OSV/RustSec für Rust und Maven. Am 29. Oktober wurden zusätzlich 48 neue
Rust-Paketversionen gegen OSV geprüft, ohne Meldungen. Das ersetzt keine Systemprüfung.

Der npm-Abgleich vom 31. Oktober 2026 meldet keine bekannten Schwachstellen in den
Laufzeitabhängigkeiten. `GHSA-g3hv-75wg-m249` betrifft `minimatch` im Entwicklungs-
und Prüfwerkzeugbaum. npm führt dafür 13 moderate Einträge entlang der abhängigen
Pakete, aber keine korrigierte Version auf. Der Befund beschreibt Ressourcenverbrauch
bei speziell präparierten Glob-Mustern. Er betrifft keine Laufzeitfunktion der
Windows-App. Vor der Veröffentlichung den Werkzeugbaum erneut prüfen.

Bouncy Castle `bcprov`, `bcpkix` und `bcutil` sind auf 1.86 festgelegt. Damit sind die
zuvor gemeldeten CVEs CVE-2025-14813, CVE-2026-0636, CVE-2026-5588, CVE-2026-8763 und
CVE-2026-13506 in diesen Abhängigkeiten behoben.

`GHSA-qwgh-2vcv-g2f7` betrifft laut OSV `block-buffer 0.10.4` im Tauri-Buildbaum
(`sha2` → `digest`), nicht im Windows-Laufzeitbaum. Diese Version enthält die konkret
betroffene `ReadBuffer`-Implementierung nicht und speichert den Cursor separat.
Der gemeldete Versionsbereich ist weiter gefasst; bei Updates erneut prüfen.

Offene Linux-RustSec-Hinweise: `glib`, `proc-macro-error`, `zbus_names`, `zvariant`
und `zvariant_derive`. Diese Pakete werden im Windows-Build nicht verwendet.
Linux wird derzeit nicht unterstützt.
