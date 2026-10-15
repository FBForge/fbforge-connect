# Roadmap

Stand: 15. Oktober 2026. Dies ist eine Entwicklungsplanung ohne zugesagte Veröffentlichungstermine.

Abgehakte Punkte beziehen sich auf den bisherigen, noch nicht veröffentlichten Entwicklungsstand. Sie bedeuten keine vollständige Live-Abnahme oder freigegebene Beta.

## 1. Technische Grundlage

- [x] Eigenständige Desktop-Projektstruktur mit Tauri und Vue.
- [x] Lokaler Java-Kern mit mitgelieferter Laufzeit.
- [x] Getrennte SDK-Adapter für API v2 und v3.
- [x] Lokale TEST-OAuth-Sitzungen getrennt nach API und Rolle.
- [x] Zertifikatsprüfung für selbstsignierte RSA-Testschlüssel.
- [x] Automatisierte Tests für SDK-Isolation, Sitzungen und Zertifikatsprüfung.
- [ ] Vollständiger Windows-Installer-Test auf einem frischen System.
- [ ] Live-Abnahme mit eigenen TEST-Zugangsdaten.

## 2. Schlüssel und Sitzungen

- [ ] Registrierte Zustellpunktschlüssel direkt von der Testumgebung laden.
- [ ] Private Schlüssel passenden geprüften Registrierungen zuordnen.
- [ ] Schlüssel innerhalb einer Sitzung für passende weitere Einreichungen wiederverwenden.
- [ ] Schlüssel beim Abmelden und Schließen der Anwendung verwerfen.
- [ ] Temporäre Reply-Schlüssel getrennt und vorgangsgebunden verwalten.

## 3. Sender und Empfänger

- [ ] Einreichungen über v2 und v3 mit Fachdaten und Anlagen senden.
- [ ] Einreichungen suchen und erneut abrufen.
- [ ] Inhalte lokal entschlüsseln und SDK-Prüfberichte anzeigen.
- [ ] Metadaten und Fachdaten als durchsuchbare JSON-Struktur oder formatierten Text anzeigen.
- [ ] Anlagen mit Dateiname, Beschreibung und ID darstellen.
- [ ] Annahme und Ablehnung mit einem Bestätigungsdialog umsetzen.
- [ ] Ungewisse Schreibausgänge erkennen und automatisches Wiederholen verhindern.

## 4. Vorgänge und Prozesse

- [ ] Antworten und Rückmeldungen im jeweiligen API-Funktionsumfang senden und empfangen.
- [ ] FIT-Connect-Event-Log mit Prüfstatus und Fehlern anzeigen.
- [ ] Prozessnachrichten der bestehenden v2-Abläufe übernehmen.
- [ ] Prozessbasierte Kommunikation über v3 integrieren.
- [ ] BPMN-Modelle visualisieren und Nachrichtenaktionen über Prozessschritte vorbereiten.

## 5. Erste öffentliche Beta

- [x] Projektbeschreibung und Roadmap veröffentlichen.
- [ ] Rechtefreigabe und Lizenzhinweise übernommener Komponenten abschließen.
- [ ] Anwendungscode mit Build- und Beitragsdokumentation veröffentlichen.
- [ ] GitHub Actions für Windows-Builds und Tests aktivieren.
- [ ] Private Meldemöglichkeit für Sicherheitsprobleme einrichten.
- [ ] Vollständige TEST-Abläufe für beide API-Versionen abnehmen.
- [ ] Bedienung in Light/Dark Mode, mit Tastatur und kleinen Fenstern prüfen.
- [ ] Windows-Paket und bekannte Einschränkungen als Beta veröffentlichen.

## Später

Optionale Betriebssystem-Schlüsselspeicherung, weitere Betriebssysteme und wiederholbare Stapeltests können nach der ersten Beta folgen.
