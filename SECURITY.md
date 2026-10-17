# Sicherheit

FBForge Connect ist ausschließlich für Integrationstests auf der FIT-Connect-Testumgebung vorgesehen. Die Produktivumgebung wird nicht unterstützt. Das Projekt befindet sich in Entwicklung.

## Sicherheitsprobleme melden

Bitte keine ausnutzbaren Sicherheitslücken, Zugangsdaten, privaten Schlüssel oder Einreichungsdaten in öffentlichen Issues veröffentlichen.

Für normale Fehler und Verbesserungsvorschläge sind die [GitHub Issues](https://github.com/FBForge/fbforge-connect/issues) vorgesehen. Sicherheitslücken bitte privat melden. Als Kontakt ist `kontakt@fbforge.de` vorgesehen; Einrichtung und Empfang sind noch nicht bestätigt. Diese Adresse ist deshalb noch kein bestätigter betriebsbereiter Meldeweg und wird vor der Alpha-Freigabe entsprechend aktualisiert. Öffentliche Issues sind kein privater Sicherheitsmeldeweg.

## Umgang mit Testdaten

Verwende fiktive Einreichungsdaten und eigene Testzugänge. Zugangsdaten und private Schlüssel werden lokal verarbeitet und standardmäßig nicht dauerhaft gespeichert. Das Entfernen einer Sitzung widerruft kein bereits ausgestelltes Token beim Dienst.

Optional gespeicherte Profile und Schlüssel werden unter Windows benutzergebunden mit DPAPI verschlüsselt. Es gibt keinen Klartext-Fallback. Die Sicherung kann nur mit den zugehörigen Windows-Benutzerschlüsseln geöffnet werden. Grenzen und offene Freigabenachweise stehen in [SECURITY_REVIEW.md](https://github.com/FBForge/fbforge-connect/blob/alpha1-work/SECURITY_REVIEW.md).
