# Alpha-1-Umsetzung

Work-Goal: [ALPHA1_GOAL.md](ALPHA1_GOAL.md). Noch kein freigegebener Alpha-1-Stand.

| Paket | Stand |
| --- | --- |
| A: Vorgänge / Ereignisse / Reply-Quittierung | Case-Eventlogs mit eigener Mehrfach-Subjekt-Prüfung; bekannte Kennungen sitzungsgebunden übernehmen; bestätigte Reply-Annahme/-Ablehnung einschließlich Wiederholungsschutz implementiert. Automatisierte SDK-, Protokoll- und Browserprüfungen erfolgreich. |
| B: Geschützte Profile | Optionaler Windows-DPAPI-Speicher und native Archivschnittstelle implementiert. Antwortschlüssel vor Versand sichern, Wiederherstellung mit neuer Authentifizierung, Registrierung importierter Zustellpunktschlüssel neu prüfen. SDK-Neustarttest, Frontend-Prüfungen und Windows-Cross-Compile erfolgreich. Tatsächliche Windows-DPAPI-Ausführung sowie geschützter Sicherungsexport/-import und weitere Profilpflege bleiben offen. |
| C: Zustellpunkte / Schlüssel | Noch offen. |
| D: BPMN / Prozesskommunikation | Noch offen. |
| E: Fachdaten / UX / Wartbarkeit | Fortschreitende Überarbeitung je Paket; gesamte UX-/Barrierefreiheitsprüfung und verbindliche Formatierungs-/Lint-Prüfungen noch offen. |
| F: Freigabe | Vollständige Regressionen laufen paketweise. Windows-Installation, Upgrade, echte TEST-Abnahme und Verteilungsentscheidung noch offen. |

Entwicklungsstände werden zu sinnvollen Paketen gebündelt. Die neue Arbeit wird bis zur vollständigen Prüfung getrennt von der vorhandenen dev.7-Verteilung gehalten. Die Live-Abnahme benötigt berechtigte TEST-Zugänge; automatisierte Fixtures sind dafür kein Ersatz.
