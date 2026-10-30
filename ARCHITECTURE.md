# Architektur

Vue → Tauri/Rust → Java-Host → FIT-Connect SDK v2/v3 → TEST, STAGE oder PROD

| Modul                             | Aufgabe                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `frontend/src`                    | Oberfläche, Entwürfe und Bestätigungen                           |
| `desktop/src`                     | Tauri-Befehle, IPC, Profile und Vorgangsspeicher                 |
| `engine/contract`                 | SDK-unabhängige Verträge                                         |
| `engine/host`                     | Sitzungen, Berechtigungen, Ressourcenlimits und Schreibfreigaben |
| `engine/adapter-v2`, `adapter-v3` | SDK-Aufrufe, Serialisierung und Kryptografie                     |

Die SDK-Versionen laufen in getrennten Classloadern. Gemeinsame Verträge enthalten keine SDK-Typen.
Die Umgebung ist je Engine-Prozess fest. Ein Umgebungswechsel beendet die bisherigen Verbindungen.
Der API-Wechsel innerhalb derselben Umgebung kann die aktuelle Anmeldung wiederverwenden;
Schlüssel, Profile und Vorgänge bleiben nach API getrennt.

## Zuständigkeiten

`App.vue` verbindet die Arbeitsbereiche. Verbindung, Profile und Diagnose liegen unter `frontend/src/app`. Die Fachansichten verwenden ihre Ablaufsteuerung unter `send`, `receive`, `reply`, `cases`, `destinations`, `events` und `process`. Beim Senden gehören Entwurf, Anzeigezustand und bestätigter Versandversuch zu getrennten Zuständen. Styles beginnen bei `styles/index.css`, gemeinsame Farben und Schriften bei `styles/theme.css`.

Rust trennt Befehle unter `commands`, Prozesskommunikation in `engine.rs` und die zentrale Schreibabsicherung in `write_policy.rs`. Der Java-Host prüft Frames in `EngineRequest` und delegiert über `SessionManager` an fachliche Koordinatoren. `SessionState` besitzt die SDK-Sitzungen und räumt deren Ressourcen auf. SDK-spezifische Sitzungen und Destination-Aufrufe bleiben in ihrem Adapter.

## Sicherheitsgrenzen

- Der Renderer hat keine allgemeinen HTTP-, Shell- oder Dateisystemrechte. Private Archivbefehle (`export_session_item`, `restore_session_item`) sind nur aus Rust erreichbar.
- Schreibaktionen sind an Inhalt, Sitzung, API und Ziel gebunden und benötigen eine Bestätigung. Nach einem ungewissen Übertragungsausgang erfolgt kein automatischer Neuversand.
- Annahme und Ablehnung benötigen aktuelle native Inhaltsnachweise. Historische Kopien und Event-Logs ersetzen diese nicht. Case-Logs können mehrere Nachrichten und quittierende Destinations enthalten. Jeder Aussteller wird anhand seines registrierten Schlüssels per SDK verifiziert; jedes Ereignis bleibt an die angefragte Case-ID gebunden.
- Profile, private Schlüssel und Vorgangskopien werden getrennt und benutzergebunden mit Windows-DPAPI gespeichert. Vorgänge sind nach Profil und API isoliert. Tokens und alte Prüfnachweise werden nicht wiederhergestellt. Andere Plattformen haben keinen Klartext-Fallback.
- Profilsicherungen werden nativ entschlüsselt. Drag-and-drop reicht nur größenbegrenzte, verschlüsselte `.fctest-profile`-Dateien weiter und gibt Profilmetadaten zurück. Eine Profil-Sicherung enthält keine Vorgänge.
- Antwortschlüssel werden vor dem Versand gesichert. Bei aktivierter Vorgangsaufbewahrung muss die Sicherung vor der Empfangsbestätigung gelingen. Ein Speicherfehler nach erfolgtem Versand darf keinen erneuten Versand auslösen.
- Öffentliche Schemaquellen benötigen eine ausdrückliche Freigabe für die aktive Verbindung. Die Freigabe wird weder im Profil gespeichert noch auf eine andere Verbindung übertragen. Lokale Schemata benötigen sie nicht.
- Leistungsnamen können gezielt aus dem öffentlichen FIM-Portal geladen werden. Der Renderer darf dafür ausschließlich die festgelegte HTTPS-Quelle verwenden; übertragen werden LeiKa-Kennungen, keine Zugangsdaten oder Fachdaten.
- Gemeinsame Nachrichtendownloads benötigen eine native Ordnerfreigabe. Exportiert werden erfolgreich geprüfte Originalinhalte oder ausdrücklich gekennzeichnete historische Vorgangskopien. Downloads liegen unverschlüsselt außerhalb der DPAPI-Ablage. Annahmen mit gewähltem Download werden erst nach erfolgreichem Export gesendet. Technische Fehler im Sammeldurchlauf bleiben manuell; es gibt keine automatische Ablehnung.

