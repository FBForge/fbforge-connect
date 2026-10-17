# FBForge Connect · 0.1.0-dev.9

**Alpha-1-Kandidat für Windows x64 und FIT-Connect TEST. Noch keine Alpha-1-Freigabe.** Der Installer ist unsigniert. Aktuelle Prüfstände und offene Freigabenachweise stehen in [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md).

## Neues in dev.9

- Vorgangsübersicht für gesendete und empfangene Einreichungen und Antworten, mit Suche, Formularansicht, Anlagen und Einzellöschung.
- Optionale, vom Profiltresor getrennte Windows-Aufbewahrung. Originaldaten bleiben nach Annahme oder Ablehnung lokal lesbar; historische Nachweise autorisieren keine neue Serveraktion.
- Einreichungen mit einem Schritt öffnen und prüfen. Empfangsbestätigungen und Antworten werden weiterhin separat bestätigt.
- Lokale PDF-Vorschau mit Seitenwahl und auslesbarem Seitentext. Aktive Dokumentfunktionen bleiben gesperrt; Downloads behalten die Originalbytes.
- Vollständige Offline-Hilfe mit zwölf Themen und Bildschirmaufnahmen fiktiver Beispiele.

## Bisherige Änderungen gegenüber dev.7

- Die v3-Prozess-Empfängersuche nutzt die bestehende Anmeldung. Damit wird auch die derzeitige TEST-API unterstützt, die für diesen eigentlich öffentlichen Suchendpunkt einen Bearer-Token verlangt.
- Vollständige Einreichungen und Replies mit separater Annahme/Ablehnung; signierte Suche nach Case-, Submission- und Reply-ID. Reale v3-Vertragsfehler beim Senden, Empfang und in Ereignissen sind korrigiert und durch erneute TEST-Austausche belegt.
- Optionale Windows-Profile schützen Zugangsdaten, private Schlüssel und Antwortkanäle auch nach einem Neustart. Standard-Zustellpunkte, Profilbearbeitung, Schlüsselübersicht und geschützte Sicherungen ergänzen den Arbeitsplatz.
- Eigene v3-Zustellpunkte samt Testschlüsseln anlegen, öffentliche Registrierungen prüfen, getrennt aktivieren und Angebote beziehungsweise Schlüssel für bis zu zehn Ziele bearbeiten. Alte Entschlüsselungsschlüssel bleiben erhalten.
- BPMN-Nachrichten im lokalen Diagramm oder per Tastatur auswählen, ausdrückliche FIT-Connect-Kennungen prüfen, passende Empfänger suchen und v3-Prozessnachrichten beziehungsweise angebotene Antworten vorbereiten.
- Einheitliche Dateiablage per Drag-and-drop und Dateiauswahl für sämtliche Importe. Reduzierter BPMN-Arbeitsbereich, neue Bildmarke und einheitlicher Produktname **FBForge Connect**.
- Zusätzliche native Berechtigungsprüfungen, öffentliche FIM-Schemafälle sowie Browser-, Tastatur-, Fokus- und automatisierte Barrierefreiheitsprüfungen. Wartung und Mitwirkung sind dokumentiert.

## Bestehende Installation und Profile

Die frühere Anzeige „FIT-Connect Test-Client“ wird ersetzt. Interne App-Kennung, Profilordner, verschlüsseltes Sicherungsformat und Upgrade-Registrierung bleiben kompatibel. Eine Sicherung vor einem Upgrade ist sinnvoll; sie bleibt an die zugehörigen Windows-Benutzerschlüssel gebunden. Die tatsächliche Neuinstallation, das Upgrade von dev.7 und die Deinstallation mit erhaltenem DPAPI-Profil wurden im [Windows-Lauf 39037553713](https://github.com/FBForge/fbforge-connect/actions/runs/39037553713) auf `06a7ee2` erfolgreich geprüft.

Das Windows-Actions-Artefakt enthält nach erfolgreicher Installationsprüfung den Setup-Installer, `SHA256SUMS.txt` und `build-info.json` mit Version, Commit und Workflow-Lauf. Eine Prüfsumme bestätigt Dateigleichheit und ersetzt keine Herausgebersignatur. Eine Anleitung für den ersten Testvorgang steht in [BEDIENUNG.md](BEDIENUNG.md).

## Bisheriger geprüfter Download (dev.8)

[Vollständiger Prüflauf 39054324070](https://github.com/FBForge/fbforge-connect/actions/runs/39054324070), Quellstand `ea856f6137abee8a5b16174ad714b822f165891a`. Das [Installer-Artefakt](https://github.com/FBForge/fbforge-connect/actions/runs/39054324070/artifacts/12108794327) enthält Setup, Prüfsumme und Build-Manifest. Der unabhängige Downloadabgleich bestätigt 54.636.300 Installerbytes und SHA-256 `759fc857cad5beb17c9042eb582bec53b450c8e809d15a5c9cc3c4202af80499`. Der NVDA-Bericht ist an dieselbe Datei gebunden. Windows-Installation, dev.7-Upgrade und Profil-Erhalt sind bestanden; die reale API-Leseprüfung einschließlich authentifizierter Prozesssuche läuft getrennt mit denselben SDK-Adaptern. Der Nachweis gilt für genau diesen Quellstand und Installer.

## Bekannte Grenzen

- Ausschließlich TEST und fiktive Daten; keine PROD-Unterstützung. macOS/Linux benötigen weitere sichere Speicherintegration und eigene Abnahmen.
- Kein integrierter Malwarescanner. Technische Integrität, Schema-Prüfung und fachliche Bewertung bleiben getrennte Ergebnisse.
- Kein universeller FIM-Formulareditor, vollständiger BPMN-Editor oder Prozessmotor. Unvollständige Schema-/Modellzuordnungen werden nicht durch Vermutungen ersetzt.
- Aktivierte TEST-Zustellpunkte können nach Deaktivierung bis zum Ablauf der serverseitigen Frist nicht gelöscht werden. Restbestände der eigenen CI-Abnahmen sind in [LIVE_TESTS.md](LIVE_TESTS.md) dokumentiert.
- Ein ungewisser Schreibausgang wird nicht automatisch wiederholt. Offene Vorgänge vor einem manuellen Neuversand prüfen.
- Reale Screenreader-/Skalierungsabnahme und Herausgebersignierung sind vor einer Alpha-1-Freigabe offen. Der private GitHub-Sicherheitsmeldeweg ist aktiviert. Der gezielte NVDA-Lauf gegen den zuvor geprüften Kandidaten besteht; auch der vollständige aktuelle Paketlauf mit korrigiertem Testaufbau besteht. Keine BSI- oder vollständige WCAG-Konformitätsbehauptung.
