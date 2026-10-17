# Alpha-Testplan · 0.1.0-dev.7

Aktueller Alpha-1-Kandidat und Nachweise: [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md). Die folgenden dev.2–dev.7-Abschnitte dokumentieren die früheren Regressionen; neue Live- und Installationsabnahmen sind in [LIVE_TESTS.md](LIVE_TESTS.md) und [INSTALLATION_TESTS.md](INSTALLATION_TESTS.md) beschrieben.

Entwicklungszweig: `develop`. Dies ist ein Entwicklungsstand für die erste ausführbare Alpha. Eine erfolgreiche Simulation ersetzt keinen Live-Test gegen TEST.

## Korrigierte und automatisiert geprüfte Fälle

| Fall | Prüfung |
| --- | --- |
| V3-Client darf senden, aber keine Vorgänge auflisten | Versand erfolgt ohne den zusätzlichen `GET /v3/cases` des SDK-Clientaufbaus. Absenderberechtigung, Empfängerschlüssel, Bestätigung und serverseitige Schreibberechtigungen bleiben geprüft. |
| Event Log mit Aussteller `https://submission-api-testing.fit-connect.fitko.dev` | Beide Adapter akzeptieren diese offizielle TEST-Adresse zusätzlich zur Gateway-Adresse. Die SDKs prüfen weiterhin Signaturen, Schema und Vorgangszuordnung. Unbekannte und Produktions-Aussteller werden abgelehnt. |
| Empfang und Entschlüsselung | SDK-generierte Einreichungen mit Fachdaten und fragmentierten Anlagen werden von v2 und v3 wieder empfangen und bytegenau verglichen. Metadaten 2.0.0 ermöglichen alle vier Sender-/Empfänger-Kombinationen. |
| Öffentliche TEST-Signaturschlüssel ohne `x5c` und `use` | Beide SDKs prüfen die Signaturen anhand der über den festen TEST-Endpunkt geladenen Schlüssel. Private Zustellpunktschlüssel behalten ihre eigene Testzertifikatsprüfung. |
| Fehler beim Abruf von Ereignissen oder Signaturschlüsseln | Der erste konkrete Fehler bleibt erhalten, auch wenn das SDK ihn abfängt und weitere Zugriffe versucht. Es entsteht kein Empfangsnachweis. |
| Fehlerbericht aus der Oberfläche | Empfang und Event Log zeigen API-Version und einen freigegebenen Fehlercode; ungeprüfte SDK-Meldungen werden nicht ausgegeben. |

## Lokale und Windows-Prüfung

Unter Windows mit JDK 25 und den Voraussetzungen aus der README:

```powershell
.\scripts\verify-windows.cmd
npm run desktop:build -- -- --locked
```

Der Workflow **Alpha Windows validation** läuft bei Pushes auf `develop` und `main` sowie bei Pull Requests. Nach erfolgreichem Lauf steht das unsignierte Installationspaket als Actions-Artefakt `windows-alpha-unsigned-setup` bereit. Ein Installer ist noch keine freigegebene Alpha; die folgende Live-Abnahme bleibt erforderlich.

## Live-Abnahme auf TEST

Nur fiktive Fachdaten und Testschlüssel verwenden. Zugangsdaten und private Schlüssel lokal in der Anwendung eingeben.

