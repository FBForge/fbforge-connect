# Abschließende Plattformprüfung für Alpha 1

Entscheidung: **Alpha 1 bleibt zunächst auf Windows.** macOS und Linux sind technisch plausible Ziele, erfüllen die Bedingung „ohne größeren Aufwand“ für den vollständigen aktuellen Funktionsumfang aber noch nicht. Es werden keine ungeprüften Pakete oder Klartext-Speicherlösungen als gleichwertige Unterstützung veröffentlicht.

Die Grundlage ist bereits weitgehend portabel: Vue/Vite, Tauri, beide Java-SDK-Adapter, lokale Schemaverarbeitung und BPMN. Der native Start und das `jlink`-Staging unterscheiden bereits zwischen Windows und Unix. Java-Tests laufen auf Linux, und der Windows-Build prüft die tatsächlichen DPAPI-Verträge. Ein Wechsel des Frameworks ist dafür nicht erforderlich.

## Konkrete zusätzliche Arbeit

| Bereich | macOS | Linux |
| --- | --- | --- |
| Zugangsdaten und private Schlüssel | Schlüsselbund integrieren und die Wiederherstellung nach Neustart, gesperrten Speicher, Löschen und Sicherungen testen | Secret Service integrieren; fehlenden/gesperrten Dienst sicher behandeln, ohne Klartext-Fallback |
| Vollständige Funktionen | Automatische Zustellpunktschlüssel benötigen vor der Registrierung einen geschützten Checkpoint; der heutige DPAPI-Tresor ist nur auf Windows nutzbar | Gleiche Anforderung; reine anonyme oder sitzungsgebundene Bedienung wäre keine vollständige Alpha-Unterstützung |
| Paket und Laufzeit | Eigene JDK-/App-Bundles pro unterstützter Architektur, Icons, Bibliotheks-Signierung und Gatekeeper/Notarisierung prüfen | Eigene JDK-/Pakete und Abhängigkeiten für konkret benannte Distributionen/Desktop-Umgebungen prüfen |
| Sicherheitsbefunde | Zielabhängige Dependency-Prüfung vor Paketfreigabe | Den dokumentierten `glib 0.18.5`-Befund RUSTSEC-2024-0429 und `proc-macro-error 1.0.4` prüfen und kompatibel beheben; kein erzwungenes inkompatibles Lockfile-Update |
| Bedienung und Lebenszyklus | Native Dateidialoge, Tastatur, Fokus, Skalierung, Installation/Upgrade/Entfernen auf echten macOS-Runnern/Systemen | WebKitGTK-Darstellung, Dialoge, Tastatur, Skalierung sowie Installation/Upgrade/Entfernen auf den benannten Systemen |

Die Rust-Verträge des heutigen Tresors geben auf anderen Betriebssystemen ausdrücklich `vault_unsupported` zurück. Das ist eine bewusste Grenze und kein dort getesteter Schlüsselspeicher. Ebenso ist der aktuelle Bundle-Target `nsis` auf Windows festgelegt. Ein zusätzlicher CI-Build allein würde diese Punkte nicht lösen.

Für einen späteren Plattform-Schritt bleibt die öffentliche Profil-/Inventar-Schnittstelle erhalten; die Betriebssystemverschlüsselung wird hinter der nativen Speichergrenze ergänzt. API-Adapter und Renderer dürfen weder Klartext-Dateien als Ersatz anlegen noch private Archivdokumente erhalten. Eine konkrete Plattformzusage folgt erst nach diesen Prüfungen.
