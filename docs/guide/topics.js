/** Shared guide for website and wiki. Screenshots contain only fictional examples. */
export const helpTopics = [
  {
    id: 'start',
    title: 'Schnellstart',
    section: 'Start',
    image: 'overview',
    caption: 'Die Startansicht führt zur passenden Testaufgabe.',
    intro:
      'FBForge Connect ist ein unabhängiges Testwerkzeug für FIT-Connect. Alle Verbindungen führen ausschließlich in die TEST-Umgebung. Verwenden Sie fiktive Personen- und Antragsdaten.',
    steps: [
      'Wählen Sie oben API v3 für neue Tests. API v2 bleibt für bestehende Integrationen verfügbar.',
      'Wählen Sie auf „Start“ Ihre Testaufgabe: „Fachverfahren testen“ sendet einen Testantrag. „Onlinedienst testen“ führt zum Empfang. Falls nötig, öffnet sich zuerst die Anmeldung. Geben Sie dort Ihre TEST-Client-ID und das Client-Secret ein.',
      'Eine Destination ist ein Zustellpunkt bei FIT-Connect. Ein Onlinedienst sendet Einreichungen und empfängt angebotene Antworten. Ein Subscriber ist das empfangende Fachverfahren. Er ruft Einreichungen ab und kann darauf antworten. Die API und der Zugang müssen zu Ihrem Test passen.',
      'Die Bereiche sind auch direkt über die Navigation erreichbar. Unter „Vorgänge“ finden Sie lokale Kopien. „Anleitung“ öffnet den passenden Abschnitt auf der FBForge-Website.',
      'Führen Sie zuerst einen kleinen Test mit fiktiven JSON-Daten durch. Prüfen Sie anschließend Anlagen, Empfangsbestätigung und gegebenenfalls Antworten.',
    ],
    notes: [
      'Das Werkzeug ersetzt kein produktives Fachverfahren und ist keine offizielle Anwendung der FITKO.',
      'Die Vorabversion wird weiterhin entwickelt. Ein erfolgreiches technisches Ergebnis ersetzt keine fachliche Bewertung des Antrags.',
    ],
  },
  {
    id: 'connection',
    title: 'Verbinden und Profile',
    section: 'Senden',
    image: 'profiles',
    caption:
      'Verbindungsdialog für den TEST-Zugang und die optionale Profilspeicherung. Zugangsdaten werden in der Anleitung nicht gezeigt.',
    illustrations: [
      {
        image: 'connection-identity',
        caption:
          'Die aktive Verbindung zeigt API und Client-ID. Das Bild enthält ausschließlich fiktive Kennungen.',
      },
    ],
    intro:
      'Ein Profil bündelt einen TEST-Zugang und seine API-Version. Gespeicherte Profile ersparen die erneute Eingabe nach einem Neustart.',
    steps: [
      'Öffnen Sie „Verbinden“. Für einen einmaligen Test lassen Sie das Speichern ausgeschaltet.',
      'Für wiederkehrende Tests aktivieren Sie das Speichern und vergeben Sie einen verständlichen Namen, zum Beispiel „Musterfachverfahren v3“.',
      'Prüfen Sie vor dem Verbinden, ob Zugang und API-Version zu Ihrem Test passen. Die Berechtigungen Ihres Zugangs bestimmen die verfügbaren Funktionen.',
      'Unter den gespeicherten Profilen können Sie einen Zugang wieder öffnen, umbenennen, aktualisieren oder entfernen.',
      'Unter „Verbunden“ sehen Sie die aktive Client-ID und können sie kopieren. Auch gespeicherte Profile zeigen ihre Client-ID, API-Version und Schlüsselanzahl. Das Client-Secret wird nicht angezeigt.',
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
    illustrations: [
      {
        image: 'send-data',
        caption: 'Direkter Wechsel zwischen Eingabe und lesender Formularansicht im Versand.',
      },
      {
        image: 'xml-message-choice',
        caption:
          'Auswahl einer Fachnachricht vor dem Übernehmen der Beispieldaten. Das Bild verwendet einen fiktiven Teststandard.',
      },
      {
        image: 'send-confirmation',
        caption: 'Die Versandbestätigung zeigt das Antwortangebot und die Anlagenzahl auch bei null Anlagen.',
      },
    ],
    steps: [
      'Verbinden Sie einen Onlinedienst-Zugang und tragen Sie die Ziel-Destination ein. Laden Sie deren Leistungen und wählen Sie die passende Leistung und das Fachdatenformat. Wenn der Empfänger eine Leistungsbezeichnung liefert, wird sie neben der LeiKa-Kennung angezeigt. Weitere Adressierungsoptionen enthalten die Bezeichnung, Region und eine optionale Case ID. „Weiter“ prüft die Pflichtfelder des Abschnitts und führt Sie zur nächsten Eingabe.',
      'Bei API v3 lädt die Anwendung Ihre eigenen Absender-Destinations zur Auswahl. Eine einzelne aktive Destination wird automatisch übernommen. Über „ID eingeben“ können Sie eine Destination auch manuell hinterlegen. Diese muss zu Ihrem Zugang gehören und passend eingerichtet sein.',
      'Geben Sie JSON oder XML ein oder ziehen Sie eine Datei in das Dateifeld. „Formularansicht“ zeigt den Entwurf lesbar an. Über „Bearbeiten“ kehren Sie zur Eingabe zurück. Text und Dateiauswahl bleiben beim Umschalten erhalten.',
      'Wählen Sie „Fiktive Beispieldaten erzeugen“. Im Dialog wählen Sie bei XML die Nachricht für Ihre Leistung. Erst „Beispieldaten übernehmen“ ersetzt den bisherigen Inhalt oder eine ausgewählte Datei im Entwurf. „Abbrechen“ lässt beides unverändert. Für eine XBau-Genehmigungsfreistellung ist das beispielsweise genehmigungsfreistellung.anzeige.0600. Eine Transportnachricht wird nicht automatisch ausgewählt. Die LeiKa allein bestimmt die XML-Nachricht nicht eindeutig.',
      'Die Formularansicht zeigt Werte lesbar an. „Struktur, Quelltext und Feldangaben“ enthält die technischen Ansichten. Schema-Feldnamen und Beschreibungen werden angezeigt, wenn ein passendes Schema verfügbar ist. Ansonsten bleiben Originalnamen sichtbar. Unter „Schema und technische Optionen“ können Sie ein Schema auch gezielt laden.',
      'Fügen Sie bei Bedarf Anlagen hinzu. Prüfen Sie Dateiname, Format und Größe. Entfernen Sie nicht benötigte Anlagen vor dem Vorbereiten.',
      'Wenn Sie eine Antwort testen möchten, aktivieren Sie vor dem Versand das Antwortangebot und wählen Sie das erlaubte Antwortschema.',
      'Wählen Sie „Versand vorbereiten“. Prüfen Sie in der unveränderlichen Zusammenfassung auch Antwortangebot und Anlagenzahl und bestätigen Sie den Versand. „Nicht angeboten“ bedeutet, dass die Einreichung keinen FIT-Connect-Antwortkanal enthält. Über „Abbrechen“ können Sie den Entwurf noch ändern. Kopieren Sie Submission ID und Case ID bei Bedarf mit den Kopierschaltflächen. Nach erfolgreichem Versand können Sie unter „Nächsten Test vorbereiten“ Fachdaten und Anlagen ausdrücklich für einen neuen Entwurf auswählen. Die Case ID wird geleert, Empfängerleistungen und Schema werden erneut geprüft.',
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
      'Ist ein Schema nicht verfügbar oder liefert die Quelle eine Fehlerantwort, erzeugt die Anwendung daraus keine Beispieldaten. Ihre bisherigen Fachdaten bleiben erhalten. Prüfen Sie die angebotene Schema-Version oder verwenden Sie eigene Testdaten. Passen Sie bei erzeugten Entwürfen auch Codelistenwerte und Anlagenverweise an Ihren Test an.',
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
    illustrations: [
      { image: 'receive-inbox', caption: 'Getrennte Eingänge für Einreichungen und Antworten.' },
      {
        image: 'receive-review',
        caption: 'Die geöffnete Nachricht mit Rückweg zum Eingang und Prüfergebnis.',
      },
    ],
    intro:
      'Ein Fachverfahren lädt seinen Eingang, entschlüsselt den ausgewählten Antrag und prüft die technischen Inhalte. Die Empfangsbestätigung bleibt eine eigene bewusste Aktion.',
    steps: [
      'Verbinden Sie den Fachverfahren-Zugang. Öffnen Sie unter „Empfangen“ das Register „Einreichungen“. Wählen Sie eine eigene Destination und laden Sie die passenden privaten Testschlüssel zum Entschlüsseln und Signieren.',
      'Ohne Submission ID laden Sie die verfügbaren Einreichungen. Mit einer Submission ID öffnet die Schaltfläche oder die Eingabetaste direkt die Nachricht und startet die Entschlüsselung und Prüfung.',
      'Nach erfolgreicher Einrichtung wird die Empfangseinrichtung kompakt angezeigt. Über „Einrichtung ändern“ öffnen Sie Destination und Schlüssel erneut. Wenn Schlüssel oder Schemata fehlen, führt die passende Schaltfläche zur Einrichtung oder zu den Schemaeinstellungen. Laden Sie die fehlenden Dateien und starten Sie „Inhalte entschlüsseln und prüfen“ erneut. Es wurde dabei noch nichts angenommen oder abgelehnt.',
      'Lesen Sie die Fachdaten direkt in der Formularansicht. Die Eingangssuche ist währenddessen ausgeblendet. „Zurück zum Eingang“ stellt Ihre bisherige Suche wieder her. „Struktur, Quelltext und Feldangaben“ enthält die technischen Ansichten. Dort blendet „Technische Feldangaben anzeigen“ Originalwerte, Pfade und Schemaherkunft ein. Datumswerte werden bei eindeutiger Typisierung lesbar formatiert, Wahrheitswerte als Ja oder Nein.',
      'Öffnen Sie Anlagen über „Ansehen“ oder laden Sie die unveränderte Datei herunter. Bei breiten Fenstern stehen Anlagen und nächste Schritte neben den Fachdaten, bei schmalen darunter. Über „Antwort verfassen“ öffnen Sie den Antwortentwurf.',
      'Prüfen Sie fachlich, ob der Antrag zum Testfall passt. „Annehmen“ führt bei eindeutigem Signaturschlüssel direkt zur Prüfung und Bestätigung. Bei mehreren Schlüsseln wählen Sie zuerst den passenden aus. „Ablehnen“ verlangt einen ausdrücklich ausgewählten Grund. Erst die abschließende Bestätigung übermittelt die Entscheidung.',
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
    illustrations: [
      {
        image: 'case-list',
        caption: 'Vorgänge nach Case ID mit sichtbaren Hinweisen auf ungewisse Nachrichten.',
      },
      {
        image: 'case-filter-reset',
        caption: 'Ohne Treffer setzt eine Schaltfläche Suche und alle Filter gemeinsam zurück.',
      },
    ],
    caption: 'Ein lokal wieder geöffneter Antrag mit Formularansicht, Anlagen und getrennten Aktionen.',
    intro:
      'Die Übersicht fasst lokale Nachrichten mit derselben Case ID zu einem Vorgang zusammen. Einreichungen und Antworten behalten ihre eigenen Status. Sie sehen historische Kopien, keinen aktuellen Serverbestand.',
    steps: [
      'Öffnen Sie „Vorgänge“ und verbinden Sie das gewünschte Profil. Die Liste enthält die Nachrichten dieses Zugangs und dieser API.',
      'Suchen Sie nach Titel, Case ID, Submission ID, Reply ID oder Destination. Filtern Sie bei Bedarf nach „Empfangen“ oder „Gesendet“. „Nur Vorgänge mit Klärungsbedarf“ beschränkt die Liste auf fehlgeschlagene, ungewisse oder nicht verfügbare Nachrichten. Ohne Treffer zeigt „Suche und Filter zurücksetzen“ wieder alle Vorgänge an. Dabei werden keine Nachrichten gelöscht. Nach dem Öffnen gelangen Sie mit „Zur Vorgangsübersicht“ zur bisherigen Suche zurück.',
      'Öffnen Sie einen Vorgang über seinen Titel. Im Nachrichtenverlauf wechseln Sie zwischen Einreichung und Antworten. „Status dieser Nachricht“ gilt nur für die ausgewählte Nachricht. Die früheste verfügbare Einreichung wird zuerst geöffnet. Eine Suche nach der vollständigen Submission ID oder Reply ID öffnet direkt die passende Nachricht. Auch bei aktiven Filtern bleibt der vollständige lokale Verlauf sichtbar.',
      'Standardmäßig werden Kopien automatisch nur in der laufenden Anwendung gehalten. Ein Profilwechsel entfernt sie nicht. Verbinden Sie denselben Zugang erneut, um sie wieder zu sehen.',
      'Öffnen Sie „Aufbewahrung: aktuelle Sitzung“. Wenn Sie die Kopien nach einem Neustart benötigen, aktivieren Sie „Vorgänge für dieses gespeicherte Profil dauerhaft aufbewahren“. Vorhandene und neue Kopien werden dann mit Ihrem Windows-Benutzerkonto verschlüsselt.',
      'Unter „Einzelne lokale Kopien verwalten“ oder mit „Diese lokale Kopie löschen“ entfernen Sie genau eine Nachricht. „Verlauf leeren“ fragt nach und löscht alle lokalen Kopien des aktuellen Profils und der aktuellen API. Auf dem TEST-Server wird dadurch nichts geändert.',
      'Zum Antworten oder erneuten technischen Prüfen wählen Sie „Im Empfang erneut prüfen / antworten“. Dafür sind eine aktuelle Sitzung und ein erneut abrufbarer Antrag erforderlich.',
    ],
    notes: [
      'Versuche ohne bestätigte Case ID bleiben einzeln sichtbar. Fehlgeschlagene, ungewisse oder nicht verfügbare Nachrichten werden hervorgehoben. Es gibt keinen pauschalen Abschlussstatus für den gesamten Vorgang.',
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
      'Bei PDFs bleibt die Seitensteuerung unten erreichbar. „Vorherige Seite“ und „Nächste Seite“ beginnen jeweils am Anfang der gewählten Seite. Unter „Seitentext lesen“ ist auslesbarer PDF-Text zugänglich. Für gescannte Seiten gibt es keine Texterkennung.',
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
    illustrations: [
      {
        image: 'reply-confirmation',
        caption: 'Unveränderliche Zusammenfassung vor dem bewussten Antwortversand.',
      },
      {
        image: 'reply-missing-channel',
        caption: 'Ein fehlendes Antwortangebot wird ohne irreführenden Anmeldehinweis erklärt.',
      },
      {
        image: 'reply-schema-mismatch',
        caption:
          'Eine falsche Schema-Kennung lässt sich mit der erwarteten Kennung vergleichen. Der Antwortentwurf bleibt erhalten.',
      },
    ],
    intro:
      'Eine Antwort verwendet das beim Versand angebotene Antwortschema. Zum späteren Lesen benötigt der ursprüngliche Sender seinen privaten Antwortschlüssel.',
    steps: [
      'Senden Sie als Onlinedienst eine Einreichung mit aktiviertem Antwortangebot. Verwenden Sie für einen Test über Neustarts ein gespeichertes Profil und sichern Sie dessen Schlüsselzustand.',
      'Öffnen und prüfen Sie den Antrag im Fachverfahren. Wählen Sie „Antwort verfassen“. Die angebotenen Antwortmöglichkeiten werden geladen. Ein einziges Antwortschema wird automatisch übernommen. Bei mehreren Angeboten wählen Sie das passende Schema.',
      'Geben Sie passende JSON- oder XML-Antwortdaten ein oder wählen Sie „Fiktiven Antwortentwurf erzeugen“. Wechseln Sie mit „Formularansicht“ zur lesbaren Vorschau. Dateiauswahl und Anlagen stehen unter dem Inhalt.',
      'Öffentliche Schemaquellen benötigen Ihre ausdrückliche Freigabe. Ein lokales Schema können Sie unter „Antwortschema und technische Optionen“ hinterlegen. „Antwort prüfen und vorbereiten“ lädt das benötigte Schema, prüft den Inhalt und öffnet die Zusammenfassung. Erst „Antwort jetzt senden“ übermittelt die Antwort.',
      'Bei XML-Antworten mit mehreren möglichen Nachrichten wählen Sie zunächst die passende Antwortnachricht und erzeugen danach den Entwurf. Bei einem fehlenden Schema oder einer nicht unterstützten Pflichtstruktur bleibt Ihr bisheriger Antwortinhalt erhalten.',
      'Verbinden Sie wieder den ursprünglichen Onlinedienst-Zugang. Öffnen Sie unter „Empfangen“ das Register „Antworten“. Laden Sie die Antworten und prüfen Sie die gewünschte Antwort mit dem zu diesem Angebot gehörenden Schlüssel.',
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
      'Antworten benötigen einen FIT-Connect-Antwortkanal in den geprüften Metadaten mit Antwortschlüssel und Antwortschema. Eine Zustimmung zum digitalen Bescheid allein genügt nicht. Fehlt der Kanal, muss der Absender eine neue Einreichung mit Antwortangebot senden. Die vorhandene Einreichung können Sie weiterhin annehmen oder ablehnen.',
      'Bei lokalen JSON-Schemadateien muss die Kennung $id zum angebotenen Antwortschema passen. Bei einer Abweichung zeigt die Anwendung die erwartete Kennung zum Kopieren an. Wählen Sie über „Passendes Schema auswählen“ das Schema des Onlinedienstes. Eine geänderte Kennung allein macht ein fremdes Testschema nicht zu einem passenden Antwortschema.',
      'Ein ungesendeter Antwortentwurf wird beim Verlassen der Nachricht, beim Wechsel der API oder beim erneuten Verbinden nicht ungefragt verworfen. „Weiter bearbeiten“ behält Ihre Änderungen. Eine Annahme oder Ablehnung der ursprünglichen Einreichung versendet den Antwortentwurf nicht.',
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
      '„Ansehen“ öffnet die Destination-Details. „Bearbeiten“ führt direkt in die Bearbeitung. Zurück gelangen Sie über „Zur Destination-Übersicht“.',
      'Für gemeinsame Änderungen wählen Sie bis zu zehn Destinations und anschließend „Destinations gemeinsam bearbeiten“. Die Auswahl bleibt beim Ansehen einzelner Details erhalten.',
      'Für verschlüsselte Nachrichten erzeugen Sie lokale Testschlüssel beziehungsweise wählen Sie ein erzeugtes Schlüsselpaket. Die Schlüssel müssen vor einer Registrierung sicher im Profil gespeichert sein.',
      'Prüfen Sie Typ, Bezeichnung, Leistungen und Schemainformationen. Bereiten Sie die Änderung vor und lesen Sie die Zusammenfassung, bevor Sie sie bestätigen.',
      'Übernehmen Sie die eigenen Schlüssel anschließend für den Empfang und senden Sie einen kleinen fiktiven Testantrag an die neue Destination.',
      'Bei einem Schlüsselwechsel nutzen Sie den vorgesehenen Rotationsablauf. Entfernen Sie alte Schlüssel erst, wenn keine entsprechenden Nachrichten mehr entschlüsselt werden müssen.',
    ],
    notes: [
      'Bei erkannten Leserechten werden keine Auswahl- oder Bearbeitungsaktionen angeboten. Änderungen erfordern die Berechtigung manage-destinations. Unbekannte Rechte werden erst beim Aufruf geprüft. Der Server entscheidet über jede Änderung.',
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
    caption: 'Fehlende Schemafreigabe mit direkten Aktionen und aufklappbaren technischen Fehlerangaben.',
    intro:
      'Fehlermeldungen erklären den nächsten sinnvollen Schritt. Wiederholen Sie einen Schreibvorgang nicht unüberlegt.',
    steps: [
      '„Testschlüssel fehlt“: Wählen Sie „Schlüssel einrichten“ und laden Sie einen passenden privaten Entschlüsselungsschlüssel. Ein öffentlicher JWK allein reicht nicht.',
      '„Freigabe für Schemaquellen erforderlich“: „Zur Freigabe“ führt zur Checkbox. Aktivieren Sie diese bewusst und prüfen Sie erneut. Alternativ öffnet „Lokales Schema hinzufügen“ die lokale Dateiauswahl. Die Anwendung erteilt keine Freigabe automatisch.',
      'Unter „Technische Fehlerangaben“ finden Sie API-Version und kopierbaren Fehlercode.',
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
      'Die ausführliche Anleitung und ihre Abbildungen stehen auf der Website. Die Links in der Anwendung öffnen das passende Kapitel im Browser. Kurze Hinweise bleiben direkt bei den Eingaben verfügbar.',
    ],
  },
];
