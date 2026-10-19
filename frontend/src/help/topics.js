/** Bundled offline guide. All screenshots use fictional examples and contain no credentials. */
export const helpTopics = [
  {
    id: 'start',
    title: 'Schnellstart',
    section: 'Start',
    image: 'overview',
    caption: 'Arbeitsbereiche von FBForge Connect. Die Hilfe steht auch ohne Verbindung zur Verfügung.',
    intro:
      'FBForge Connect ist ein unabhängiges Testwerkzeug für FIT-Connect. Alle Verbindungen führen ausschließlich in die TEST-Umgebung. Verwenden Sie fiktive Personen- und Antragsdaten.',
    steps: [
      'Wählen Sie oben API v3 für neue Tests. API v2 bleibt für bestehende Integrationen verfügbar.',
      'Öffnen Sie „Verbinden“ und geben Sie die TEST-Client-ID sowie das Client-Secret Ihres Onlinediensts oder Fachverfahrens ein.',
      'Eine Destination ist ein Zustellpunkt bei FIT-Connect. Ein Onlinedienst sendet Einreichungen und empfängt angebotene Antworten. Ein Subscriber ist das empfangende Fachverfahren. Er ruft Einreichungen ab und kann darauf antworten. Die API und der Zugang müssen zu Ihrem Test passen.',
      'Wählen Sie auf „Start“ Ihre Testaufgabe: „Einreichung senden“ für einen Testantrag oder „Einreichung empfangen“ für den Eingang. Die Bereiche sind auch direkt über die Navigation erreichbar. Unter „Vorgänge“ finden Sie lokale Kopien.',
      'Führen Sie zuerst einen kleinen Test mit fiktiven JSON-Daten durch. Prüfen Sie anschließend Anlagen, Empfangsbestätigung und gegebenenfalls Antworten.',
    ],
    notes: [
      'Das Werkzeug ersetzt kein produktives Fachverfahren und ist keine offizielle Anwendung der FITKO.',
      'Die Alpha wird weiterhin entwickelt. Ein erfolgreiches technisches Ergebnis ersetzt keine fachliche Bewertung des Antrags.',
    ],
  },
  {
    id: 'connection',
    title: 'Verbinden und Profile',
    section: 'Senden',
    image: 'profiles',
    caption:
      'Verbindungsdialog für den TEST-Zugang und die optionale Profilspeicherung. Zugangsdaten werden in der Anleitung nicht gezeigt.',
    intro:
      'Ein Profil bündelt einen TEST-Zugang und seine API-Version. Gespeicherte Profile ersparen die erneute Eingabe nach einem Neustart.',
    steps: [
      'Öffnen Sie „Verbinden“. Für einen einmaligen Test lassen Sie das Speichern ausgeschaltet.',
      'Für wiederkehrende Tests aktivieren Sie das Speichern und vergeben Sie einen verständlichen Namen, zum Beispiel „Musterfachverfahren v3“.',
      'Prüfen Sie vor dem Verbinden, ob Zugang und API-Version zu Ihrem Test passen. Die Berechtigungen Ihres Zugangs bestimmen die verfügbaren Funktionen.',
      'Unter den gespeicherten Profilen können Sie einen Zugang wieder öffnen, umbenennen, aktualisieren oder entfernen.',
      'Speichern Sie Schlüsseländerungen im Profil und beachten Sie Hinweise auf ausstehende Sicherungen. Bewahren Sie zusätzlich eine eigene sichere Schlüsselsicherung auf.',
    ],
    notes: [
      'Dauerhafte Profile und private Schlüssel werden auf Windows mit dem Benutzerkonto verschlüsselt. Es gibt keinen unverschlüsselten Ersatzspeicher.',
      'Beim Entfernen eines gespeicherten Profils werden auch dessen dauerhaft gespeicherte Vorgangskopien gelöscht.',
      'Profil-Sicherungen sind verschlüsselt und an das Windows-Benutzerkonto gebunden. Sie sind kein allgemeiner Export für andere Rechner oder Benutzer.',
      'Ein Profil-Backup enthält keine Vorgangsablage. Die Aufbewahrung von Vorgängen wird separat eingeschaltet.',
    ],
  },
  {
    id: 'send',
    title: 'Einreichung senden',
    section: 'Senden',
    image: 'send',
    caption: 'Eine fiktive Einreichung vorbereiten und vor dem Versand prüfen.',
    intro:
      'Sie bereiten zunächst Fachdaten und Anlagen vor. Erst die separate Bestätigung löst den Versand aus.',
    steps: [
      'Verbinden Sie einen Onlinedienst-Zugang und tragen Sie die Ziel-Destination ein. Laden Sie deren Leistungen und wählen Sie die passende Leistung und das Fachdatenformat.',
      'Bei API v3 lädt die Anwendung Ihre eigenen Absender-Destinations zur Auswahl. Eine einzelne aktive Destination wird automatisch übernommen. Über „ID eingeben“ können Sie eine Destination auch manuell hinterlegen. Diese muss zu Ihrem Zugang gehören und passend eingerichtet sein.',
      'Geben Sie JSON oder XML ein, ziehen Sie eine Datei in das Dateifeld oder verwenden Sie „Datei auswählen“. Fiktive Beispieldaten sind eine Starthilfe und müssen zu Ihrem Test angepasst werden.',
      'Die Formularansicht zeigt Werte lesbar an. Über JSON-Struktur oder Quelltext können Sie technische Details vergleichen. Schema-Feldnamen und Beschreibungen werden angezeigt, wenn ein passendes Schema verfügbar ist. Ansonsten bleiben Originalnamen sichtbar.',
      'Fügen Sie bei Bedarf Anlagen hinzu. Prüfen Sie Dateiname, Format und Größe. Entfernen Sie nicht benötigte Anlagen vor dem Vorbereiten.',
      'Wenn Sie eine Antwort testen möchten, aktivieren Sie vor dem Versand das Antwortangebot und wählen Sie das erlaubte Antwortschema.',
      'Wählen Sie „Versand vorbereiten“, prüfen Sie die unveränderliche Zusammenfassung und bestätigen Sie den Versand. Bewahren Sie Submission ID und Case ID für die Nachverfolgung auf.',
    ],
    examples: [
      {
        title: 'JSON-Testantrag',
        language: 'json',
        note: 'Fiktive Daten für einen eigenen Test. Passen Sie Felder und Werte an das Schema der gewählten Leistung an.',
        content: JSON.stringify(
          { antrag: { vorname: 'Erika', nachname: 'Muster', anliegen: 'Testantrag' } },
          null,
          2,
        ),
      },
    ],
    notes: [
      'Öffentliche Schemaquellen werden nur nach ausdrücklicher Freigabe geladen. Eigene lokale Schemata sind ebenfalls möglich.',
      'Bei „Ausgang ungewiss“ nicht einfach erneut senden. Nutzen Sie die bekannten IDs zur Event-Log-Prüfung, um doppelte Testnachrichten zu vermeiden.',
      'Die Vorgangsablage übernimmt den tatsächlich vorbereiteten Versandinhalt. Spätere Änderungen im Eingabefeld verändern diese Kopie nicht.',
    ],
  },
  {
    id: 'receive',
    title: 'Antrag empfangen und prüfen',
    section: 'Empfangen',
    image: 'receive',
    caption: 'Die Formularansicht eines fiktiven Antrags nach Entschlüsselung und technischer Prüfung.',
    intro:
      'Ein Fachverfahren lädt seinen Eingang, entschlüsselt den ausgewählten Antrag und prüft die technischen Inhalte. Die Empfangsbestätigung bleibt eine eigene bewusste Aktion.',
    steps: [
      'Verbinden Sie den Fachverfahren-Zugang. Wählen Sie eine eigene Destination und laden Sie die passenden privaten Testschlüssel zum Entschlüsseln und Signieren.',
      'Laden Sie verfügbare Einreichungen oder tragen Sie eine bekannte Submission ID ein. „Öffnen und prüfen“ lädt das Detail und versucht direkt die Entschlüsselung und Prüfung.',
      'Wenn Schlüssel oder Schemata fehlen, folgen Sie dem Hinweis im Empfang. Laden Sie die fehlenden Dateien und starten Sie „Inhalte entschlüsseln und prüfen“ erneut. Es wurde dabei noch nichts angenommen oder abgelehnt.',
      'Lesen Sie die Fachdaten direkt in der Formularansicht. Die Suche hilft bei umfangreichen Anträgen. Die Struktur- und Quelltextansicht bleiben verfügbar.',
      'Öffnen Sie unterstützte Anlagen über „Ansehen“ oder laden Sie die unveränderte Datei herunter.',
      'Prüfen Sie fachlich, ob der Antrag zum Testfall passt. Bereiten Sie dann „Annehmen“ oder „Ablehnen“ vor und kontrollieren Sie die Bestätigung. Beim Ablehnen wird ein passender technischer Grund benötigt.',
      'Eine lokale Kopie bleibt unter „Vorgänge“ lesbar. Wenn die dauerhafte Aufbewahrung eingeschaltet ist, wird vor der Bestätigung die Sicherung geprüft.',
    ],
    notes: [
      'Eine technische Prüfung bedeutet keine fachliche Freigabe. Hinweise wie „Kein Malwarescanner eingerichtet“ bleiben sichtbar.',
      'Bei XML kann nur die Syntax geprüft sein. Eine fehlende XSD-Prüfung wird ausdrücklich angezeigt.',
      'Die Formularansicht ist auf 256 KiB Fachdaten begrenzt. Größere Inhalte bleiben als Originaldatei verfügbar.',
    ],
  },
  {
    id: 'cases',
    title: 'Vorgänge und Aufbewahrung',
    section: 'Vorgänge',
    image: 'cases',
    caption: 'Ein lokal wieder geöffneter Antrag mit Formularansicht, Anlagen und getrennten Aktionen.',
    intro:
      'Die Vorgangsübersicht macht aus einzelnen Abrufen einen nachvollziehbaren Arbeitsverlauf. Sie ist ein lokaler Lesespeicher und keine zweite Server-Inbox.',
    steps: [
      'Öffnen Sie „Vorgänge“ und verbinden Sie das gewünschte Profil. Die Liste enthält die Nachrichten dieses Zugangs und dieser API.',
      'Suchen Sie nach Titel, Case ID, Submission ID, Reply ID oder Destination. Filtern Sie bei Bedarf nach „Empfangen“ oder „Gesendet“.',
      'Klicken Sie auf einen Titel. Fachdaten und Anlagen sind direkt im Detail lesbar. Mehrere Nachrichten mit derselben echten Case ID lassen sich über die Suche zusammen betrachten.',
      'Standardmäßig werden Kopien automatisch nur in der laufenden Anwendung gehalten. Ein Profilwechsel entfernt sie nicht. Verbinden Sie denselben Zugang erneut, um sie wieder zu sehen.',
      'Wenn Sie die Kopien nach einem Neustart weiterhin benötigen, aktivieren Sie „Vorgänge für dieses gespeicherte Profil dauerhaft aufbewahren“. Vorhandene und neue Kopien werden dann mit Ihrem Windows-Benutzerkonto verschlüsselt.',
      '„Löschen“ entfernt genau eine lokale Kopie. „Verlauf leeren“ fragt nach und löscht alle lokalen Kopien des aktuellen Profils und der aktuellen API. Auf dem TEST-Server wird dadurch nichts geändert.',
      'Zum Antworten oder erneuten technischen Prüfen wählen Sie „Im Empfang erneut prüfen / antworten“. Dafür sind eine aktuelle Sitzung und ein erneut abrufbarer Antrag erforderlich.',
    ],
    notes: [
      'Unbekannte Versand-IDs werden nicht erfunden. Ein ungewisser Versuch hat eine eigene lokale Kennung und bleibt als ungewiss erkennbar.',
      'Gespeicherte Prüfergebnisse sind historisch. Frühere Freigaben oder Empfangsnachweise werden beim Neustart nicht als aktuelle Berechtigung wiederhergestellt.',
      'Wenn Sie dauerhaftes Speichern ausschalten, bleiben bereits gespeicherte Kopien bis zum Löschen erhalten. Neue Kopien bleiben nur in der Sitzung.',
      'Grenzen: 100 Sitzungskopien und 128 MiB Gesamtinhalt je Anwendung. Maximal 256 MiB geschützter Speicher je gespeichertem Profil und API. Es werden keine alten Vorgänge stillschweigend verdrängt. Bei vollem Speicher löschen Sie nicht benötigte Kopien.',
      'Lokales Löschen ist kein garantiertes physisches Überschreiben von SSDs oder Betriebssystem-Sicherungen. Exportierte Originaldateien verwalten Sie selbst.',
    ],
  },
  {
    id: 'attachments',
    title: 'PDF, Bilder und Dateien',
    section: 'Vorgänge',
    image: 'pdf',
    caption: 'Lokale PDF-Vorschau mit Seitensteuerung und auslesbarem Seitentext.',
    intro:
      'Die Vorschau zeigt unterstützte Formate lokal. Die Originaldatei bleibt unverändert als Download verfügbar.',
    steps: [
      'Wählen Sie bei einer PDF, PNG-, JPEG-, JSON-, XML- oder Textanlage „Ansehen“.',
      'Bei PDFs wechseln Sie mit „Vorherige Seite“ und „Nächste Seite“. Unter „Seitentext lesen“ ist auslesbarer PDF-Text zugänglich. Für gescannte Seiten gibt es keine Texterkennung.',
      'Schließen Sie die Vorschau per Schaltfläche oder Escape. Der Fokus kehrt zur auslösenden Schaltfläche zurück.',
      'Wenn eine Datei nicht dargestellt werden kann, laden Sie das Original herunter. Öffnen Sie externe Programme nur bewusst und entsprechend Ihrer lokalen Sicherheitsregeln.',
    ],
    notes: [
      'PDFs und Bilder: höchstens 8 MiB für die Vorschau. PDFs: höchstens 50 Seiten und 20 Sekunden je Ladevorgang/Seite. Bilder: höchstens 16 Megapixel. Textvorschau: höchstens 2 MiB.',
      'PDF-Skripte, Formulare, externe Verweise und eingebettete Dateien werden nicht ausgeführt oder geöffnet. Es gibt keine automatische Browser- oder Systemvorschau.',
      'HTML, SVG, Office-Dateien und ausführbare Dateien werden ausschließlich als Download angeboten.',
      'Importierte Dateien können höchstens 32 MiB groß sein. Zusammen höchstens 64 MiB und 39 Anlagen. Drag-and-drop und Dateiauswahl sind gleichwertige Importwege.',
    ],
  },
  {
    id: 'replies',
    title: 'Antworten testen',
    section: 'Empfangen',
    image: 'replies',
    caption: 'Ein geprüfter Antrag bildet die Grundlage für eine separate Antwort.',
    intro:
      'Eine Antwort benötigt ein beim ursprünglichen Versand angebotenes Antwortschema und den passenden nativen Schlüsselkontext.',
    steps: [
      'Senden Sie als Onlinedienst eine Einreichung mit aktiviertem Antwortangebot. Verwenden Sie für einen Test über Neustarts ein gespeichertes Profil und sichern Sie dessen Schlüsselzustand.',
      'Öffnen und prüfen Sie den Antrag im Fachverfahren. Laden Sie im Antwortbereich das angebotene Antwortschema.',
      'Erstellen Sie passende JSON- oder XML-Antwortdaten und ergänzen Sie bei Bedarf Anlagen. Bereiten Sie die Antwort vor, prüfen Sie die Zusammenfassung und bestätigen Sie den Versand separat.',
      'Verbinden Sie wieder den ursprünglichen Onlinedienst-Zugang. Laden Sie die Antworten und prüfen Sie die gewünschte Antwort mit dem zu diesem Angebot gehörenden Schlüssel.',
      'Nehmen Sie die Antwort nach Prüfung an oder lehnen Sie sie mit passendem Grund ab. Auch Antworten bleiben als lokale Kopien in der Vorgangsablage erhalten.',
    ],
    examples: [
      {
        title: 'JSON-Antwort',
        language: 'json',
        note: 'Für das unten gezeigte Testschema. Eine Antwort bestätigt noch nicht die Annahme der ursprünglichen Einreichung.',
        content: JSON.stringify({ status: 'erhalten' }, null, 2),
      },
      {
        title: 'JSON-Antwortschema',
        language: 'json',
        note: 'Speichern Sie dieses Schema als JSON-Datei. Bieten Sie beim ursprünglichen Versand urn:de:test mit application/json an. Eine URN ist eine Kennung und keine Downloadadresse. Laden Sie das Schema bei Bedarf lokal, bevor Sie die Antwortdaten prüfen.',
        content: JSON.stringify(
          {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            $id: 'urn:de:test',
            title: 'Testantwort',
            type: 'object',
            properties: { status: { type: 'string', enum: ['erhalten', 'in_bearbeitung', 'abgeschlossen'] } },
            required: ['status'],
            additionalProperties: false,
          },
          null,
          2,
        ),
      },
    ],
    notes: [
      'Beliebige andere Schlüssel oder eine andere Sitzung ohne wiederhergestellten Antwortschlüssel können eine angebotene Antwort nicht entschlüsseln.',
      'Ein archivierter Antrag allein berechtigt nicht zum Antworten. Der aktuelle native Nachweis und die angebotenen Antwortmöglichkeiten müssen erneut ermittelt werden.',
      'Ungewisse Antwortversuche werden nicht automatisch wiederholt. Prüfen Sie zuerst den Event Log.',
    ],
  },
  {
    id: 'processes',
    title: 'BPMN und Prozessnachrichten',
    section: 'Prozesse',
    image: 'processes',
    caption: 'BPMN-Modell mit auswählbaren Nachrichtenbezügen und Suche nach unterstützenden Destinations.',
    intro:
      'BPMN-Dateien helfen Ihnen, Prozessmodell- und Nachrichten-IDs auszuwählen, ohne sie von Hand zu übertragen. Das Werkzeug führt keine Prozess-Engine aus.',
    steps: [
      'Öffnen Sie „Prozesse“ und laden Sie eine BPMN-Datei per Drag-and-drop oder Dateiauswahl. Das mitgelieferte Beispiel ist ausschließlich für fiktive Tests gedacht.',
      'Wählen Sie einen unterstützten Nachrichtenbezug direkt im Diagramm oder über die zugängliche Auswahlliste. Prüfen Sie die ermittelte Prozessmodell-ID und Nachrichten-ID.',
      'Suchen Sie nach TEST-Destinations, die diesen Nachrichtenbezug unterstützen. Wählen Sie optional eine Region. Die Suche verwendet den aktuellen nativen Bearer-Zugang.',
      'Übernehmen Sie eine passende Destination und den Nachrichtenbezug in den Versand. Prüfen Sie die Zuordnung erneut in der Versandzusammenfassung.',
      'Bei eingegangenen Prozessnachrichten können Sie den Nachrichtenbezug im geladenen BPMN-Modell anzeigen lassen. Antwortnachrichten müssen zum angebotenen Prozessbezug passen.',
    ],
    examples: [
      {
        title: 'BPMN-Nachrichtenbezug',
        language: 'xml',
        note: 'Ausschnitt zur Zuordnung in einem eigenen BPMN-Modell. Die fachlichen Kennungen müssen mit der empfangenden Destination vereinbart sein. Die BPMN-Element-ID BpmnMessage_1 ist keine FIT-Connect-Nachrichten-ID. Ein vollständiges fiktives Modell öffnen Sie über „Fiktiven Demo-Prozess öffnen“.',
        content: `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:fc="urn:fit-connect:test-client:bpmn:1"
  targetNamespace="urn:mein-test" fc:processModelId="vereinbarte-modellkennung">
  <bpmn:message id="BpmnMessage_1" name="Nachforderung"
    fc:messageId="vereinbarte-nachrichtenkennung"
    fc:schemaUri="urn:de:test" fc:mimeType="application/json" />
</bpmn:definitions>`,
      },
    ],
    notes: [
      'Die Prozessfunktionen und Suche nach unterstützten Prozessnachrichten benötigen API v3.',
      'Nicht jedes beliebige BPMN-Element besitzt eine Nachrichten-ID. Bei fehlenden oder mehrdeutigen Zuordnungen wird kein Wert geraten.',
      'Ein Modell kann mehrere Referenzen enthalten. Vergleichen Sie vor dem Senden stets Modell, Nachricht und Ziel-Destination.',
    ],
  },
  {
    id: 'destinations',
    title: 'Eigene Destinations verwalten',
    section: 'Destinations',
    image: 'destinations',
    caption: 'Verwaltung eigener TEST-Destinations mit getrennten Vorbereitungs- und Bestätigungsschritten.',
    intro:
      'Mit API v3 können Sie eigene TEST-Destinations anlegen und deren Konfiguration verwalten. Änderungen benötigen die passenden Rechte Ihres Fachverfahren-Zugangs.',
    steps: [
      'Verbinden Sie ein gespeichertes Fachverfahren-Profil mit API v3 und öffnen Sie „Destinations“.',
      'Laden Sie eine eigene Destination oder bereiten Sie die Anlage einer neuen Test-Destination vor.',
      'Für verschlüsselte Nachrichten erzeugen Sie lokale Testschlüssel beziehungsweise wählen Sie ein erzeugtes Schlüsselpaket. Die Schlüssel müssen vor einer Registrierung sicher im Profil gespeichert sein.',
      'Prüfen Sie Typ, Bezeichnung, Leistungen und Schemainformationen. Bereiten Sie die Änderung vor und lesen Sie die Zusammenfassung, bevor Sie sie bestätigen.',
      'Übernehmen Sie die eigenen Schlüssel anschließend für den Empfang und senden Sie einen kleinen fiktiven Testantrag an die neue Destination.',
      'Bei einem Schlüsselwechsel nutzen Sie den vorgesehenen Rotationsablauf. Entfernen Sie alte Schlüssel erst, wenn keine entsprechenden Nachrichten mehr entschlüsselt werden müssen.',
    ],
    notes: [
      'Eine Destination kann existieren, obwohl der Bestätigungsschritt unterbrochen wurde. Bei ungewissem Ausgang zuerst abgleichen, statt eine weitere Destination anzulegen.',
      'Vorbereitungen und Bestätigungen gelten nur kurz und für genau die gezeigte Konfiguration.',
      'Aufräumaktionen verändern TEST-Ressourcen. Prüfen Sie Auswahl und Folgen. Das Leeren der lokalen Vorgangsablage ist davon unabhängig.',
    ],
  },
  {
    id: 'events',
    title: 'Event Log und Nachverfolgung',
    section: 'Event Log',
    image: 'events',
    caption: 'Suche anhand von Case ID, Submission ID oder Reply ID.',
    intro:
      'Der Event Log hilft, den Transport einer Testnachricht nachzuvollziehen und ungewisse Ergebnisse abzugleichen.',
    steps: [
      'Öffnen Sie den Event Log direkt aus einem Versandversuch, einem Empfangsdetail oder einem lokalen Vorgang. Bekannte Kennungen werden übernommen.',
      'Wählen Sie die gewünschte Suche: Vorgang über Case ID, Einreichung über Submission ID oder Antwort über Reply ID.',
      'Verbinden Sie den passenden TEST-Zugang. Tragen Sie fehlende Kennungen vollständig ein und starten Sie die Prüfung.',
      'Lesen Sie Ereignisse und Prüfhinweise. Bei längeren Verläufen laden Sie die weiteren Seiten.',
      'Vergleichen Sie nach einem ungewissen Schreibversuch zunächst die vorhandenen Ereignisse und den Serverzustand. Ein neuer Versand ist eine eigene bewusste Aktion.',
    ],
    notes: [
      'Der Event Log ist kein fachlicher Posteingang und enthält nicht automatisch die Antragsdaten.',
      'Rechte und verfügbare Ereignisse können je Zugang unterschiedlich sein. Nicht gefunden bedeutet nicht automatisch „nie gesendet“.',
    ],
  },
  {
    id: 'diagnostics',
    title: 'Technische Aufrufe verstehen',
    section: 'Diagnose',
    image: 'diagnostics',
    caption: 'Technische Aufrufe mit getrenntem Kontext, verständlichem Ergebnis und optionalem Fehlercode.',
    intro:
      'Die Diagnose zeigt die letzten 100 technischen Aufrufe dieser Programmsitzung. Sie hilft, Fehler einzugrenzen, ohne Antragsdaten oder Schlüssel offenzulegen.',
    steps: [
      'Öffnen Sie „Diagnose“ und lesen Sie unter „Technische Aufrufe“ die gewünschte Aktion.',
      '„Lokal“ kennzeichnet lokale Vorgänge wie die Prüfung des Speicherstatus. „API v2“ und „API v3“ zeigen den verwendeten API-Kontext an.',
      'Das Ergebnis beschreibt den technischen Aufruf. „Erfolgreich“ bestätigt weder die fachliche Annahme eines Antrags noch einen abgeschlossenen Prozess. „Keine Aktion offen“ bedeutet, dass keine vorbereitete Aktion aussteht.',
      'Bei einem Fehler öffnen Sie „Fehlercode anzeigen“. Notieren Sie Aktion, API, Version und Fehlercode für eine Fehlermeldung.',
      'Bei Bedarf sehen Sie den Diagnosebericht vor dem Speichern durch. „Verlauf leeren“ entfernt nur die lokale Liste der technischen Aufrufe.',
    ],
    notes: [
      'Die Liste ist kein Event Log. Für den Transportstatus einer Einreichung oder Antwort verwenden Sie die Suche über Case ID, Submission ID oder Reply ID.',
      'Fachdaten, Secrets, Schlüssel, Dateinamen und Nachrichtenkennungen gehören nicht in einen öffentlichen Diagnosebericht.',
    ],
  },
  {
    id: 'problems',
    title: 'Probleme verstehen und beheben',
    section: 'Diagnose',
    image: 'problems',
    caption: 'Der Empfang zeigt fehlende Schlüssel und Prüfhinweise direkt am Antrag.',
    intro:
      'Fehlermeldungen erklären den nächsten sinnvollen Schritt. Wiederholen Sie einen Schreibvorgang nicht unüberlegt.',
    steps: [
      '„Key missing“: Laden Sie an der ausgewählten Destination einen passenden privaten Entschlüsselungsschlüssel. Ein öffentlicher JWK allein reicht nicht.',
      'Schlüssel abgewiesen: Vergleichen Sie Destination, Verwendungszweck und aktuelle Schlüsselregistrierung. Alte Nachrichten können einen früheren privaten Schlüssel benötigen.',
      'Schema nicht verfügbar: Prüfen Sie die Schema-URI in den Metadaten. Erlauben Sie bei Bedarf öffentliche Quellen oder laden Sie ein lokales Schema mit passender absoluter $id.',
      'Zugriff verweigert: Prüfen Sie Client-Rolle, API-Version und Zugehörigkeit der Destination. Eine fremde Destination wird durch ihre ID nicht zu Ihrer eigenen.',
      'Lokaler Speicher voll oder nicht verfügbar: Geben Sie Speicherplatz frei beziehungsweise löschen Sie nicht benötigte Vorgangskopien. Bei aktivierter Aufbewahrung wird ohne erfolgreiche Sicherung keine neue Empfangsbestätigung gesendet.',
      'Bei einem unerwarteten Fehler öffnen Sie „Diagnose“, prüfen Sie den lokalen Anwendungskern und sehen Sie den Diagnosebericht vor dem Speichern an.',
    ],
    notes: [
      'Diagnoseberichte enthalten nur freigegebene technische Angaben. Fachdaten, Secrets, Schlüssel, Dateinamen und Nachrichtenkennungen werden nicht aufgenommen.',
      'Teilen Sie keine Secrets oder privaten Schlüssel in öffentlichen GitHub-Issues oder Screenshots. Für Fehlermeldungen reichen zunächst Version, API, Aktion und freigegebener Fehlercode.',
      'Ausführliche Informationen zu FIT-Connect, Schnittstellen und Schemakonventionen finden Sie in der offiziellen Dokumentation des Dienstes.',
    ],
  },
  {
    id: 'accessibility',
    title: 'Tastatur und Lesbarkeit',
    section: null,
    image: 'cases',
    caption: 'Suchfelder, klar beschriftete Aktionen und strukturierte Inhalte unterstützen die Bedienung.',
    intro:
      'Die Oberfläche lässt sich mit Tastatur, vergrößerter Darstellung sowie den üblichen WebView-Hilfsmitteln bedienen. Nicht alle Dokumentinhalte sind automatisch barrierefrei.',
    steps: [
      'Wechseln Sie mit Tab und Umschalt+Tab zwischen Bedienelementen. Betätigen Sie Schaltflächen mit Eingabe oder Leertaste.',
      'Nutzen Sie die Bereichsauswahl links. Der aktuelle Bereich ist gekennzeichnet. Nach dem Wechsel steht die Überschrift im Fokus.',
      'Schließen Sie Dialoge mit Escape oder „Schließen“. Vor einer Löschbestätigung ist „Abbrechen“ voreingestellt.',
      'Wählen Sie für Dateien die beschriftete Dateiauswahl, wenn Sie kein Drag-and-drop verwenden möchten. Im BPMN-Bereich steht eine textliche Auswahl neben dem Diagramm bereit.',
      'Nutzen Sie die Betriebssystem-Skalierung für größere Darstellung und den Hell-/Dunkel-Schalter für Ihr bevorzugtes Erscheinungsbild.',
      'Bei PDFs öffnen Sie den auslesbaren Seitentext. Bei gescannten Anlagen oder unzugänglichen Originaldokumenten benötigen Sie gegebenenfalls ein externes geeignetes Hilfsmittel.',
    ],
    notes: [
      'Schema-Labels werden aus verfügbaren Schemaquellen übernommen. Ohne solche Informationen zeigt die Anwendung die tatsächlichen technischen Feldnamen.',
      'Diese Hilfe und alle Bilder werden mit der Anwendung ausgeliefert und funktionieren ohne Internetverbindung. Die Verbindung mit der TEST-API selbst benötigt Internet.',
    ],
  },
];