JSON/XML-Fachdaten werden im nativen Kern gegen JSON Schema beziehungsweise XSD geprüft. Vor dem Versand ist die Prüfung standardmäßig aktiv. Bewusste Negativtests lassen sich ausdrücklich ohne Fachdatenprüfung vorbereiten. Die Bestätigung weist darauf hin.

Testpakete und Schema-Vergleich arbeiten lokal im Renderer. Pakete enthalten fiktive Nutzdaten, Anlagen, lokale Schemata und manuelle Erwartungen. Verbindungsdaten und private Schlüssel werden nicht übernommen. Erst die Übernahme in den normalen Versandablauf ermöglicht einen separat bestätigten Versand.

## Anwendungsupdates ab 0.3.0

Die Updatesuche ist unabhängig von der FIT-Connect-Engine und verwendet eigene
native Befehle. Der Renderer erhält nur begrenzte Statusdaten und kann weder
Downloadpfad, Prüfschlüssel noch Installerargumente vorgeben. `update_policy.rs`
prüft Ziel, Version und die Minisign-Signatur samt Versionsbindung;
`update_transport.rs` begrenzt HTTPS-Abrufe und Weiterleitungen.
`application_updates.rs` hält Release-Identität und geprüfte Bytes ausschließlich
nativ. Der offizielle Tauri-Updater startet nach einer nativen Bestätigung NSIS
im Update-Modus. Vorher werden geschützte Schlüssel gesichert und der Java-Kern
geordnet beendet; aktive Kernaufrufe und offene Exporte blockieren die Installation.
Die neue Version wird nicht automatisch ohne Zustimmung installiert.

## BPMN-Referenzen

BPMN-Element-IDs werden nicht als FIT-Connect-Kennungen verwendet. Eigene Modelle können diese Client-Erweiterung nutzen:

```xml
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:fc="urn:fit-connect:test-client:bpmn:1"
  targetNamespace="urn:mein-test" fc:processModelId="vereinbarte-modellkennung">
  <bpmn:message id="BpmnMessage_1" name="Nachforderung"
    fc:messageId="vereinbarte-nachrichtenkennung"
    fc:schemaUri="urn:vereinbartes:antwortschema:1" fc:mimeType="application/json"/>
</bpmn:definitions>
```

`processModelId` darf auch an der Nachricht stehen. Schemahinweise sind optional, erfordern aber URI und MIME-Typ. Zuordnungsdateien sind an den SHA-256 des Modells gebunden. Replies verwenden nur die Bezüge und Schemata des geprüften Antwortkanals. Beispiel: `frontend/src/examples/test-process.bpmn`.

## Tests

SDK-Tests prüfen Verschlüsselung und Rundläufe. Frontend- und native Tests die Verträge und Kontextbindung. Browser-Fixtures werden nicht ausgeliefert. DPAPI, Installation und Upgrades werden unter Windows geprüft. Reale Austausche auf FIT-Connect TEST. Befehle stehen in [CONTRIBUTING.md](CONTRIBUTING.md).

