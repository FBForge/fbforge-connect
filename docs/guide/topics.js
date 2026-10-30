/** Shared guide for website and wiki. Screenshots contain only fictional examples. */
export const helpTopics = [
  {
    id: 'start',
    title: 'Schnellstart',
    section: 'Start',
    image: 'overview',
    caption: 'Die Startansicht führt zur passenden Aufgabe.',
    intro:
      'FBForge Connect ist ein unabhängiges Testwerkzeug für FIT-Connect. Wählen Sie TEST, STAGE oder PROD passend zu Ihren Zugangsdaten. Für Tests verwenden Sie fiktive Daten. In PROD werden Nachrichten tatsächlich zugestellt.',
    steps: [
      'Wählen Sie oben zuerst die Umgebung TEST (Blau), STAGE (Gelb) oder PROD (Grün). Die Farbe kennzeichnet die Umgebung, nicht die Sicherheit einer Aktion. Beim Wechsel werden aktuelle Verbindungen beendet und nicht gespeicherte Sitzungsschlüssel sowie Inhalte verworfen. Melden Sie sich anschließend mit den passenden Zugangsdaten neu an. Wählen Sie API v3 für neue Tests. API v2 bleibt für bestehende Integrationen verfügbar.',
      'Wählen Sie auf „Start“ Ihre Aufgabe: „Einreichung senden“ öffnet den Versand. „Einreichungen abrufen“ führt zum Empfang. Falls nötig, öffnet sich zuerst die Anmeldung. Wählen Sie ein gespeichertes Profil oder geben Sie unter „Anderen Zugang verwenden“ die Client-ID und das Client-Secret für die gewählte Umgebung ein.',
      'Eine Destination ist ein Zustellpunkt bei FIT-Connect. Ein Onlinedienst sendet Einreichungen und empfängt angebotene Antworten. Ein Subscriber ist das empfangende Fachverfahren. Er ruft Einreichungen ab und kann darauf antworten. Die API und der Zugang müssen zu Ihrem Test passen.',
      'Die Bereiche sind auch direkt über die Navigation erreichbar. Unter „Vorgänge“ finden Sie lokale Kopien. „Anleitung“ öffnet den passenden Abschnitt auf der FBForge-Website.',
      'Führen Sie zuerst einen kleinen Test mit fiktiven JSON-Daten durch. Prüfen Sie anschließend Anlagen, Empfangsbestätigung und gegebenenfalls Antworten.',
    ],
    notes: [
      'Die Abbildungen zeigen Version 0.3.0 mit ausschließlich fiktiven Testdaten. Download und Versionshinweise beziehen sich auf das veröffentlichte Release.',
      'Das Werkzeug ersetzt kein produktives Fachverfahren und ist keine offizielle Anwendung der FITKO.',
      'Die Anwendung wird weiterentwickelt. Ein erfolgreiches technisches Ergebnis ersetzt keine fachliche Bewertung des Antrags.',
    ],
  },
  {
    id: 'connection',
    title: 'Verbinden und Profile',
    section: 'Senden',
    image: 'profiles',
    caption:
      'Verbindungsdialog für den gewählten Zugang und die optionale Profilspeicherung. Zugangsdaten werden in der Anleitung nicht gezeigt.',
    illustrations: [
      {
        image: 'environment-test',
        caption: 'TEST wird einheitlich mit der blauen SSP-Umgebungsfarbe gekennzeichnet.',
      },
      {
        image: 'environment-stage',
        caption: 'STAGE verwendet die gelbe SSP-Umgebungsfarbe und benötigt V-PKI-Zertifikate.',
      },
      {
        image: 'appearance',
        caption: 'System, Hell oder Dunkel wählen. System folgt Änderungen während der Sitzung.',
      },
      {
        image: 'environment-prod',
        caption:
          'Auswahl von PROD mit dauerhafter Kennzeichnung des Produktivbetriebs. Es werden keine Zugangsdaten gezeigt.',
      },
      {
        image: 'environment-switch',
        caption: 'Der Umgebungswechsel fragt vor dem Beenden aktueller Verbindungen nach.',
      },
      {
        image: 'saved-profiles',
        caption: 'Kompakte Auswahl gespeicherter Profile. Weitere Aktionen bleiben eingeklappt.',
      },
      {
        image: 'connection-identity',
        caption:
          'Die aktive Verbindung zeigt API und Client-ID. Das Bild enthält ausschließlich fiktive Kennungen.',
      },
    ],
    intro:
      'Ein Profil bündelt einen Zugang, seine Umgebung und die API-Version. Profile anderer Umgebungen werden nicht zum Verbinden angeboten. Bestehende Profile aus Version 0.1 gehören weiterhin zu TEST. Gespeicherte Profile ersparen die erneute Eingabe nach einem Neustart.',
    steps: [
      'Wählen Sie die Umgebung in der Kopfzeile und öffnen Sie „Verbinden“. Gespeicherte Profile werden zuerst angeboten. Wählen Sie ein Profil und die passende API-Version oder öffnen Sie „Anderen Zugang verwenden“. Ohne gespeichertes Profil sind die Eingabefelder direkt geöffnet.',
      'Bei einem neuen Zugang geben Sie Client-ID und Client-Secret ein. Für die dauerhafte Wiederverwendung aktivieren Sie das Speichern und vergeben einen verständlichen Namen, zum Beispiel „Musterfachverfahren v3“. Ohne Speichern gelten Zugang und Schlüssel nur für diese Sitzung.',
      'Prüfen Sie vor dem Verbinden, ob Zugang und API-Version zu Ihrem Test passen. Die Berechtigungen Ihres Zugangs bestimmen die verfügbaren Funktionen.',
      'Gespeicherte Profile stehen im Verbindungsdialog zuerst. Wählen Sie dort das gewünschte Profil aus. Neue Zugangsdaten geben Sie bei vorhandenen Profilen unter „Anderen Zugang verwenden“ ein. Es werden nur dessen Client-ID, API-Version und Schlüsselanzahl angezeigt. „Mit Profil verbinden“ öffnet den Zugang. Umbenennen, Secret ändern, Export und Löschen finden Sie unter „Profil verwalten“.',
      'Unter „API-Version für die Verbindung“ können Sie denselben gespeicherten Zugang für v2 oder v3 verwenden. Das Secret muss nicht erneut eingegeben werden. Ein passendes Profil für die weitere API wird weiterverwendet oder neu angelegt. Schlüssel und Vorgänge bleiben nach API getrennt. Der Zugang muss für die gewählte API freigeschaltet sein.',
      'Auch der API-Schalter oben verwendet die aktuelle Anmeldung für die weitere API. Das funktioniert ohne gespeichertes Profil. Bestehende Verbindungen desselben Zugangs werden weiterverwendet. Bei fehlender Freischaltung bleibt die bisherige Verbindung aktiv. Die Umgebung wird dabei nicht gewechselt.',
      'Unter „Verbunden“ sehen Sie die aktive Client-ID und können sie kopieren. Auch gespeicherte Profile zeigen ihre Client-ID, API-Version und Schlüsselanzahl. Das Client-Secret wird nicht angezeigt.',
      'Speichern Sie Schlüsseländerungen im Profil und beachten Sie Hinweise auf ausstehende Sicherungen. Bewahren Sie zusätzlich eine eigene sichere Schlüsselsicherung auf.',
    ],
    notes: [
      'Dauerhafte Profile und private Schlüssel werden auf Windows mit dem Benutzerkonto verschlüsselt. Es gibt keinen unverschlüsselten Ersatzspeicher.',
      'Beim Entfernen eines gespeicherten Profils werden auch dessen dauerhaft gespeicherte Vorgangskopien gelöscht.',
      'Profil-Sicherungen sind verschlüsselt und an das Windows-Benutzerkonto gebunden. Sie sind kein allgemeiner Export für andere Rechner oder Benutzer.',
      'Ein Profil-Backup enthält keine Vorgangsablage. Die Aufbewahrung von Vorgängen wird separat eingeschaltet.',
      'STAGE und PROD benötigen gültige Zertifikate der Verwaltungs-PKI. Selbstsignierte Testzertifikate werden dort nicht freigegeben. Jede PROD-Schreibaktion fragt zusätzlich in einem nativen Windows-Dialog nach. Abbrechen überträgt nichts.',
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
        image: 'leika-labels',
        caption: 'Leistungsnamen aus dem FIM-Portal ergänzen die unveränderten LeiKa-Kennungen.',
      },
      {
        image: 'send-test-cases',
        caption: 'Benannte Testfälle für einen neuen Entwurf speichern und direkt aus der Sammlung wählen.',
      },
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
      {
        image: 'schema-access',
        caption: 'Nachfrage vor dem ersten Abruf einer öffentlichen Schemaquelle für die aktive Verbindung.',
      },
      {
        image: 'send-validation',
        caption: 'Aktuelle Fachdatenprüfung gegen das angebotene Schema vor dem Versand.',
      },
    ],
    steps: [
      'Verbinden Sie einen Onlinedienst-Zugang und tragen Sie die Ziel-Destination ein. Laden Sie deren Leistungen und wählen Sie die passende Leistung und das Fachdatenformat. „Leistungsnamen aus FIM laden“ ergänzt fehlende Bezeichnungen aus dem öffentlichen FIM-Portal. Übertragen werden nur LeiKa-Kennungen. Nur exakte, eindeutige Treffer werden übernommen. Ohne Treffer bleibt die Kennung sichtbar. Weitere Adressierungsoptionen enthalten die Bezeichnung, Region und eine optionale Case ID. „Weiter“ prüft die Pflichtfelder des Abschnitts und führt Sie zur nächsten Eingabe.',
      'Bei API v3 lädt die Anwendung Ihre eigenen Absender-Destinations zur Auswahl. Eine einzelne aktive Destination wird automatisch übernommen. Über „ID eingeben“ können Sie eine Destination auch manuell hinterlegen. Diese muss zu Ihrem Zugang gehören und passend eingerichtet sein.',
      'Geben Sie JSON oder XML ein oder ziehen Sie eine Datei in das Dateifeld. „Formularansicht“ zeigt den Entwurf lesbar an. Über „Bearbeiten“ kehren Sie zur Eingabe zurück. Text und Dateiauswahl bleiben beim Umschalten erhalten.',
      'Wählen Sie im Abschnitt „Fachdaten“ zuerst das sichtbare Fachdaten-Schema. Es steht oberhalb von „Fiktive Beispieldaten erzeugen“. Wählen Sie anschließend „Fiktive Beispieldaten erzeugen“. Im Dialog wählen Sie bei XML die Nachricht für Ihre Leistung. Erst „Beispieldaten übernehmen“ ersetzt den bisherigen Inhalt oder eine ausgewählte Datei im Entwurf. „Abbrechen“ lässt beides unverändert. Für eine XBau-Genehmigungsfreistellung ist das beispielsweise genehmigungsfreistellung.anzeige.0600. Eine Transportnachricht wird nicht automatisch ausgewählt. Die LeiKa allein bestimmt die XML-Nachricht nicht eindeutig.',
      'Die Formularansicht zeigt Werte lesbar an. „Struktur, Quelltext und Feldangaben“ enthält die technischen Ansichten. Schema-Feldnamen und Beschreibungen werden angezeigt, wenn ein passendes Schema verfügbar ist. Ansonsten bleiben Originalnamen sichtbar. „Schema-Beschriftungen laden“ steht direkt unter der Schemaauswahl.',
      'Prüfen Sie die Fachdaten mit „Fachdaten gegen Schema prüfen“. JSON wird gegen das angebotene JSON-Schema geprüft, XML gegen die aufgelösten XSDs. Beim Vorbereiten läuft diese Prüfung automatisch, sofern kein aktuelles Ergebnis vorhanden ist. Änderungen an Inhalt, Empfänger oder Schema machen das Ergebnis ungültig. Wird eine öffentliche Schemaquelle benötigt, erscheint vor dem Abruf eine Nachfrage. Mit „Für diese Verbindung erlauben“ wird die Prüfung fortgesetzt. „Abbrechen“ lässt Ihre Fachdaten unverändert. Alternativ fügen Sie unter „Lokale Schemata und technische Optionen“ lokale Prüfschemata mit passender Kennung hinzu.',
      'Fügen Sie bei Bedarf Anlagen hinzu. Prüfen Sie Dateiname, Format und Größe. Entfernen Sie nicht benötigte Anlagen vor dem Vorbereiten. Unter „Entwurf als Testfall wiederverwenden“ vergeben Sie einen Namen und speichern den Entwurf mit Anlagen und lokalen Prüfschemata geschützt in der Sammlung oder exportieren ihn als Datei.',
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
      'Die Nachfrage für öffentliche Schemaquellen erscheint beim Laden oder Prüfen. Ihre Freigabe gilt für die aktive Verbindung und lässt sich mit „Freigabe beenden“ widerrufen. Nach einem Verbindungswechsel oder Neustart ist erneut eine Freigabe nötig. Lokale Schemata und mitgelieferte Demos benötigen keine Freigabe.',
      'Ist ein Schema nicht verfügbar oder liefert die Quelle eine Fehlerantwort, erzeugt die Anwendung daraus keine Beispieldaten. Ihre bisherigen Fachdaten bleiben erhalten. Prüfen Sie die angebotene Schema-Version oder verwenden Sie eigene Testdaten. Passen Sie bei erzeugten Entwürfen auch Codelistenwerte und Anlagenverweise an Ihren Test an.',
      'Bei „Ausgang ungewiss“ nicht einfach erneut senden. Nutzen Sie die bekannten IDs zur Event-Log-Prüfung, um doppelte Testnachrichten zu vermeiden. Ab 0.3.0 können Sie anschließend „Neuen Entwurf vorbereiten“ wählen und das Doppelversandrisiko ausdrücklich bestätigen. Der bisherige Versuch bleibt ungewiss und unter „Vorgänge“ erhalten. Die Case ID wird geleert; Empfängerleistungen und Schema werden erneut geladen. Erst eine neue Versandbestätigung übermittelt einen neuen Antrag. Eine eindeutige HTTP-401/403-Ablehnung beim erstmaligen Ankündigen einer Einreichung gilt als fehlgeschlagen.',
      'Die Vorgangsablage übernimmt den tatsächlich vorbereiteten Versandinhalt. Spätere Änderungen im Eingabefeld verändern diese Kopie nicht.',
      'Für einen bewussten Negativtest können Sie die Fachdaten-Schemaprüfung unter den technischen Optionen ausschalten. Die Versandbestätigung nennt das ausdrücklich. Format und Empfängerangebot werden weiterhin vom SDK geprüft. Eine erfolgreiche Schemaprüfung bestätigt keine fachliche Richtigkeit.',
    ],
  },
  {
    id: 'receive',
    title: 'Antrag empfangen und prüfen',
    section: 'Empfangen',
    image: 'receive',
    caption: 'Die Formularansicht eines fiktiven Antrags nach Entschlüsselung und technischer Prüfung.',
    illustrations: [
      {
        image: 'private-key-import',
        caption:
          'Ein gemeinsamer Import für private Schlüssel. Das Beispiel zeigt ausschließlich fiktive PKCS#12-Daten.',
      },
      { image: 'receive-inbox', caption: 'Getrennte Eingänge für Einreichungen und Antworten.' },
      {
        image: 'receive-review',
        caption: 'Die geöffnete Nachricht mit Rückweg zum Eingang und Prüfergebnis.',
      },
      {
        image: 'message-download',
        caption: 'Alle verfügbaren Originaldateien einer fiktiven Einreichung gemeinsam speichern.',
      },
      {
        image: 'receipt-download',
        caption:
          'Vor der Einzelannahme entscheiden, ob alle Dateien zusätzlich in einem eigenen Ordner gespeichert werden.',
      },
      {
        image: 'receive-batch',
        caption:
          'Fiktiver Sammeldurchlauf mit erfolgreichen Annahmen und einem Schemafehler zur manuellen Prüfung.',
      },
    ],
    intro:
      'Ein Fachverfahren lädt seinen Eingang, entschlüsselt den ausgewählten Antrag und prüft die technischen Inhalte. Die Empfangsbestätigung bleibt eine eigene bewusste Aktion.',
    steps: [
      'Verbinden Sie den Fachverfahren-Zugang. Öffnen Sie unter „Empfangen“ das Register „Einreichungen“. Wählen Sie eine eigene Destination und laden Sie die passenden privaten Schlüssel zum Entschlüsseln und Signieren.',
      'Ohne Submission ID laden Sie die verfügbaren Einreichungen. Mit einer Submission ID öffnet die Schaltfläche oder die Eingabetaste direkt die Nachricht und startet die Entschlüsselung und Prüfung.',
      'Nach erfolgreicher Einrichtung wird die Empfangseinrichtung kompakt angezeigt. Über „Einrichtung ändern“ öffnen Sie Destination und Schlüssel erneut. Wenn Schlüssel oder Schemata fehlen, führt die passende Schaltfläche zur Einrichtung oder zu den Schemaeinstellungen. Laden Sie die fehlenden Dateien und starten Sie „Inhalte entschlüsseln und prüfen“ erneut. Es wurde dabei noch nichts angenommen oder abgelehnt.',
      'Lesen Sie die Fachdaten direkt in der Formularansicht. Ab 0.3.0 zeigt eine Schemaabweichung die Fehlerübersicht und das verwendete Schema. Betroffene JSON-Felder sind markiert. Bei XML werden Zeile und Spalte genannt. Sie können die Nachricht begründet ablehnen oder nach zusätzlicher nativer Bestätigung trotz Schemaabweichung annehmen. Eindeutige Schema-Bezeichnungen ersetzen technische Auswahlwerte, Datumswerte und Wahrheitswerte werden lesbar angezeigt. „Struktur, Quelltext und Feldangaben“ enthält Originalwerte, Pfade, Schemaherkunft und Quelltext. Die Eingangssuche ist während des Lesens ausgeblendet. „Zurück zum Eingang“ stellt Ihre bisherige Suche wieder her.',
      'Öffnen Sie Anlagen über „Ansehen“ oder laden Sie das Original herunter. Bereits im Standardfenster bleibt die rechte Spalte mit Anlagen und Aktionen beim Lesen sichtbar. Lange Anlagenlisten scrollen innerhalb der Spalte. Bei schmalen Fenstern führt „Zu Anlagen und Aktionen“ direkt zu den Empfangsaktionen vor der Anlagenliste. Über „Antwort verfassen“ öffnen Sie den Antwortentwurf.',
      'Unter „Private Schlüssel importieren“ wählen Sie JWK, JWKS, unverschlüsseltes PKCS#8-PEM oder PKCS#12. Textdateien werden direkt geprüft. Bei .p12/.pfx geben Sie das Dateipasswort ein und starten „Schlüssel prüfen und importieren“. Kann ein PKCS#12-Zertifikat zum Signieren und Entschlüsseln verwendet werden, wählen Sie die gewünschte Verwendung. Das Dateipasswort wird nicht gespeichert. Die freigegebene Registrierung bestimmt Kennung und Zertifikatskette des geladenen Schlüssels. STAGE und PROD prüfen weiterhin V-PKI-Vertrauen und Sperrstatus mit dem SDK.',
      'Mit „Alle Dateien herunterladen“ speichern Sie Metadaten, Fachdaten und Anlagen gemeinsam. Wählen Sie im nativen Dialog einen Zielordner. Die Dateien werden entschlüsselt außerhalb der geschützten Vorgangsablage gespeichert. Jede Nachricht erhält einen eigenen Ordner mit einer Exportübersicht. Bestehende Exporte werden nicht überschrieben.',
      'Beim Annehmen einer einzelnen Einreichung fragt der Bestätigungsdialog „Dateien vor der Annahme speichern?“. Wählen Sie „Ja, alle Dateien vorher speichern“, um vor der Annahme einen Zielordner zu wählen. Erst nach erfolgreicher Speicherung wird die Annahme übermittelt. Bei Abbruch der Ordnerwahl oder einem Speicherfehler bleibt die Einreichung offen. „Nein, ohne Download annehmen“ bestätigt ohne zusätzlichen Export. Die geschützte Aufbewahrung unter „Vorgänge“ bleibt davon unabhängig.',
      'Markieren Sie im Eingang einzelne Nachrichten oder wählen Sie alle aus. „Alle auf dieser Seite auswählen“ betrifft die angezeigte Seite. Bis zu 100 Nachrichten lassen sich über mehrere Seiten gemeinsam auswählen. „Auswahl herunterladen“ prüft und speichert die Auswahl. „Prüfen, speichern und annehmen“ bestätigt anschließend nur erfolgreich geprüfte und vollständig gespeicherte Einreichungen.',
      'Ohne Malwarescanner bleiben Annahmen standardmäßig zur manuellen Prüfung stehen. „Annahmen ohne Malwarescan erlauben“ gibt ausschließlich diesen fehlenden Prüfschritt ausdrücklich frei. Schemafehler und andere offene Prüfungen bleiben weiterhin manuell. Bei mehreren Signaturschlüsseln wählen Sie den gewünschten Schlüssel. In PROD wird jede Annahme zusätzlich nativ bestätigt.',
      'Auch „Auswahl herunterladen“ benötigt erfolgreiche Entschlüsselung und technische Prüfung. Nicht entschlüsselbare Nachrichten werden nicht exportiert. Ab 0.3.0 bleiben bei nachgewiesenen Schemaabweichungen die kryptografisch geprüften Daten lesbar und exportierbar. Die Nachricht bleibt im Sammeldurchlauf zur manuellen Entscheidung stehen. Ein Prüfungsfehler bewirkt keine automatische Ablehnung. Öffnen Sie die betroffene Nachricht einzeln und wählen Sie bei Bedarf „Ablehnen“ mit einem passenden Grund. Fachlich falsche, technisch gültige Angaben erkennt die technische Prüfung nicht. Prüfen Sie solche Einreichungen vor einem Sammeldurchlauf fachlich.',
      'Die Ergebnisliste zeigt gespeicherte, angenommene und manuell zu prüfende Nachrichten getrennt. „Einzeln öffnen und prüfen“ führt zur betroffenen Einreichung. „Durchlauf stoppen“ verhindert weitere Annahmen. Bei einem ungewissen Annahmestatus stoppt die Verarbeitung. Prüfen Sie den Event Log, bevor Sie erneut beginnen.',
      'Prüfen Sie fachlich, ob der Antrag zum Testfall passt. „Annehmen“ führt bei eindeutigem Signaturschlüssel direkt zur Prüfung und Bestätigung. Bei mehreren Schlüsseln wählen Sie zuerst den passenden aus. „Ablehnen“ verlangt einen ausdrücklich ausgewählten Grund. Erst die abschließende Bestätigung übermittelt die Entscheidung.',
      'Eine lokale Kopie bleibt unter „Vorgänge“ lesbar. Wenn die dauerhafte Aufbewahrung eingeschaltet ist, wird vor der Bestätigung die Sicherung geprüft.',
    ],
    notes: [
      'Eine technische Prüfung bedeutet keine fachliche Freigabe. Hinweise wie „Kein Malwarescanner eingerichtet“ bleiben sichtbar.',
      'Die Bestätigung einer vorbereiteten Empfangsaktion ist höchstens 60 Sekunden gültig. Dauert etwa die Ordnerwahl länger, bereiten Sie die Aktion erneut vor. Bereits gespeicherte Dateien lösen keine Annahme aus.',
      'Für XML muss eine passende XSD samt benötigten Referenzen verfügbar sein. Wohlgeformtes XML allein ist kein Schemanachweis.',
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
      'Lesen Sie die gespeicherten Fachdaten wie im Empfang. Die Anlagenspalte bleibt bei breiten Fenstern beim Scrollen sichtbar. In schmalen Fenstern führt „Zu Anlagen und Aktionen“ direkt zu den Dateien. „Zurück zu den Fachdaten“ führt zur Formularansicht. Downloads stehen vor der Anlagenliste.',
      '„Alle Dateien herunterladen“ exportiert die verfügbaren Originaldateien der ausgewählten lokalen Nachricht. Die Exportübersicht kennzeichnet die Dateien als historische Kopie. Fehlen archivierte Metadaten, werden diese nicht ergänzt. Eine neue Empfangsbestätigung ist über diese Kopie nicht möglich.',
      'Standardmäßig werden Kopien automatisch nur in der laufenden Anwendung gehalten. Ein Profilwechsel entfernt sie nicht. Verbinden Sie denselben Zugang erneut, um sie wieder zu sehen.',
      'Öffnen Sie „Aufbewahrung: aktuelle Sitzung“. Wenn Sie die Kopien nach einem Neustart benötigen, aktivieren Sie „Vorgänge für dieses gespeicherte Profil dauerhaft aufbewahren“. Vorhandene und neue Kopien werden dann mit Ihrem Windows-Benutzerkonto verschlüsselt.',
      'Unter „Einzelne lokale Kopien verwalten“ oder mit „Diese lokale Kopie löschen“ entfernen Sie genau eine Nachricht. „Verlauf leeren“ fragt nach und löscht alle lokalen Kopien des aktuellen Profils und der aktuellen API. Auf dem FIT-Connect-Server wird dadurch nichts geändert.',
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
        image: 'reply-batch',
        caption: 'Mehrere fiktive Antworten gemeinsam herunterladen. Der Download quittiert keinen Empfang.',
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
      'Wenn eine öffentliche Schemaquelle benötigt wird, fragt ein Dialog vor dem Abruf nach. Nach Ihrer Zustimmung wird der Schritt fortgesetzt. Ein lokales Schema können Sie unter „Antwortschema und technische Optionen“ hinterlegen. „Antwort prüfen und vorbereiten“ lädt das benötigte Schema, prüft den Inhalt und öffnet die Zusammenfassung. Erst „Antwort jetzt senden“ übermittelt die Antwort.',
      'Bei XML-Antworten mit mehreren möglichen Nachrichten wählen Sie zunächst die passende Antwortnachricht und erzeugen danach den Entwurf. Bei einem fehlenden Schema oder einer nicht unterstützten Pflichtstruktur bleibt Ihr bisheriger Antwortinhalt erhalten.',
      'Verbinden Sie wieder den ursprünglichen Onlinedienst-Zugang. Öffnen Sie unter „Empfangen“ das Register „Antworten“. Laden Sie die Antworten und prüfen Sie die gewünschte Antwort mit dem zu diesem Angebot gehörenden Schlüssel.',
      'Nehmen Sie die Antwort nach Prüfung an oder lehnen Sie sie mit passendem Grund ab. Auch Antworten bleiben als lokale Kopien in der Vorgangsablage erhalten.',
      'Nach erfolgreicher Prüfung speichert „Alle Dateien herunterladen“ Metadaten, Antwortdaten und Anlagen gemeinsam. In der Antwortübersicht markieren Sie mehrere Antworten und wählen „Auswahl herunterladen“. Die Dateien werden geprüft und entschlüsselt in getrennten Nachrichtenordnern gespeichert. Ein Download bestätigt noch keinen Empfang der Antworten.',
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
      'Die Nachrichtenliste zeigt übernommene FIT-Connect-Kennungen und Schemahinweise. Bei eigenen Modellen zuerst die vereinbarten Kennungen unter „Vereinbarte FIT-Connect-Zuordnung“ übernehmen. Diese Zuordnungen stehen anschließend direkt beim Bearbeiten von Destination-Prozessnachrichten zur Auswahl. Die Vorschau und Bestätigung der Serveränderung bleiben erforderlich.',
      'Suchen Sie nach Destinations, die diesen Nachrichtenbezug unterstützen. Wählen Sie optional eine Region. Die Suche verwendet den aktuellen nativen Bearer-Zugang.',
      'Übernehmen Sie eine passende Destination und den Nachrichtenbezug in den Versand. Prüfen Sie die Zuordnung erneut in der Versandzusammenfassung.',
      'Bei eingegangenen Prozessnachrichten können Sie den Nachrichtenbezug im geladenen BPMN-Modell anzeigen lassen. Antwortnachrichten müssen zum angebotenen Prozessbezug passen.',
      'Im Versand unter „Anlagen & Antwortkanal“ aktivieren Sie Antworten und wählen das angebotene Schema. Bei API v3 fügen Sie mehrere erlaubte Prozessantworten direkt aus dem geladenen Modell oder anhand vereinbarter Kennungen hinzu. Es sind höchstens 16 eindeutige Nachrichten möglich. Schemahinweise müssen passen. Bei einem Wechsel des Antwortschemas wird die Prozessantwortliste geleert und muss neu zusammengestellt werden.',
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
    caption: 'Verwaltung eigener Destinations mit getrennten Vorbereitungs- und Bestätigungsschritten.',
    illustrations: [
      {
        image: 'vpki-import',
        caption:
          'Import zertifizierter Verschlüsselungs- und Signaturschlüssel für STAGE und PROD. Passwörter sind ausgeblendet.',
      },
    ],
    intro:
      'Mit API v3 können Sie eigene Destinations anlegen und deren Konfiguration verwalten. Änderungen benötigen die passenden Rechte Ihres Fachverfahren-Zugangs.',
    steps: [
      'Verbinden Sie ein gespeichertes Fachverfahren-Profil mit API v3 und öffnen Sie „Destinations“.',
      'Laden Sie eine eigene Destination oder bereiten Sie die Anlage einer neuen Test-Destination vor.',
      '„Ansehen“ öffnet die Destination-Details. „Bearbeiten“ führt direkt in die Bearbeitung. Zurück gelangen Sie über „Zur Destination-Übersicht“.',
      'Für gemeinsame Änderungen wählen Sie bis zu zehn Destinations und anschließend „Destinations gemeinsam bearbeiten“. Die Auswahl bleibt beim Ansehen einzelner Details erhalten.',
      'In TEST können Sie für verschlüsselte Nachrichten lokale Testschlüssel erzeugen. In STAGE und PROD importieren Sie unter „V-PKI-Schlüsselpaar importieren“ einen Verschlüsselungs- und einen davon verschiedenen Signaturschlüssel. Verwenden Sie je eine PKCS#12-Datei (.p12 oder .pfx) mit privatem Schlüssel und vollständiger Zertifikatskette oder einen privaten JWK mit vollständigem x5c. Dateipasswörter werden nur beim Import verwendet und nicht gespeichert. Die Schlüssel müssen vor einer Registrierung sicher im Profil gespeichert sein.',
      'Prüfen Sie Typ, Bezeichnung, Leistungen und Schemainformationen. Bereiten Sie die Änderung vor und lesen Sie die Zusammenfassung, bevor Sie sie bestätigen.',
      'Übernehmen Sie die eigenen Schlüssel anschließend für den Empfang und senden Sie einen kleinen fiktiven Testantrag an die neue Destination.',
      'Bei einem Schlüsselwechsel nutzen Sie den vorgesehenen Rotationsablauf. Entfernen Sie alte Schlüssel erst, wenn keine entsprechenden Nachrichten mehr entschlüsselt werden müssen.',
    ],
    notes: [
      'Bei erkannten Leserechten werden keine Auswahl- oder Bearbeitungsaktionen angeboten. Änderungen erfordern die Berechtigung manage-destinations. Unbekannte Rechte werden erst beim Aufruf geprüft. Der Server entscheidet über jede Änderung.',
      'Eine Destination kann existieren, obwohl der Bestätigungsschritt unterbrochen wurde. Bei ungewissem Ausgang zuerst abgleichen, statt eine weitere Destination anzulegen.',
      'Vorbereitungen und Bestätigungen gelten nur kurz und für genau die gezeigte Konfiguration.',
      'Vertrauenskette, Gültigkeit, Schlüsselverwendung und Sperrstatus werden über das SDK geprüft. Fehlen Zwischenzertifikate oder schlägt die Prüfung fehl, wird der Schlüssel nicht freigegeben. Es gibt keinen Schalter zum Umgehen von OCSP- oder Vertrauensprüfungen.',
      'Für einen Schlüsselwechsel in STAGE oder PROD importieren Sie je ausgewählter Destination ein eigenes ungenutztes V-PKI-Schlüsselpaar. Alte Schlüssel bleiben zum Entschlüsseln früherer Einreichungen erforderlich.',
      'Aufräumaktionen verändern Ressourcen in der ausgewählten Umgebung. In PROD sind dies echte produktive Änderungen. Prüfen Sie Auswahl und Folgen. Das Leeren der lokalen Vorgangsablage ist davon unabhängig.',
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
      'Verbinden Sie den zur Umgebung passenden Zugang. Tragen Sie fehlende Kennungen vollständig ein und starten Sie die Prüfung.',
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
    caption:
      'Ein nicht verfügbares Schema mit direkter lokaler Alternative und aufklappbaren technischen Fehlerangaben.',
    intro:
      'Fehlermeldungen erklären den nächsten sinnvollen Schritt. Wiederholen Sie einen Schreibvorgang nicht unüberlegt.',
    steps: [
      '„Schlüssel fehlt“: Wählen Sie „Schlüssel einrichten“ und laden Sie einen passenden privaten Entschlüsselungsschlüssel. Ein öffentlicher JWK allein reicht nicht.',
      '„Öffentliche Schemaquellen laden?“: Bestätigen Sie den Abruf im Dialog oder brechen Sie ab und hinterlegen Sie ein lokales Schema. Nach Ihrer Zustimmung wird die angefangene Prüfung fortgesetzt. Eine erteilte Freigabe gilt für die aktive Verbindung. Sie wird nicht gespeichert.',
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
      'Nutzen Sie die Betriebssystem-Skalierung für größere Darstellung und „Darstellung wählen“ für „System“, „Hell“ oder „Dunkel“. „System“ folgt Änderungen des Betriebssystems auch während der Sitzung.',
      'Bei PDFs öffnen Sie den auslesbaren Seitentext. Bei gescannten Anlagen oder unzugänglichen Originaldokumenten benötigen Sie gegebenenfalls ein externes geeignetes Hilfsmittel.',
    ],
    notes: [
      'Schema-Labels werden aus verfügbaren Schemaquellen übernommen. Ohne solche Informationen zeigt die Anwendung die tatsächlichen technischen Feldnamen.',
      'Die ausführliche Anleitung und ihre Abbildungen stehen auf der Website. Die Links in der Anwendung öffnen das passende Kapitel im Browser. Kurze Hinweise bleiben direkt bei den Eingaben verfügbar.',
    ],
  },
  {
    id: 'tools',
    title: 'Testpakete, Antwortschemas und Schema-Vergleich',
    section: 'Testwerkzeuge',
    image: 'test-packages',
    caption:
      'Ein fiktives Testpaket mit auswählbaren Testfällen, Fachdaten, Anlagen und erwarteten Antworten.',
    illustrations: [
      {
        image: 'test-case-library',
        caption: 'Direkte Auswahl eines geschützten Testfalls für einen neuen Versandentwurf.',
      },
      {
        image: 'schema-comparison',
        caption:
          'Lokaler Vergleich zweier JSON-Schemata mit sichtbaren Änderungen an Pflichtfeldern und Auswahlwerten.',
      },
      {
        image: 'channel-schemas',
        caption:
          'Eigene fachliche Statusmeldungen und Nachforderungen als JSON-Schema mit bearbeitbaren Feldern definieren.',
      },
      {
        image: 'channel-schema-export',
        caption:
          'Schema, fiktives Beispiel und bearbeitbaren Entwurf getrennt exportieren. Beide Seiten benötigen dieselbe Definition.',
      },
    ],
    intro:
      'Testpakete und Schema-Vergleich funktionieren lokal. Zum tatsächlichen Senden und Empfangen wechseln Sie in die gewohnten geführten Abläufe.',
    steps: [
      'Öffnen Sie „Testwerkzeuge“. Unter „Testpakete“ laden Sie ein gespeichertes Paket oder öffnen das fiktive Beispiel. Eine Anmeldung ist dafür nicht erforderlich.',
      'Wählen Sie einen Testfall aus. „Fachdaten und Anlagen ansehen“ zeigt den vorbereiteten Inhalt. Unter „Erwartungen für den manuellen Test“ können Sie den erwarteten Antwortinhalt und die Empfangsbestätigung hinterlegen. Diese Angaben lösen keine automatische Antwort oder Bestätigung aus. Paketname und Testfallname lassen sich unter „Bezeichnungen ändern“ anpassen.',
      '„Als Versandentwurf öffnen“ führt zu „Senden“ und bei Bedarf zur Anmeldung. Tragen Sie eine Empfänger-Destination ein und wählen Sie „Testfall übernehmen“. Nach Ihrer Bestätigung wird deren aktuelles Angebot geprüft. Nur bei passender Leistung, Prozessnachricht und Schema werden Fachdaten, Anlagen und Antwortangebot ersetzt. Die Case ID wird geleert. Prüfen Sie anschließend den Entwurf und bestätigen Sie den Versand separat.',
      'Einen eigenen Versandentwurf speichern Sie im dritten Versandabschnitt unter „Entwurf als Testfall wiederverwenden“. Vergeben Sie einen Namen. „Testfall speichern“ legt ihn geschützt in der lokalen Windows-Sammlung ab. Oben in „Senden“ wählen Sie ihn unter „Meine Testfälle“ direkt aus. „Testfall laden“ prüft nach Ihrer Bestätigung das Empfängerangebot und ersetzt den Entwurf. Unter „Testpakete importieren, exportieren und löschen“ verwalten Sie die Sammlung. Das Paket übernimmt keine Verbindung, privaten Schlüssel, Destination IDs oder bisherigen Nachrichtenkennungen. Im Werkzeug können Sie mehrere gespeicherte Pakete unter „Weitere Testfälle hinzufügen“ zusammenführen und das gemeinsame Paket speichern.',
      'Wechseln Sie zu „Schema-Vergleich“. Ziehen Sie die bisherige und die neue JSON-Schema- oder XSD-Datei in die beschrifteten Dateifelder. Prüfen Sie das Schemaformat und wählen Sie „Schemata vergleichen“. Der Beispielvergleich zeigt den Ablauf mit fiktiven Dateien.',
      'Die Ergebnisliste nennt hinzugefügte, entfernte und geänderte Struktureinträge. Suchen Sie nach einem Feld oder öffnen Sie dessen bisherige und neue Regeln. „Vergleich speichern“ exportiert den Bericht als JSON.',
      'Unter „Antwortschemas“ definieren Sie ein eigenes JSON-Antwortschema. Tragen Sie eine vereinbarte HTTPS- oder URN-Kennung mit Version, Bezeichnung und fachliche Statuswerte ein. Ergänzen Sie Felder und deren Datentypen und Pflichtangaben. Vorlagen für Statusmitteilungen und Nachforderungen ersetzen den aktuellen Entwurf. Speichern Sie ihn vorher, wenn Sie ihn behalten möchten.',
      '„JSON-Schema herunterladen“ exportiert die Definition, „Fiktives Beispiel herunterladen“ passende Beispieldaten und „Schemaentwurf speichern“ die bearbeitbaren Einstellungen. Den gespeicherten Entwurf können Sie später wieder öffnen. Der einfache Assistent importiert keine beliebigen vorhandenen JSON-Schemata zur Bearbeitung und entfernt deshalb keine unbekannten Regeln aus solchen Dateien.',
      'Bei der Empfängerleistung hinterlegen Sie die Kennung als unterstütztes Antwortschema. In der Destination-Einrichtung und -Verwaltung lässt sie sich aus der JSON-Schemadatei übernehmen. Dies lädt die Datei nicht hoch. Die Konfigurationsänderung wird separat bestätigt. Der Sender lädt die aktuellen Leistungen neu und bietet genau dieses Schema als Antwortkanal an. Ein Dateiimport im Versand umgeht das Empfängerangebot nicht.',
      'Stellen Sie die Schemadatei beiden Seiten lokal zur Verfügung oder veröffentlichen Sie sie selbst unter einer passenden HTTPS-Adresse. FIT-Connect überträgt die Kennung, nicht automatisch die Definition. Eine URN ist keine Downloadadresse. Beim Antworten laden Sie das passende lokale Antwortschema und prüfen den Inhalt. Empfangene Antworten werden mit derselben Definition geprüft. Eine fachliche Statusmeldung ersetzt keine technische Annahme oder Ablehnung.',
    ],
    notes: [
      'Exportierte Testpakete sind unverschlüsselte Dateien. Die lokale Sammlung wird mit dem Windows-Benutzerkonto verschlüsselt und bleibt nach einem Neustart verfügbar. Sie ist unabhängig vom Verbindungsprofil. Maximal 32 Pakete und insgesamt 64 MiB. Verwenden Sie nur fiktive Testdaten und prüfen Sie den Inhalt vor dem Teilen.',
      'Grenzen: 20 Testfälle, 8 MiB je Paket, 512 KiB Fachdaten, 2 MiB je lokalem Schema und 4 MiB je Anlage. Lokale Paket-Schemata müssen zur angegebenen Schema-URI passen. Eine abweichende $id wird nicht umgeschrieben.',
      'Der Schema-Vergleich ist ein Strukturvergleich, kein vollständiger Kompatibilitätsnachweis. Externe Referenzen, XSD-Imports und Codelisten werden nicht geladen. Bei XSD werden die ausgewählten Dateien verglichen. Prüfen Sie Änderungen zusätzlich mit Ihren Testfällen.',
      'Der Vergleich akzeptiert JSON-Schemata und XSD-Dateien bis 512 KiB. Fehlerantworten statt eines Schemas sowie XML mit DTDs oder externen Entitäten werden abgewiesen.',
    ],
  },
];

// 0.3 additions stay in the same maintained guide source. Exports are versioned independently.
const additions = {
  send: [
    'Der Scannerstatus bleibt im Versand sichtbar. Nach der Vorbereitung zeigt die Bestätigung das tatsächliche Virenscan-Ergebnis für Fachdaten und jede Anlage. Ein eingerichteter Scanner allein bestätigt noch keine Dateiprüfung. Vor der Übertragung wird erneut geprüft.',
    'Bei ungewissem Ausgang mit bekannter Case ID und Submission ID „Versand mit Server abgleichen“ wählen. Nur ein eindeutig zugeordnetes, geprüftes Bereitstellungsereignis bestätigt die Übergabe. Ein fehlendes Ereignis oder Lesefehler beweist keinen fehlgeschlagenen Versand. Der Abgleich sendet nichts erneut und bestätigt keinen Empfang.',
  ],
  receive: [
    'Beim Entschlüsseln ist der Prüfstatus sichtbar. Nach erfolgreichem Virenscan werden Metadaten, Fachdaten und die unauffälligen Anlagen ausdrücklich genannt. Gesperrte Anlagen bleiben getrennt gekennzeichnet. Ein ausgeschalteter Scanner wird nicht als erfolgreicher Scan dargestellt.',
    'Einzeldownloads von Anlagen und technischen Inhalten öffnen den Windows-Speichern-Dialog mit dem Downloadordner als Vorschlag. Den Speicherort können Sie ändern. Die Oberfläche meldet Erfolg, Abbruch und Schreibfehler. Das gilt auch für lokale Exporte. Dateien außerhalb der geschützten Vorgangsablage sind unverschlüsselt.',
    '„Alter aus Event Logs laden“ liest geprüfte Bereitstellungszeitpunkte für die geladene Seite. Danach nach Alter filtern oder älteste Einreichungen zuerst anzeigen. Fehlende Zeitpunkte bleiben unbekannt. „Nächste Einreichung öffnen“ führt zur folgenden Nachricht dieser Seite, ohne sie anzunehmen.',
  ],
  events: [
    'Die Übersicht zeigt die vollständigen Nutzdaten der sichtbaren verifizierten Ereignisse direkt, darunter Anlagenkennungen, Authentifizierungstags und alle vom Dienst gemeldeten Probleme mit Typ, Titel, Beschreibung und betroffener Ressource. Details werden seitenweise geladen. Große oder tiefe Strukturen bleiben als unveränderter Text lesbar. „Ereignisdaten“ und „JWS-Header“ öffnen zusätzlich die Originalansicht. Angezeigte Authentifizierungstags sind beim reinen Event-Log-Abruf nicht mit den Inhaltsbytes abgeglichen.',
  ],
  connection: [
    'In der Zertifikatsprüfung und im geladenen Schlüsselbestand werden abgelaufene sowie innerhalb von 30 beziehungsweise 90 Tagen ablaufende Zertifikate hervorgehoben. Erneuerung und Registrierung werden weiterhin bewusst durchgeführt.',
  ],
  destinations: [
    '„Bestehende Destinations“ öffnet die eigene Übersicht und lädt sie beim ersten Aufruf. Auch aus der Detailansicht führt die Schaltfläche zurück zur Liste. Dabei werden keine Destinations geändert.',
    'In der Bearbeitung unter „Konfigurationsvorlagen“ ausgewählte Felder geschützt im Profil speichern oder eine Vorlage importieren. Das Übernehmen ändert nur die Bearbeitung. Vor jedem Speichern aktuelle Servervorschau, Felder und Leistungs-/Schemaangebote vergleichen und separat bestätigen. Leistungsangebote werden als vollständige Listen ersetzt. Vorlagen mit Angeboten gelten für eine einzelne Antrags-Destination.',
    '„Lokale Änderungshistorie“ enthält bis zu 100 aktuelle Konfigurationsänderungen dieses Profils, dieser Umgebung und API. Vorher-/Nachher-Werte werden mit Windows-DPAPI geschützt gespeichert. Externe Änderungen und Schlüsselrotationen sind kein Bestandteil dieser lokalen Konfigurationshistorie. Ein ungewisser Eintrag verlangt einen Abgleich mit dem Server vor einer Wiederholung.',
  ],
  tools: [
    'Unter „Testwerkzeuge → Testfälle und Abläufe → Testabläufe“ ein Testpaket aus der Sammlung oder eine Datei öffnen. Ein Testfall bleibt ein einzelner Baustein. Ein Testablauf kombiniert Versand, Eingang, Inhaltsvergleich, erwartete Empfangsbestätigung und gegebenenfalls Antwort. Einen neuen Durchlauf starten, die Aktionen einzeln in den Arbeitsbereichen bestätigen und anschließend die passende lokale Nachricht auswählen. Prüfschritte vergleichen Fachdaten und Anlagen. JSON-Objektreihenfolge ist unerheblich; XML wird nach sicherer Syntaxprüfung exakt verglichen. Ein falscher Inhalt oder ein ungewisser Versand bleibt offen.',
    'Ablaufdefinition und Durchlaufergebnis können exportiert werden. Definitionen enthalten das unverschlüsselte Testpaket; Ergebnisse enthalten Nachrichtenkennungen und Prüfzeitpunkte. Verwenden Sie fiktive Daten und prüfen Sie Dateien vor dem Teilen. Der Durchlauf bleibt beim Wechsel des Werkzeugs oder Profils innerhalb derselben Umgebung geöffnet. Ein neuer Durchlauf setzt die Ergebnisse zurück.',
    'In der Hauptnavigation „Virenscan“ öffnen und zwischen ausgeschaltet, lokalem ClamAV und eigener ClamAV-/ICAP-Gegenstelle wählen. Im Windows-Setup kann die lokale Komponente mit offiziellen datierten Signaturen ausgewählt werden. Sie wird beim ersten App-Start ohne Internet übernommen. Der aktivierte lokale Standard gilt auch für neue Verbindungen. Er läuft nur während der Sitzung auf diesem Rechner, nicht als Windows-Dienst.',
    'Für die Nachinstallation „Scanner online einrichten“ oder „Lokales Scanner-Paket importieren“ wählen. Das Release enthält eine ClamAV-Distribution mit Komponenten-ZIP, Quellen und Lizenzhinweisen. Die Distribution zunächst entpacken und das innere Komponenten-ZIP auswählen. Anschließend „Lokaler ClamAV“ auswählen und anwenden. Downloads und Signaturaktualisierungen zeigen einen Status und sind abbrechbar. Sie laufen beim Seitenwechsel weiter. Über „Virenscan“ oder die sichtbare Scanner-Aktion kann der Vorgang auch nach dem Seitenwechsel abgebrochen werden. Die übrigen Arbeitsbereiche bleiben erreichbar. Ohne betriebsbereiten Scanner wird kein erfolgreicher Dateiscan bestätigt. Engine-Dateien und Virendatenbanken werden vor Übernahme geprüft.',
    'Engine-Version, Bereitschaft, Signaturversion und Signaturdatum bleiben sichtbar. Ein Bestand ab sieben Tagen erhält einen Altershinweis. Ohne erneutes Update oder Offline-Import altert der Bestand weiter. „Signaturen aktualisieren“ lädt offizielle Datenbanken mit FreshClam nach Bestätigung. Automatische Updates beim App-Start sind separat abschaltbar und erfolgen höchstens einmal täglich. FIT-Connect-Inhalte werden dafür nicht übertragen.',
    'Offline-Import: main.cvd, daily.cvd und bytecode.cvd sowie die jeweils zur Datenbankversion gehörende .cvd.sign-Datei gemeinsam auswählen. Die sechs Dateien stammen aus einem frisch erzeugten geprüften Komponentenpaket oder einer eigenen offiziellen FreshClam-Aktualisierung. Für eine eigene FreshClam-Aktualisierung „ScriptedUpdates no“ verwenden, damit vollständige CVD-Dateien entstehen; CLD-Dateien werden nicht importiert. Ungültige Signaturen und ältere Datenbanken ersetzen keinen neueren gültigen Bestand. Das App-Setup und der Scanner-Import benötigen dafür keinen zusätzlichen Netzaufruf. Eine unterbrochene Aktualisierung erhält den bisherigen geprüften Bestand. Temporäre Scannerdateien werden beim Beenden und nach einem unterbrochenen Lauf beim nächsten Start bereinigt.',
    'Eigene ClamAV-INSTREAM-/ICAP-RESPMOD-Dienste gelten nur für die Verbindung. Eine native Bestätigung zeigt Ziel und Übertragung entschlüsselter Inhalte. Unverschlüsseltes TCP benötigt eine lokale oder anderweitig geschützte Gegenstelle. Der Scanner prüft Metadaten, Fachdaten und Anlagen beim Empfang. Vor Versand oder Antwort werden Fachdaten und Anlagen geprüft. Metadaten-/Fachdatenfunde, Zeitlimits und unvollständige Scans bleiben blockierend. Es erfolgt keine automatische Annahme oder Ablehnung und keine Übertragung an einen FBForge-Scanner.',
    'Bei einem Anlagenfund bleiben geprüfte übrige Inhalte lesbar. Die betroffene Anlage erscheint mit Name und Kennung, jedoch ohne freigegebene Bytes. Ein vollständiger Originaldownload und die Sammelannahme sind gesperrt. Eine Einzelannahme mit Anlagenproblemen benötigt eine zusätzliche native Bestätigung. Sie bestätigt die gesamte Nachricht und meldet die betroffenen Kennungen als Problem an FIT-Connect. Benötigte Anlagen gegebenenfalls erneut anfordern. Es gibt kein Sanitizing und keine zusätzliche dauerhafte Quarantäne. Ein unauffälliger Scan ist keine Sicherheitsgarantie.',
  ],
};
for (const topic of helpTopics) topic.steps.push(...(additions[topic.id] || []));
helpTopics
  .find((topic) => topic.id === 'receive')
  .notes.push(
    'Technische Abholfrist für nicht abgeholte Nachrichten: grundsätzlich 14 Tage ab Bereitstellung, endgültige Löschung nach 21 Tagen. Erfolgreich abgeholte Nachrichten werden nach 7 Tagen gelöscht. Unvollständige Übertragungen nach einem Tag. Das sind technische Speicherfristen und keine fachlichen Bearbeitungsfristen.',
  );

helpTopics
  .find((topic) => topic.id === 'tools')
  .illustrations.push(
    {
      image: 'test-flows',
      caption:
        'Ein neuer Testablauf kombiniert bestehende Testfälle und prüft die Ergebnisse Schritt für Schritt.',
    },
    {
      image: 'malware-scanner',
      caption: 'Lokalen ClamAV mit sichtbarem Signaturstand oder eine eigene Scanner-Gegenstelle auswählen.',
    },
    {
      image: 'local-scanner',
      caption:
        'Lokale Komponente mit geprüftem Signaturbestand, bewussten Updates und Offline-Import verwalten.',
    },
  );
helpTopics.find((topic) => topic.id === 'destinations').illustrations = [
  ...(helpTopics.find((topic) => topic.id === 'destinations').illustrations || []),
  {
    image: 'destination-templates',
    caption: 'Konfigurationsvorlagen vor der aktuellen Servervorschau in die Bearbeitung übernehmen.',
  },
];
