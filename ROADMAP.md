# Roadmap

## 0.2.0

Die Version bündelt die vereinfachten Abläufe für Windows x64:

- FIT-Connect TEST, STAGE und PROD mit getrennten Verbindungen und Profilen, V-PKI-Import sowie zusätzlichen Bestätigungen für produktive Schreibaktionen.
- Senden, Empfangen und Antworten über API v2/v3, Schema-Prüfung für JSON/XML und gezielte Freigabe öffentlicher Schemaquellen.
- Lesbare Formularansichten, erreichbare Anlagen und Aktionen, nachvollziehbarer Tastaturfokus sowie überarbeitete Destination-Verwaltung und PDF-Steuerung.
- Gemeinsamer Nachrichtendownload und Sammelannahme mit manueller Entscheidung bei technischen Fehlern.
- Geschützte Vorgangsablage und Testfall-Sammlung, wiederverwendbare Testpakete und lokaler Schema-Vergleich.
- Zentral gepflegte Web-Anleitung, aktuelle Bilder und dokumentierte Build- und Release-Abläufe.

Die Freigabe benötigt die v2/v3-Regression, Tastatur-/NVDA- und Skalierungsprüfungen sowie ein unabhängig geprüftes signiertes Windows-Upgrade. Details stehen in [RELEASING.md](RELEASING.md).

## Danach

- macOS und Linux: Paketierung, Installation, Plattform-Schlüsselspeicher und Abhängigkeiten pro Zielplattform prüfen. Es gibt keinen unverschlüsselten Ersatz für die geschützte Speicherung.
- Optionale Malwareprüfung über einen klar abgegrenzten Adapter, einschließlich ICAP oder plattformspezifischer Scanner. Fehlender oder nicht erreichbarer Scanner muss erkennbar bleiben.
- Weitere Vereinfachungen aus Rückmeldungen zum tatsächlichen Einsatz und Beiträge anderer Entwickler.

Diese Punkte sind Planungen ohne zugesagten Veröffentlichungstermin. Neue Funktionen erhalten bei Bedarf eine weitere 0.x-Version; Fehlerkorrekturen eine Patch-Version. Für 1.0.0 ist eine stabile, dokumentierte und auf den zugesagten Plattformen abgenommene Funktionalität maßgeblich. Vorgeschriebene Zwischenversionen gibt es nicht.

Ein BPMN-Prozessmotor ist nicht geplant. Die Anwendung liest Modelle und verwendet geprüfte Nachrichtenbezüge.
