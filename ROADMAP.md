# Weitere Planung

## 0.4.0 in Vorbereitung

Der Release-Branch erweitert die vorhandenen Testfunktionen um geführte Abläufe,
Tests aus Vorgängen, variable Daten und Datensätze, gezielte Erwartungen,
einen begrenzten Wartemodus sowie den Vergleich gespeicherter Durchläufe.
Testserien kombinieren Datensätze und API-Versionen. Unterschiede bleiben im
Prüfverlauf erhalten. Fachliche Dialoge unterstützen mehrere Antworten im selben Vorgang.
Die [Versionshinweise](RELEASE_NOTES.md) beschreiben den Umfang. Veröffentlichung
setzt die Abnahme des endgültigen Releasekandidaten voraus.

## 0.5.0 geplant: macOS

Apple Silicon nativ unterstützen, einschließlich geschützter Speicherung,
Java-Laufzeit, lokalem Scanner, Plattformbedienung, signierten Updates und
vollständiger Windows-/Mac-Abnahme. Der
[Umsetzungsplan](docs/plans/RELEASE_0.5.0_MACOS.md) enthält Arbeitspakete,
Abhängigkeiten, Abnahmekriterien und offene technische Entscheidungen.
Der Planungsstand ist keine Implementierung oder Veröffentlichungszusage.

## Später

- Intel-Macs und Linux nach eigener Prüfung von Paketierung, Installation und
  geschützter Speicherung unterstützen. Kein unverschlüsselter Ersatzspeicher.
- Tests des ZBP-Adapters prüfen, sobald passende Testzugänge und Zertifikate
  sowie ein konkreter Anwendungsfall vorliegen.
- Vereinfachungen aus tatsächlichen Integrationsversuchen ableiten.

Größere Anlagen und Mehrparteienprozesse sind derzeit nicht eingeplant.
Netzwerk-Vorabprüfung und Routing-Debugger gehören zu **FBForge Inspect**.
Eine BPMN-Prozess-Engine und ein gehosteter Callback-Dienst sind nicht vorgesehen.
