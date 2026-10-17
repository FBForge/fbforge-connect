# Sicherheit

Der FIT-Connect Testclient ist ausschließlich für Integrationstests auf der FIT-Connect-Testumgebung vorgesehen. Die Produktivumgebung wird nicht unterstützt. Das Projekt befindet sich in Entwicklung.

## Sicherheitsprobleme melden

Bitte keine ausnutzbaren Sicherheitslücken, Zugangsdaten, privaten Schlüssel oder Einreichungsdaten in öffentlichen Issues veröffentlichen.

Ein privater Meldeweg wird vor der ersten Veröffentlichung des Anwendungscodes eingerichtet und hier bekanntgegeben.

## Umgang mit Testdaten

Verwende fiktive Einreichungsdaten und eigene Testzugänge. Zugangsdaten und private Schlüssel werden lokal verarbeitet und standardmäßig nicht dauerhaft gespeichert. Das Entfernen einer Sitzung widerruft kein bereits ausgestelltes Token beim Dienst.

Optional gespeicherte Profile und Schlüssel werden unter Windows benutzergebunden mit DPAPI verschlüsselt. Es gibt keinen Klartext-Fallback. Die Sicherung kann nur mit den zugehörigen Windows-Benutzerschlüsseln geöffnet werden. Grenzen und offene Freigabenachweise stehen in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
