# Architektur

Vue → Tauri/Rust → Java-Host → FIT-Connect SDK v2/v3 → TEST

| Modul                             | Aufgabe                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `frontend/src`                    | Oberfläche, Entwürfe und Bestätigungen                           |
| `desktop/src`                     | Tauri-Befehle, IPC, Profile und Vorgangsspeicher                 |
| `engine/contract`                 | SDK-unabhängige Verträge                                         |
| `engine/host`                     | Sitzungen, Berechtigungen, Ressourcenlimits und Schreibfreigaben |
| `engine/adapter-v2`, `adapter-v3` | SDK-Aufrufe, Serialisierung und Kryptografie                     |

Die SDK-Versionen laufen in getrennten Classloadern. Gemeinsame Verträge enthalten keine SDK-Typen.

## Sicherheitsgrenzen

- Der Renderer hat keine allgemeinen HTTP-, Shell- oder Dateisystemrechte. Private Archivbefehle (`export_session_item`, `restore_session_item`) sind nur aus Rust erreichbar.
- Schreibaktionen sind an Inhalt, Sitzung, API und Ziel gebunden und benötigen eine Bestätigung. Nach einem ungewissen Übertragungsausgang erfolgt kein automatischer Neuversand.
- Annahme und Ablehnung benötigen aktuelle native Inhaltsnachweise. Historische Kopien und Event-Logs ersetzen diese nicht. Case-Logs können mehrere Nachrichten enthalten. Jedes Ereignis wird per SDK geprüft und zugeordnet.
- Profile, private Schlüssel und Vorgangskopien werden getrennt und benutzergebunden mit Windows-DPAPI gespeichert. Vorgänge sind nach Profil und API isoliert. Tokens und alte Prüfnachweise werden nicht wiederhergestellt. Andere Plattformen haben keinen Klartext-Fallback.
- Profilsicherungen werden nativ entschlüsselt. Drag-and-drop reicht nur größenbegrenzte, verschlüsselte `.fctest-profile`-Dateien weiter und gibt Profilmetadaten zurück. Eine Profil-Sicherung enthält keine Vorgänge.
- Antwortschlüssel werden vor dem Versand gesichert. Bei aktivierter Vorgangsaufbewahrung muss die Sicherung vor der Empfangsbestätigung gelingen. Ein Speicherfehler nach erfolgtem Versand darf keinen erneuten Versand auslösen.

## BPMN

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