1. Den Windows-Installer auf einem frischen System installieren. Die Anwendung muss ohne separat installiertes Java, Node.js und Rust starten.
2. V2-Sitzung öffnen, den Test-Empfänger wählen und eine kleine JSON-Einreichung mit Textanlage senden. Einreichungs- und Vorgangs-ID festhalten. Der bereits erfolgreiche V2-Versand muss weiterhin funktionieren.
3. V3-Sitzung öffnen, einen berechtigten Absenderzustellpunkt wählen und denselben Fall senden. Anschließend eine Prozessnachricht mit passender registrierter Nachricht und Vorgangszuordnung prüfen. Kein Versuch darf einen Zugriff auf die allgemeine Vorgangsliste benötigen.
4. Als Empfänger beide Einreichungen jeweils über v2 und v3 auflisten und öffnen. Den passenden privaten Testschlüssel laden, Inhalte entschlüsseln und technisch prüfen. Fachdaten und Anlagen müssen mit den gesendeten Dateien übereinstimmen. Metadaten 3.x ausschließlich über v3 prüfen.
5. Für jede vollständig übermittelte Einreichung den Event Log öffnen. Ohne private Schlüssel müssen die Ereignisse erscheinen und ihre JSON-Daten lesbar sein. Nach einer manuell bestätigten Annahme oder Ablehnung den aktualisierten Log erneut prüfen.
6. Einen zweiten Fall mit XML/XSD und eine fragmentierte Anlage über 4 MiB prüfen. Der XRepository-Abruf, die Schema-Prüfung und der Download müssen funktionieren.
7. Mit fehlender Leseberechtigung und falschem Entschlüsselungsschlüssel prüfen: verständlicher Fehler, kein vollständiges Prüfergebnis und keine automatische Annahme/Ablehnung. Bei ungewissem Versand keinen automatischen Neuversand auslösen.

Für jeden Fall festhalten: Build/Commit, Windows-Version, API-Version, Aktion, Ergebnis und freigegebener Diagnosecode bzw. HTTP-Status aus der Versanddiagnose. Keine Zugangsdaten, privaten Schlüssel oder Einreichungsinhalte in Fehlerberichte kopieren.

## Noch offen

Für diese Überarbeitung stehen keine FIT-Connect-Zugangsdaten oder Fehlermeldungen aus dem vorherigen Live-Test zur Verfügung. Der konkrete bisherige Empfangsfehler ist daher noch nicht live zugeordnet. Die SDK-Roundtrips und die korrigierte Fehlerweitergabe schaffen eine reproduzierbare Grundlage für die erneute Abnahme. Live-Versand, Live-Empfang, Windows-Installation und Signierung müssen vor der Alpha-Freigabe bestätigt werden.

## Zusätzliche Abnahme von dev.3

Die Eventlog-Prüfung deckt nun 300 signierte Ereignisse mit beiden SDKs ab. Schlüssel werden je Prüflauf wiederverwendet und beim nächsten Prüflauf neu geladen. Eine vom SDK angeforderte leere Abschlussseite nach exakt vollen Seiten wird akzeptiert; widersprüchliche Seiten und fremde Einreichungsfilter bleiben abgelehnt.

Die Zustellpunktverwaltung benötigt keinen Quellcode des früheren Portals. Sie verwendet die dokumentierten SDK-/Destination-API-Verträge. Aktueller Umfang: vorhandene eigene Zustellpunkte lesen; über v3 Name, Kontakt, Metadatenversionen und zulässige Aktiv-/Inaktiv-Wechsel ändern. Anlegen, Löschen, Schlüssel- und Leistungsverwaltung bleiben Folgearbeiten.

1. Unter „Zustellpunkte“ eigene Zustellpunkte laden. Die Liste und die Detailansicht müssen zu den angemeldeten Zugangsdaten gehören. Die Detailansicht verwendet die authentifizierte Destination API, nicht die öffentliche Submission API.
2. Einen Zustellpunkt öffnen, den Namen oder einen Kontaktwert ändern und die Vorschau erstellen. Bis zur ausdrücklichen Speicherung darf auf TEST nichts verändert sein.
3. Zwei Zustellpunkte auswählen und die Namensvorlage `{name} – Test` vorbereiten. Vorher/Nachher für beide prüfen und explizit speichern. Nicht angehakte Felder, Schlüssel, Leistungen und Callbacks müssen erhalten bleiben.
4. Eine Vorschau erstellen, denselben Zustellpunkt außerhalb des Clients ändern und dann bestätigen. Die Vorprüfung muss die gesamte Auswahl vor dem ersten PATCH abbrechen. Die Prüfung erfolgt unmittelbar vor den Änderungen; ohne serverseitiges If-Match ist sie keine atomare Transaktion.
5. Bei fehlenden Schreibrechten oder Teilausfällen muss ein Ergebnis je Zustellpunkt erscheinen. Bei verlorener Antwort darf keine automatische Wiederholung stattfinden. „Ergebnis abrufen“ liest nur den lokalen Zustand. „Ansehen“ lädt den aktuellen Serverzustand auch nach ungewissem Ausgang. Für weitere Schreibversuche nach einem ungewissen Ausgang eine neue Sitzung öffnen.
6. Mit v2 darf die Detailansicht funktionieren; die Schreiboberfläche muss ausdrücklich auf die v3-Sitzung verweisen.

