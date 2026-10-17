# BPMN und FIT-Connect-Zuordnung

FBForge Connect liest BPMN 2.0, führt aber keine Modelle aus. BPMN-IDs und Anzeigenamen werden nicht als FIT-Connect-Kennungen interpretiert. Ein Diagrammklick, ein Import und eine Empfängersuche schreiben nichts an TEST.

## Explizite Konvention

Eigene Modelle können die Erweiterungsnamensräume am Definitionsknoten deklarieren:

```xml
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:fc="urn:fit-connect:test-client:bpmn:1"
  targetNamespace="urn:mein-test" fc:processModelId="vereinbarte-modellkennung">
  <bpmn:message id="BpmnMessage_1" name="Nachforderung"
    fc:messageId="vereinbarte-nachrichtenkennung"
    fc:schemaUri="urn:vereinbartes:antwortschema:1" fc:mimeType="application/json"/>
</bpmn:definitions>
```

Diese Konvention gehört zum Test-Client; sie ist keine von FIT-Connect vorgeschriebene BPMN-Kodierung. `processModelId` kann alternativ an einer Nachricht stehen. Schemahinweise sind optional, müssen aber als URI/Format-Paar angegeben werden. Die Herkunft von BPMN-Element-ID, Nachrichtenreferenz und FIT-Connect-Kennung wird getrennt angezeigt. Der Prefix kann anders heißen, sofern er am Definitionsknoten auf denselben Erweiterungsnamensraum verweist.

Auswählbar sind Nachrichtenflüsse, Sende-/Empfangsaufgaben und Nachrichtenereignisse mit auflösbarer `messageRef`. Ereignisdefinitionen benötigen keine eigene XML-ID. Modelle ohne Diagrammkoordinaten bleiben über die Tastaturliste nutzbar. Unbenutzte BPMN-Nachrichten können ebenfalls explizit zugeordnet werden.

## Manuelle Zuordnung und Wiederanlauf

Fehlende Kennungen können in der Oberfläche ausdrücklich zugeordnet werden. Die exportierte JSON-Datei enthält Formatversion 1, den SHA-256-Fingerabdruck der unveränderten Modelldatei und die Zuordnungen je BPMN-Nachrichten-ID. Sie enthält keine Zugangsdaten, Schlüssel oder Fachdaten. Nach einer Modelländerung muss die Zuordnung neu geprüft werden; ein abweichender Fingerabdruck wird nicht still übernommen. Optional merkt sich die Anwendung bis zu 20 Zuordnungsdateien lokal. Die Modelldatei wird dadurch nicht gespeichert.

Ein Prozessentwurf ist an die aktuelle v3-Sitzung gebunden. Beim Übernehmen wird das aktuelle Empfängerangebot erneut geladen. Eigener Absender, Leistungsbezug für neue Vorgänge, Daten, Schema und Bestätigung bleiben eigenständige Eingaben/Prüfungen. Das SDK prüft das Angebot beim Versand erneut.

## Prozess-Replies

Eine Prozess-Submission und ein Reply sind unterschiedliche Übertragungen. Für Prozess-Replies wird die ausdrücklich angebotene Modell-/Nachrichten-Zuordnung des geprüften `reply-channel`-Datasets aus Metadaten 3 benötigt. Der Client prüft zusätzlich das angebotene Schema und Format. Eine beliebige BPMN-Auswahl erlaubt keinen Reply. Beim Versenden eines Antwortangebots können vereinbarte Prozessantworten aus dem Modell ausdrücklich aufgenommen werden. Die native Profilsicherung erhält diese Grenzen zusammen mit dem privaten Antwortschlüssel.

Der Empfänger kann den Nachrichtenbezug einer technisch geprüften Submission oder eines Replies im Modell zeigen. Dies ist eine Orientierungshilfe und bestätigt keinen vollständig ausgeführten Fachprozess.

## Grenzen und Testdatei

Die fiktive Demo liegt unter `frontend/src/examples/test-process.bpmn`: Antrag, Nachforderung, Nachreichung und Rückmeldung mit ausdrücklichen Testkennungen. Sie setzt keine echten Zustellpunkte voraus; ein realer Test benötigt passende eigene Angebote und Berechtigungen.

UTF-8, höchstens 2 MiB, 10.000 XML-Elemente, 500 Diagrammelemente und 500 Nachrichten. Parsing läuft mit Zeitlimit in einem Worker. DTD, Entitäten, aktive Inhalte, externe Ressourcen sowie mehrdeutige oder nicht auflösbare Referenzen sind ausgeschlossen. Der Viewer lädt keine externen Modelldateien. Sein lizenzpflichtiges bpmn.io-Wasserzeichen bleibt sichtbar.
