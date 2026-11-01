# Weitere Planung

Die umgesetzten Änderungen für 0.3.0 stehen in den [Versionshinweisen](RELEASE_NOTES.md).
Abnahmestand und offene Freigabepunkte enthält der [Prüfbericht](docs/design-review/README.md).

Mögliche spätere Erweiterungen, ohne zugesagten Termin:

- Wiederverwendbare Integrationsszenarien auf Basis vorhandener Testfälle und
  Abläufe. Eigene Gegenstellen und externe Prüflinge unterscheiden. Benötigte
  Rollen, Angebote, Schema-Dateien und Berechtigungen als Konfigurationsauftrag
  beschreiben, ohne Secrets zu exportieren oder fremde Destinations automatisch zu ändern.
- Abdeckung nach API, JSON/XML, Leistung/Prozess, Antwortkanal, Anlagen und
  Fehlerfällen sichtbar machen. Nicht anwendbare und noch nicht ausgeführte
  Kombinationen von bestandenen Tests unterscheiden.
- macOS und Linux nach eigener Prüfung von Paketierung, Installation und
  geschützter Speicherung unterstützen. Kein unverschlüsselter Ersatzspeicher.
- Weitere Vereinfachungen aus tatsächlichen Integrationsversuchen ableiten.

Netzwerk-Vorabprüfung und Routing-Debugger gehören zu **FBForge Inspect**.
Eine BPMN-Prozess-Engine und ein gehosteter Callback-Dienst sind nicht vorgesehen.
