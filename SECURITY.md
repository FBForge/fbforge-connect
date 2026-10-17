# Sicherheit

FBForge Connect ist ausschließlich für Integrationstests auf der FIT-Connect-Testumgebung vorgesehen. Die Produktivumgebung wird nicht unterstützt. Das Projekt befindet sich in Entwicklung.

## Sicherheitsprobleme melden

Bitte keine ausnutzbaren Sicherheitslücken, Zugangsdaten, privaten Schlüssel oder Einreichungsdaten in öffentlichen Issues veröffentlichen.

Für normale Fehler und Verbesserungsvorschläge sind die GitHub Issues des Projekts vorgesehen. Sicherheitslücken bitte privat melden; eine bestätigte, empfangsfähige Kontaktadresse wird vor der Alpha-Freigabe hier eingetragen. Öffentliche Issues sind kein privater Sicherheitsmeldeweg.

## Umgang mit Testdaten

Verwende fiktive Einreichungsdaten und eigene Testzugänge. Zugangsdaten und private Schlüssel werden lokal verarbeitet und standardmäßig nicht dauerhaft gespeichert. Das Entfernen einer Sitzung widerruft kein bereits ausgestelltes Token beim Dienst.

Optional gespeicherte Profile und Schlüssel werden unter Windows benutzergebunden mit DPAPI verschlüsselt. Es gibt keinen Klartext-Fallback. Die Sicherung kann nur mit den zugehörigen Windows-Benutzerschlüsseln geöffnet werden. Grenzen und offene Freigabenachweise stehen in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