Die Tests verwenden synthetische API-Antworten und erzeugen keine Änderungen an echten TEST-Zustellpunkten. Eine fachliche Prüfung der Statuswechsel, Kontaktvalidierung und Schreibberechtigungen auf TEST bleibt erforderlich. Bulk-Edit ist eine Folge einzeln bestätigter Zieländerungen mit einer gemeinsamen Bestätigung, keine serverseitig atomare Transaktion.

## Zusätzliche Abnahme von dev.4

1. Bei 1180 × 800, 800 × 600 sowie der Mindestgröße 420 × 500 prüfen: Navigation, Kopfzeile und Statusleiste bleiben sichtbar. Es gibt keine äußere Seitenscrollleiste; längere Inhalte scrollen im Arbeitsbereich. Tabellen dürfen eine eigene horizontale Scrollfläche benötigen.
2. Die Anwendung startet mit API v3. Unter „Verbinden“ anmelden, den Dialog schließen, Zugangsdatenfelder auf Leerung prüfen und zwischen den Arbeitsbereichen wechseln. API v2 ausdrücklich auswählen; die v3-Sitzung darf dadurch nicht in v2 verwendet werden. Die API-Auswahl bleibt während einer Aktion gesperrt.
3. Versandadressierung und Fachdaten eingeben. Zwischen allen drei Versandabschnitten und anderen Arbeitsbereichen wechseln. Eingaben müssen erhalten bleiben. Bei „Versand vorbereiten“ mit fehlenden Pflichtfeldern muss der entsprechende Abschnitt mit fokussiertem Eingabefeld erscheinen; es darf keine Übertragung stattfinden.
4. Unter „Diagnose“ beide Komponenten prüfen. Berichtsvorschau öffnen und JSON speichern. Version, TEST und lokale Komponentenprüfungen müssen stimmen. Nach einer fehlgeschlagenen Aktion muss ein freigegebener Fehlercode oder `unknown_error` sichtbar sein. Bericht enthält keine Geheimnisse, Einreichungsinhalte, Kennungen oder Dateinamen; er wird ausschließlich lokal gespeichert. Verlauf leeren, anschließend prüfen, dass keine vorherigen Aufrufe im nächsten Export stehen.
5. Hell-/Dunkeldesign wechseln und Anwendung neu starten. Nur die Darstellungseinstellung wird gespeichert. Navigation und beide Dialoge per Tastatur bedienen; Escape schließt Dialoge und gibt den Fokus an den Auslöser zurück. Während einer laufenden Sitzungsaktion darf der Verbindungsdialog nicht geschlossen werden.
6. Unter „Info“ Version, TEST-Beschränkung und den vollständigen EUPL-Lizenztext prüfen. Keine Herstellerwerbung im normalen Arbeitsbereich. Ein separates Fenster oder externe Webseite wird nicht geöffnet.

Die Browserprüfung verwendet eine synthetische native Schnittstelle. Sie prüft Oberfläche und Export, nicht die Kommunikation mit FIT-Connect oder die tatsächliche Windows-WebView. Reply-, Prozess- und ZBP-Funktionen wurden in dev.4 nicht erweitert. PROD bleibt ausgeschlossen.

## Zusätzliche Abnahme von dev.5