Änderungsprüfungen wählen betroffene Module aus. Die manuelle Windows-Release-Prüfung baut das vollständige Paket und prüft Installation, Profilerhalt und NVDA. Die Signierung erfordert einen erfolgreichen Lauf für denselben Commit. Ein separater Windows-Runner prüft anschließend das signierte Paket.

## Erweiterungen für 0.3.0

Die Testabläufe kombinieren vorhandene Testfälle und prüfen lokale Nachrichtenergebnisse. Sie besitzen keine zusätzliche Schreibberechtigung; Versand, Empfangsbestätigungen und Antworten bleiben hinter ihren bestehenden nativen Bestätigungen. Der Versandabgleich liest signierte SETs anhand bekannter Kennungen und verändert keinen Versandversuch.

Profil-Arbeitsdaten (Destination-Vorlagen, Merkliste und lokale Konfigurationshistorie) liegen getrennt von Credentials und Vorgängen in Windows-DPAPI-Dateien. Zusätzliche Entropie bindet Profil, Umgebung und API. Nur native Engine-Ergebnisse erzeugen Historieneinträge. Vor dem Schreiben wird ein ungewisser Zustand dauerhaft hinterlegt; ein Fehler der abschließenden Speicherung darf einen tatsächlichen Servererfolg nicht als fehlgeschlagenen Versand umdeuten. Profilentfernung löscht auch diese Arbeitsdaten. Profil-Backups enthalten sie nicht.

Der optionale Scanner ist im gemeinsamen Java-Host hinter beiden SDK-Adaptern angesiedelt. Er prüft nach Kryptografie und vor Inhaltsfreigabe; ausgehende unveränderliche Vorbereitungen werden vor dem tatsächlichen SDK-Schreibaufruf erneut geprüft. Jeder Scan hat ein Gesamtzeitlimit einschließlich DNS, Verbindung, Schreiben und Antwort. Nur ClamAV `stream: OK` oder ICAP 204 ohne Infektionsmeldung gelten als unauffällig. Eigene Gegenstellen werden nativ bestätigt und gelten für die Verbindung. Kein Callback-Dienst oder FBForge-Relay.

Die native Schicht verwaltet optional einen lokalen ClamAV als Benutzerprozess. Festes Manifest, offizieller Talos-Schlüssel, Archiv-/Dateihashes und signierte CVD-Dateien bilden die Vertrauensgrenze. ZIP-Importe sind begrenzt; Engine und Datenbanken werden vor atomarer Übernahme geprüft. Unterbrochene Verzeichnis-/Einstellungstausche stellen beim nächsten Start den vorhandenen Vorgänger wieder her; eigene temporäre Scannerdateien werden beim Stoppen und nächsten Start bereinigt. Windows-Jobobjekte beenden ausschließlich eigene Prozesse auch bei erzwungenem App-Ende; Bereitschaft erfordert einen dem Prozess zugeordneten Loopback-Port. Der Renderer liefert weder Programmpfade noch Download-URLs. Updates der Signaturen sind gesondert zustimmungspflichtig. Komponente und Einstellungen liegen unter dem lokalen App-Datenverzeichnis, unabhängig von FIT-Connect-Profilen.

Anlagenfunde entfernen ausschließlich betroffene Bytes aus dem freigegebenen Snapshot. `scan-report` speichert begrenzte Kennungen und Namen im geschützten lokalen Vorgang. Ein vollständiger Originalexport ist dann nativ gesperrt. Hostseitig gebundene Problem-IDs bleiben mit den ursprünglichen Authentifizierungstags verbunden und werden im signierten Accept als `problems` gemeldet. Dafür ist eine zusätzliche native Bestätigung nötig; Sammelannahme bleibt gesperrt. Metadaten-/Fachdatenfunde und unvollständige Scans geben keinen Annahmenachweis frei.
