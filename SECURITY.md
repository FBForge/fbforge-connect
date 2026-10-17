# Sicherheit

FBForge Connect unterstützt Windows und FIT-Connect TEST. Verwenden Sie eigene Testzugänge und fiktive Daten.

## Sicherheitslücken melden

Bitte über [GitHub Private Vulnerability Reporting](https://github.com/FBForge/fbforge-connect/security/advisories/new) melden, nicht in öffentlichen Issues. Nennen Sie Version, Betriebssystem und Schritte zur Reproduktion. Keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten beifügen.

## Datenspeicherung

Zugangsdaten und Schlüssel bleiben standardmäßig in der Sitzung. Optional gespeicherte Profile, Schlüssel und Vorgänge sind mit Windows-DPAPI an das Benutzerkonto gebunden. Profilsicherungen enthalten keine Vorgänge. Zugangstokens werden nicht gespeichert.

DPAPI schützt nicht vor Schadsoftware unter demselben Benutzerkonto. Die Vorgangsablage ist kein revisionssicheres Archiv; Löschen garantiert kein physisches Überschreiben von Datenträgern oder Sicherungen. Das Beenden einer Sitzung widerruft keine bereits ausgestellten Tokens.

## Schutzgrenzen

- Kein integrierter Malwarescanner. Technische Integrität, Schema-Prüfung und fachliche Bewertung sind getrennt.
- Keine allgemeinen HTTP-, Shell- oder Dateisystemrechte im Renderer. Schreibaktionen erfordern eine Bestätigung; ungewisse Übertragungen werden nicht automatisch wiederholt.
- Öffentliche Schemaquellen werden nur nach Freigabe geladen.
- Keine BSI-Zertifizierung oder vollständige WCAG-Konformitätsprüfung.

## Abhängigkeiten

JavaScript-, Java- und Rust-Abhängigkeiten, JDK und WebView2 müssen getrennt geprüft werden. Lockfiles und Actions-Versionen sind festgelegt.

Die Linux-Abhängigkeiten `glib 0.18.5` (RUSTSEC-2024-0429) und `proc-macro-error 1.0.4` (RUSTSEC-2024-0370) sind im Lockfile bekannt, werden im Windows-Build aber nicht verwendet. Vor Linux-Unterstützung müssen sie aktualisiert und geprüft werden.
