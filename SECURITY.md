# Sicherheit

FBForge Connect ist ausschließlich für Integrationstests auf der FIT-Connect-Testumgebung vorgesehen. Die Produktivumgebung wird nicht unterstützt. Das Projekt befindet sich in Entwicklung.

## Sicherheitsprobleme melden

Bitte keine ausnutzbaren Sicherheitslücken, Zugangsdaten, privaten Schlüssel oder Einreichungsdaten in öffentlichen Issues veröffentlichen.

Sicherheitslücken bitte über [GitHubs privaten Sicherheitsmeldeweg](https://github.com/FBForge/fbforge-connect/security/advisories/new) melden. Die private Meldung ist für dieses Repository aktiviert. Dafür wird ein GitHub-Konto benötigt. Allgemeine Bedienfragen und Fehler ohne Sicherheitsbezug gehören in die normalen Issues.

Beschreiben Sie betroffene Version, Betriebssystem, Auswirkungen und eine möglichst kleine Reproduktion mit fiktiven Daten. Keine echten Zugangsdaten, privaten Schlüssel oder fremden Einreichungen beifügen.

## Umgang mit Testdaten

Verwenden Sie fiktive Einreichungsdaten und eigene Testzugänge. Zugangsdaten und private Schlüssel werden lokal verarbeitet und standardmäßig nicht dauerhaft gespeichert. Das Entfernen einer Sitzung widerruft kein bereits ausgestelltes Token beim Dienst.

Optional gespeicherte Profile, Schlüssel und separat aktivierte Vorgangskopien werden unter Windows benutzergebunden mit DPAPI verschlüsselt. Es gibt keinen Klartext-Fallback. Profilsicherungen sind an die Windows-Benutzerschlüssel gebunden und enthalten keine Vorgangsablage. OAuth-Tokens und historische Empfangsnachweise werden nicht dauerhaft als Berechtigungen gespeichert.

## Schutzgrenzen

DPAPI schützt nicht vor Schadsoftware mit den Rechten desselben angemeldeten Benutzers. Die Vorgangsablage ist kein revisionssicheres Archiv; lokales Löschen garantiert kein physisches Überschreiben von SSDs, Exporten oder Betriebssystem-Sicherungen. Es gibt keinen integrierten Malwarescanner. Technische Integrität, Schema-Prüfung und fachliche Bewertung sind getrennte Ergebnisse.

Der Renderer erhält keine allgemeinen HTTP-, Shell- oder Dateisystemrechte. Geschützte Vorgänge bleiben nativ, Schreibaktionen benötigen eine eigene Bestätigung. Ungewisse Schreibausgänge werden nicht automatisch wiederholt. Externe Schemaquellen sind ein eigener Vertrauensbereich und benötigen eine ausdrückliche Freigabe.

## Abhängigkeiten und Plattformen

Lockfiles und Actions-Versionen sind festgelegt. Abhängigkeitsänderungen benötigen die betroffenen Protokoll-, Speicher- und Paketprüfungen. JavaScript-, Java- und Rust-Abhängigkeiten sowie JDK und WebView2 getrennt bewerten; ein unauffälliges npm-Audit genügt nicht für eine Gesamtbewertung.

Windows ist derzeit die einzige unterstützte Desktop-Plattform. Im plattformübergreifenden Rust-Lockfile sind Linux-bezogene Hinweise zu `glib 0.18.5` (RUSTSEC-2024-0429) und `proc-macro-error 1.0.4` (RUSTSEC-2024-0370) bekannt. Sie werden für das Windows-Ziel nicht aufgelöst; vor Linux-Unterstützung sind ein kompatibles GTK-/Tauri-Update und eigene Sicherheitsprüfungen erforderlich. Keine inkompatiblen Abhängigkeiten allein zur Bereinigung des Lockfiles erzwingen.

Das Projekt behauptet keine BSI-Zertifizierung oder vollständige WCAG-Konformität. Eine behördliche Nutzung erfordert die eigene Bewertung von Schutzbedarf und Betriebsbedingungen.
