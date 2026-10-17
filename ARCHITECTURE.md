# Architektur und zentrale Verträge

Die Anwendung verwendet Vue im Tauri-WebView, einen nativen Rust-Prozess und einen gebündelten Java-Kern. Java lädt die beiden SDK-Versionen über getrennte Classloader. Die gemeinsamen Java-Verträge enthalten keine SDK-Typen.

```text
Vue: Eingaben, verständliche Darstellung und ausdrückliche Bestätigung
  → feste Tauri-Befehle und Rust-Protokollprüfung
  → gerahmtes, begrenztes Java-IPC
  → Host: Sitzung, Ressourcenlimits, Nachweise und Schreibfreigaben
  → isolierter v2- oder v3-SDK-Adapter
  → fest begrenzter TEST-Transport
```

## Zuständigkeiten

- `frontend/src`: Darstellung, Entwürfe und geprüfte öffentliche Antwortverträge. Der Renderer verwaltet keine dauerhaften privaten Schlüssel. Die Kennungsübersicht in `case-context.js` ist ausschließlich Navigationshilfe.
- `desktop/src`: Tauri-Berechtigungsgrenze, Prozesslebenszyklus, IPC-Prüfung und optionale geschützte Profile. `profiles.rs` verbindet den Speicher mit dem nativen Java-Archiv. `vault.rs` verschlüsselt Profile, `case_store.rs` speichert davon getrennt optionale Vorgangskopien. Beide verwenden unter Windows benutzergebundenes DPAPI; andere Plattformen haben keinen Klartext-Fallback.
- `engine/contract`: unveränderliche native Verträge. Öffentliche DTOs und private Archivdaten sind ausdrücklich unterschieden.
- `engine/host`: Begrenzung von URLs, Ressourcen, Lebensdauer und Schreibaktionen. `SessionManager` koordiniert; konkrete Zugriffsregeln und Fachzustände bleiben in eigenen Klassen.
- `engine/adapter-v2` und `adapter-v3`: SDK-Komposition, jeweilige Serialisierung, Verschlüsselung und SDK-Prüfung. Unterschiede sollen hier sichtbar bleiben.

## Nachweise und Schreibfreigaben

Eine angezeigte Kennung, eine öffentliche Zustellpunktbeschreibung und ein lokaler Verlauf sind keine Berechtigung. Annahmeaktionen benötigen aktuelle native Inhaltsnachweise. Schema-Prüfung, technische Integrität und manuelle fachliche Prüfung bleiben getrennt.

Schreibaktionen werden vorbereitet und an unveränderliche Daten, Sitzung, API und Ziel gebunden. Erst ein eigener Bestätigungsschritt darf den nativen Schreibauftrag ausführen. Ein Timeout nach möglicher Übertragung ist ungewiss und darf keinen automatischen Neuversand ermöglichen.

Ein einzelner Submission-/Reply-Log und ein Case-Log haben unterschiedliche Verträge. Case-Logs dürfen mehrere Subjekte enthalten; jedes Ereignis muss dennoch per SDK verifiziert und dem angefragten Vorgang sowie seinem Nachrichtentyp zugeordnet sein. Eine leere berechtigte Case-Antwort ist zulässig. Ein Log allein bestätigt nicht die Authentifizierungstags später heruntergeladener Inhalte.

## Geschützter Neustart

Gespeichert werden optional Zugangsdaten, registrierte private TEST-Schlüssel und native Antwortkanäle mit Schema-/Vorgangsbindung. OAuth-Tokens und alte Prüfnachweise werden nicht gespeichert. Eine neue Verbindung authentifiziert erneut; importierte Zustellpunktschlüssel werden gegen aktuelle TEST-Registrierungen geprüft.

Die privaten Engine-Befehle `export_session_item` und `restore_session_item` werden ausschließlich von Rust verwendet. Es gibt dafür keine Tauri-Handler oder Renderer-Berechtigungen. Das private Archiv darf weder über allgemeine Ressourcenoperationen durchgereicht noch in Diagnoseberichte aufgenommen werden.

Profilsicherungen werden ausschließlich nativ entschlüsselt. Der System-Dateidialog hält Pfade und Dateidaten im nativen Prozess. Für Drag-and-drop darf der Renderer eine größenbegrenzte verschlüsselte `.fctest-profile`-Datei über binäres IPC weiterreichen; er erhält nur öffentliche Profilmetadaten zurück. Derselbe DPAPI-, Format-, Größen- und Konfliktschutz gilt für beide Wege. Es entsteht keine allgemeine Dateisystem-Berechtigung. Diagnoseberichte enthalten weder Dateinamen noch Dateiinhalt. Dateiablagen lösen keinen Versand aus.

Bei einem gespeicherten Profil wird ein Antwortschlüssel bereits vor Bestätigung des Versands gesichert. Abgebrochene Vorbereitungen werden entfernt. Nach einem Prozessabbruch ausstehende Vorgänge werden als ungeklärt behandelt; gespeicherte Schlüssel sind keine Erlaubnis, eine frühere Schreibaktion fortzusetzen.

`CaseRepository` hält native, unveränderliche Versand- und Empfangskopien getrennt von aktuellen Empfangsnachweisen. Dauerhafte Inhalte sind nach gespeicherter Profil-ID und API isoliert; temporäre Client-Kontexte verwenden einen eigenen Namensraum. Vor einer Empfangsbestätigung muss eine aktivierte Sicherung gelingen. Ein nachträglicher Speicherfehler darf einen erfolgreichen Versand weder als fehlgeschlagen umdeuten noch automatisch wiederholen. Historische Kopien sind keine neue Schreibberechtigung.

## BPMN-Zuordnung

BPMN-Element-IDs und Anzeigenamen werden nicht als FIT-Connect-Kennungen geraten. Eigene Modelle können die folgende explizite Erweiterung verwenden; sie ist eine Konvention dieses Clients, kein FIT-Connect-Standard:

```xml
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:fc="urn:fit-connect:test-client:bpmn:1"
  targetNamespace="urn:mein-test" fc:processModelId="vereinbarte-modellkennung">
  <bpmn:message id="BpmnMessage_1" name="Nachforderung"
    fc:messageId="vereinbarte-nachrichtenkennung"
    fc:schemaUri="urn:vereinbartes:antwortschema:1" fc:mimeType="application/json"/>
</bpmn:definitions>
```

`processModelId` kann alternativ an einer Nachricht stehen. Schemahinweise sind optional, werden aber als URI-/Formatpaar angegeben. Manuelle Zuordnungsdateien sind an den SHA-256 des unveränderten Modells gebunden. Bei Prozess-Replies sind ausschließlich die ausdrücklich angebotenen Modell-/Nachrichtenbezüge und Schemata des geprüften Antwortkanals zulässig. Beispiel: `frontend/src/examples/test-process.bpmn`.

## Tests und Entwicklung

SDK-Tests verwenden tatsächliche SDK-Verschlüsselung und bytegenaue Rundläufe. Frontend-Vertragstests prüfen öffentliche DTOs und Kontextbindung. Browser-Fixtures unter `frontend/test-fixtures` prüfen Bedienabläufe und sind kein Bestandteil des Produktbuilds. Die isolierte Rust-Testbibliothek verwendet die produktiven Protokoll- und Speichermodule ohne WebView-Abhängigkeiten; DPAPI-Rundläufe laufen unter Windows.

Weder Fixtures noch ein Cross-Compile ersetzen die echte Windows-Installation oder FIT-Connect-TEST-Abnahme.