1. Installer, Fenstertitel, Hauptnavigation/Programminformationen und Diagnosebericht müssen „FIT-Connect Test-Client“ verwenden. Installation beziehungsweise Aktualisierung von dev.4 gesondert prüfen; das Umbenennen ist kein bereits getesteter Upgrade-Nachweis.
2. Beim Versand JSON über Eingabefeld und Datei vorbereiten. „Fachdaten visuell ansehen“ öffnen: Feldgruppen, Suche, JSON-Struktur und Quelltext prüfen. Werte und Dateiauswahl müssen nach dem Schließen unverändert sein. Öffnen/Schließen darf keine Übertragung auslösen. Für XML dasselbe prüfen.
3. Eine JSON-Einreichung entschlüsseln und prüfen. „Antrag lesen“ muss direkt erscheinen; Namens-/Adressfelder, verschachtelte Gruppen und Listen müssen den Originaldaten entsprechen. Feldherkunft muss den Originalschlüssel und JSON-Pointer zeigen. Insbesondere große Ganzzahlen, Exponenten, leere Werte und doppelte Schlüssel prüfen.
4. Eine XML-Einreichung mit Namensräumen, Attributen, wiederholten Elementen, Text/CDATA und Leerraum prüfen. Präfixe und Namensräume müssen unter Feldherkunft erhalten bleiben; wiederholte Elemente behalten ihren Index. Leerraum separat aufklappen. Quelltext bleibt unverändert. Ungültiges XML und DTD-/Entity-Deklarationen dürfen keine scheinbar vollständige Formularansicht ergeben.
5. Anlage aus der separaten Anlagenliste ansehen und herunterladen. Die vorhandenen Regeln für aktive Formate bleiben bestehen: PDF, HTML, SVG und Office nur Download. Anschließend eine angebotene Antwort laden, Inhalte eingeben und lokal visuell ansehen; erst nach gesonderter Vorbereitung und Bestätigung senden.
6. Prüfergebnis verwerfen, anderen Antrag wählen, Schlüssel wechseln oder abmelden: Formular und offene Vorschau müssen sofort verschwinden. Einen verspäteten lokalen Lesevorgang simulieren; alte Fachdaten dürfen danach nicht wieder erscheinen.
7. Fachdaten über 256 KiB, tiefe und breite Strukturen prüfen. Der Hinweis auf Darstellungsgrenzen darf die Originaldatei nicht verändern. Quelltext/Download bleiben verfügbar. JSON-/XML-Antragsansicht bei 420 × 500 und im Dunkeldesign prüfen.

Reproduzierbare lokale Empfangsfixture: Nach `npm run dev` die URL `/test-fixtures/application-view.html` öffnen. Sie verwendet ausschließlich synthetische Daten und eine simulierte native Schnittstelle. Die Fixture gehört nicht zum Produktions-Einstiegspunkt. XML-Parser-/Empfangs-Browserchecks und Node-Modelltests ersetzen keine Live-Abnahme mit echten TEST-Einreichungen.

## Zusätzliche Abnahme von dev.6

1. Einen JSON-Testantrag mit technischen Feldkennungen und einem Schema mit `title`, `description`, `$ref`, Arrays und `required` senden und empfangen. Bezeichnungen und Pflichtfeldhinweise prüfen; unter Feldherkunft müssen Originalpfad und Schemaquelle nachvollziehbar bleiben. Große Zahlen und alle Werte müssen mit dem Quelltext übereinstimmen. Nicht gesendete Felder und Schema-Defaults dürfen nicht erscheinen.
2. Einen realen FIM-/XÖV-XSD-Standard mit fiktiven Daten erproben: XRepository-Archiv, Includes, Imports, Namensräume, Attribute und Codelisten prüfen. Nur direkt dokumentierte Enumerationen erhalten Wertbezeichnungen. `appinfo` und separat referenzierte Codelisten dürfen keine erfundenen Bezeichnungen erhalten.
3. Beim Senden eigene Daten eingeben, „Schema-Beschriftungen laden“ bestätigen und die Formularansicht öffnen. Laden und Anzeigen dürfen weder Entwurf noch Versand ändern. Ohne Bestätigung kein Schemaabruf; beim Wechsel von Sitzung, Zustellpunkt, Leistung, Prozess oder Schema dürfen alte Beschriftungen nicht wieder erscheinen.
4. Empfangene Daten nach erfolgreicher Prüfung ansehen. Für die Schemaansicht darf keine weitere HTTP-Anfrage erfolgen. Prüfergebnis verwerfen und Sitzung wechseln: Schemaquellen und Daten dürfen nicht mehr abrufbar sein. Dieselbe Prüfung für empfangene Replies durchführen.
5. Fehlende Referenzen, konkurrierende `oneOf`-Beschriftungen, doppelte XSD-Typdefinitionen, DTDs und übergroße Pakete prüfen: Originalnamen beziehungsweise begrenzte Ansicht, keine frei gewählte fachliche Bedeutung. Feldwerte bleiben zugänglich. Einen optionalen XML-Block und `xs:choice` prüfen; enthaltene Felder dürfen nicht pauschal als Pflichtfelder erscheinen.
6. Lokale Browser-Prüfseite im Entwicklungsserver: `/test-fixtures/schema-annotations.html`. Ergebnis muss eine leere Fehlerliste zeigen. Sie prüft den echten DOMParser und wird nicht in die Desktop-Anwendung gebaut. Antwortentwürfe erhalten ab dev.7 die Beschriftungen ihres ausdrücklich geladenen Antwortschemas.

