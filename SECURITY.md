# Sicherheit

FBForge Connect ist ausschließlich für Integrationstests auf der FIT-Connect-Testumgebung vorgesehen. Die Produktivumgebung wird nicht unterstützt. Das Projekt befindet sich in Entwicklung.

## Sicherheitsprobleme melden

Bitte keine ausnutzbaren Sicherheitslücken, Zugangsdaten, privaten Schlüssel oder Einreichungsdaten in öffentlichen Issues veröffentlichen.

Sicherheitslücken bitte über [GitHubs privaten Sicherheitsmeldeweg](https://github.com/FBForge/fbforge-connect/security/advisories/new) melden. Die private Meldung ist für dieses Repository aktiviert. Dafür wird ein GitHub-Konto benötigt. Allgemeine Bedienfragen und Fehler ohne Sicherheitsbezug gehören in die normalen Issues. Als zusätzlicher E-Mail-Kontakt ist `kontakt@fbforge.de` geplant; Einrichtung und Empfang sind noch nicht bestätigt. Bis dahin den privaten GitHub-Meldeweg verwenden.

Beschreibe betroffene Version, Betriebssystem, Auswirkungen und eine möglichst kleine Reproduktion mit fiktiven Daten. Keine echten Zugangsdaten, privaten Schlüssel oder fremden Einreichungen beifügen.

## Umgang mit Testdaten

Verwende fiktive Einreichungsdaten und eigene Testzugänge. Zugangsdaten und private Schlüssel werden lokal verarbeitet und standardmäßig nicht dauerhaft gespeichert. Das Entfernen einer Sitzung widerruft kein bereits ausgestelltes Token beim Dienst.

Optional gespeicherte Profile und Schlüssel werden unter Windows benutzergebunden mit DPAPI verschlüsselt. Es gibt keinen Klartext-Fallback. Die Sicherung kann nur mit den zugehörigen Windows-Benutzerschlüsseln geöffnet werden. Grenzen und offene Freigabenachweise stehen in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
