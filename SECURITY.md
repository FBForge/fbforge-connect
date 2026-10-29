# Sicherheit

Die Sicherheitshinweise gelten für Windows sowie FIT-Connect TEST, STAGE und PROD.

## Sicherheitslücken melden

Bitte über [GitHub Private Vulnerability Reporting](https://github.com/FBForge/fbforge-connect/security/advisories/new) melden, nicht in öffentlichen Issues. Nennen Sie Version, Betriebssystem und Schritte zur Reproduktion. Keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten beifügen.

## Datenspeicherung

Zugangsdaten und Schlüssel bleiben standardmäßig in der Sitzung. Optional gespeicherte Profile, Schlüssel und Vorgänge sind mit Windows-DPAPI an das Benutzerkonto gebunden. Profilsicherungen enthalten keine Vorgänge. Zugangstokens werden nicht gespeichert.

Nachrichten-Downloads, Anlagen-Downloads, exportierte Testpakete und Vergleichsberichte liegen
unverschlüsselt außerhalb dieser geschützten Ablage. Wählen Sie einen geeigneten Speicherort und
prüfen Sie Inhalte vor dem Weitergeben. Ein Download wird durch das Löschen eines Profils nicht entfernt.

DPAPI schützt nicht vor Schadsoftware unter demselben Benutzerkonto. Die Vorgangsablage ist kein revisionssicheres Archiv. Löschen garantiert kein physisches Überschreiben von Datenträgern oder Sicherungen. Das Beenden einer Sitzung widerruft keine bereits ausgestellten Tokens.

## Schutzgrenzen

- Kein integrierter Malwarescanner. Technische Integrität, Schema-Prüfung und fachliche Bewertung sind getrennt.
- Keine allgemeinen HTTP-, Shell- oder Dateisystemrechte im Renderer. Schreibaktionen erfordern eine Bestätigung. Ungewisse Übertragungen werden nicht automatisch wiederholt.
- Die Umgebung ist je Engine-Prozess fest. Ein Wechsel beendet bestehende Verbindungen und erfordert eine neue Anmeldung. Gespeicherte Profile und Vorgänge bleiben ihrer Umgebung zugeordnet.
- STAGE und PROD verlangen V-PKI-Zertifikate. Vertrauenskette und Sperrstatus werden mit den Vorgaben des eingebundenen SDK geprüft. Fehlgeschlagene Prüfungen werden nicht umgangen. Selbstsignierte Destination-Schlüssel sind nur in TEST erlaubt.
- Jede produktive Schreibaktion erfordert zusätzlich die native PROD-Bestätigung. Diese ist kein Ersatz für serverseitige Berechtigungen.
- Öffentliche Schemaquellen werden nur nach Freigabe geladen.
- Das optionale Laden von Leistungsnamen fragt das öffentliche FIM-Portal anhand von LeiKa-Kennungen ab. Zugangsdaten und Fachdaten werden dabei nicht übertragen. Öffentliche Schemaabrufe übermitteln die benötigten Schema-URIs; geben Sie diese Quellen nur bewusst frei.
- Technische Fehler im Sammeldurchlauf führen weder zu einer automatischen Annahme noch zu einer automatischen Ablehnung. Fachlich falsche, technisch gültige Daten benötigen eine manuelle Bewertung. Eine Annahme ohne Malwarescan muss im Sammeldurchlauf ausdrücklich erlaubt werden.

## Abhängigkeiten

JavaScript-, Java- und Rust-Abhängigkeiten, JDK und WebView2 müssen getrennt geprüft werden. Lockfiles und Actions-Versionen sind festgelegt.

Der Release-Abgleich vom 27. Oktober 2026 verwendet npm-Audit sowie OSV-/RustSec-Meldungen für
die gelockten Rust- und aufgelösten Maven-Abhängigkeiten. Ein Abgleich bestätigt nur den bekannten
Meldungsstand; er ersetzt keine Prüfung von Anwendung, Betriebssystem und mitgelieferter Java-Laufzeit.

Die transitiven Bouncy-Castle-Module `bcprov`, `bcpkix` und `bcutil` sind einheitlich auf 1.86
festgelegt. Damit sind die beim Abgleich gemeldeten CVEs CVE-2025-14813, CVE-2026-0636,
CVE-2026-5588, CVE-2026-8763 und CVE-2026-13506 in diesen Abhängigkeiten behoben.

OSV meldet `GHSA-qwgh-2vcv-g2f7` für `block-buffer 0.10.4` über den Tauri-Codegenerator
(`sha2` → `digest` → `block-buffer`). Diese Abhängigkeit gehört zur Buildzeit, nicht zum
Windows-Laufzeitbaum. Die Meldung beschreibt einen Cursor im Datenpuffer; Version 0.10.4 speichert
ihn in einem separaten Feld und enthält die betroffene `ReadBuffer`-Implementierung nicht.
Der Versionsbereich der Meldung ist weiter gefasst als dieser konkrete Fehlermechanismus.
Der Befund bleibt dokumentiert und ist bei Tauri- oder RustCrypto-Updates erneut zu prüfen.

Im Linux-Abhängigkeitsbaum sind RustSec-Hinweise für `glib`, `proc-macro-error`, `zbus_names`, `zvariant` und `zvariant_derive` offen. Diese Pakete werden im Windows-Build nicht verwendet. Linux wird derzeit nicht unterstützt.