## Zusätzliche Abnahme von dev.7: vollständiger Testvorgang

1. Als Onlinedienst einen Antrag mit passendem Antwortangebot und Anlage über TEST senden. Die Sitzung geöffnet lassen: Der private Antwortschlüssel ist weiterhin ausschließlich sitzungsgebunden. Auf Fachverfahrens-Seite den Antrag entschlüsseln, Originalwerte und Anlagen prüfen. Die Oberfläche muss Entschlüsselung/Integrität, Schemaprüfung und die manuell offene fachliche Prüfung unterscheiden.
2. „Antwortmöglichkeiten laden“, angebotenes Schema wählen und „Antwortschema laden“ bestätigen. Bei einem nicht öffentlichen JSON-Schema eine lokale Datei mit passender Dokument-`$id` auswählen; diese Option darf keine externen Abrufe auslösen. Die Antwortvorschau muss Bezeichnungen und Schemaherkunft zeigen. Auswahl, Vorschau und Beispielerzeugung dürfen noch keine Antwort versenden.
3. Einen syntaktisch gültigen, aber schematisch falschen Antwortentwurf eingeben: „Antwort prüfen und vorbereiten“ muss vor dem Bestätigungsdialog scheitern. Fehlende Pflichtfelder, falsche Typen sowie ungültiges JSON/XML prüfen. Einen passenden Entwurf vorbereiten; die positive Schemaprüfung muss im Dialog stehen. Escape/Abbrechen darf nichts versenden.
4. Erneut vorbereiten und ausdrücklich bestätigen. Antwortbytes und Anlagen müssen unverändert übermittelt werden. Nach ungewissem Ausgang kein automatischer Wiederholungsversuch; bei bekannter Reply-ID muss der Einstieg zum Reply-Event-Log weiterhin bedienbar sein. Eine erfolgreiche Antwort darf den Originalantrag nicht automatisch annehmen oder ablehnen.
5. In der ursprünglichen Onlinedienst-Sitzung die tatsächliche Antwort laden und entschlüsseln. Fachdaten und Anlagen mit dem gesendeten Entwurf vergleichen. „Event Log der Antwort prüfen“ muss Vorgangs-/Reply-ID übernehmen und einen eigenständigen, verifizierten Reply-Log anzeigen. Signaturen und Zuordnung werden geprüft; der Hinweis auf nicht abgeglichene Inhalts-Authentifizierungstags bleibt sichtbar.
6. API-/Sitzungswechsel, Prüfergebnis verwerfen, Schema-/Formatwechsel und verspätete Schemaantworten prüfen. Alte Beschriftungen oder Schema-IDs dürfen einen neuen Entwurf nicht autorisieren. Ein nachgeladener oder fehlgeschlagener Schemawechsel darf keinen alten Schemaprüferfolg anzeigen.
7. Den Vorgang zuerst über v3/v3 und anschließend bei Bedarf mit v2/v3-Mischung sowie mit JSON und XML prüfen. Für die automatisierte Browserprüfung dient `/test-fixtures/application-view.html` mit ausschließlich synthetischen Daten; diese Seite wird nicht in das Desktop-Paket gebaut.

Noch kein Beta-Abnahmekriterium erfüllt sind: vollständige FIM-`appinfo`-/Codelistenprofile, neue Zustellpunkte und Schlüsselregistrierung, geschützte dauerhafte Profile, BPMN-Oberfläche sowie eine eigene Oberfläche für Reply-Empfangsbestätigungen. Diese Funktionen bleiben gesonderte Folgeschritte.
