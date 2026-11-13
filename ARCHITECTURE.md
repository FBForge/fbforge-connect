# Architektur

Vue → Tauri/Rust → Java-Host → FIT-Connect SDK v2/v3 → TEST, STAGE oder PROD

| Modul                             | Aufgabe                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `frontend/src`                    | Oberfläche, Entwürfe und Bestätigungen                           |
| `desktop/src`                     | Tauri-Befehle, IPC, Profile und Vorgangsspeicher                 |
| `engine/adapter-support` | Gemeinsamer HTTPS-Schemaabruf, in jedem Adapter separat geladen |
| `engine/contract`                 | SDK-unabhängige Verträge                                         |
| `engine/host`                     | Sitzungen, Berechtigungen, Ressourcenlimits und Schreibfreigaben |
| `engine/adapter-v2`, `adapter-v3` | SDK-Aufrufe, Serialisierung und Kryptografie                     |

Die SDK-Versionen laufen in getrennten Classloadern. `adapter-support` wird in beide Adapter eingebettet und verwendet dort die jeweilige HTTP-Bibliothek. Schema-Validierung bleibt SDK-spezifisch. Ein Isolationstest prüft getrennte Hilfsklassen und identischen gemeinsamen Bytecode. Gemeinsame Verträge enthalten keine SDK-Typen.
Die Umgebung ist je Engine-Prozess fest. Ein Umgebungswechsel beendet die bisherigen Verbindungen.
Der API-Wechsel innerhalb derselben Umgebung kann die aktuelle Anmeldung wiederverwenden;
Schlüssel, Profile und Vorgänge bleiben nach API getrennt.

## Zuständigkeiten

`App.vue` verbindet die Arbeitsbereiche. Verbindung, Profile und Diagnose liegen unter `frontend/src/app`. Die Fachansichten verwenden ihre Ablaufsteuerung unter `send`, `receive`, `reply`, `cases`, `destinations`, `events` und `process`. Beim Senden gehören Entwurf, Anzeigezustand und bestätigter Versandversuch zu getrennten Zuständen. Styles beginnen bei `styles/index.css`, gemeinsame Farben und Schriften bei `styles/theme.css`.

`useSendAddressing.ts` verwaltet Leistung, Prozessnachricht und zugehörige Schemata über synchrone Übergänge. Der Versandcontroller kümmert sich um Laden, Entwurf und Versand. Dadurch benötigen abhängige Auswahlfelder keine gegenseitigen Watcher. Native Antworten bleiben `unknown`, bis die Laufzeitprüfung sie auf einen öffentlichen Vertrag eingegrenzt hat. Profilmetadaten, Sitzungen, Schema-Paging und die native Warteschlange sind streng typisiert. `contracts.d.ts` enthält ausschließlich Typen. Die übrigen JavaScript-Ansichten werden schrittweise migriert, ihre vollständige statische Prüfung steht noch aus.

Rust trennt Befehle unter `commands`, Prozesskommunikation in `engine.rs` und die zentrale Schreibabsicherung in `write_policy.rs`. Der Java-Host prüft Frames in `EngineRequest` und delegiert über `SessionManager` an fachliche Koordinatoren. `SessionState` besitzt die SDK-Sitzungen und räumt deren Ressourcen auf. SDK-spezifische Sitzungen und Destination-Aufrufe bleiben in ihrem Adapter.

SDK-Fehler beim Empfang, bei Antwortkanälen und beim Event Log behalten ihren
festen Fehlercode. Ein optionales Feld `diagnostics` enthält höchstens acht
SDK-Meldungen mit Prüfphase, Fehlertyp und begrenztem Text. Die Adapter übernehmen
sowohl Ausnahmen als auch abgelehnte SDK-Prüfberichte. Bei SDK3 werden zusätzlich
Validierungsergebnisse und Probleme mit Authentifizierungstags erfasst, bevor das
SDK sie zu einer allgemeinen Ausnahme zusammenfasst. Der gemeinsame Schreibschutz
reicht den typisierten Fehler unverändert weiter. Unbekannte Codes, widersprüchliche
Frames und ungültige Detailfelder bleiben Protokollfehler.

`SdkDiagnostic` begrenzt die Meldungen und entfernt erkennbare Zugangsdaten,
Schlüsselmaterial und Parser-Quelltextauszüge. Rust und Frontend prüfen den
Detailvertrag erneut. Die Oberfläche zeigt den Text ausschließlich als Text an.
Er bleibt im lokalen Sitzungsverlauf und fehlt im standardmäßigen Diagnoseexport.
SDK-Meldungen sind trotzdem keine zugesicherte Anonymisierung und können Angaben
aus der Nachricht enthalten. Ein fehlgeschlagener SDK-Bericht gibt weder Inhalte
noch einen Nachweis für die Annahme frei.

Globale Netzwerk-, Proxy- und Updateoptionen liegen unter „Einstellungen“, gefolgt
von Programm- und Lizenzinformationen. Der Browser-Kontextmenüschutz beeinflusst
keine fachlichen Berechtigungen. Der Empfang prüft das Antwortangebot ausschließlich
im nativen, kryptografisch geprüften Kontext. Ein fehlender Kanal bietet keine
Antwortaktion. Prüfungsfehler bleiben von einem fehlenden Angebot unterscheidbar.
Verspätete Prüfergebnisse werden nach einem Kontextwechsel verworfen.

## Sicherheitsgrenzen

### Zustellpunkt-Sicherungen

`DestinationBackupSource` liest die authentifizierte eigene Ansicht der Destination
API v3 und paginierte öffentliche Schlüssel. Die Konfiguration wird vor Abschluss
erneut verglichen. Lokale private Schlüssel werden nicht gelesen. Der private
Engine-Befehl `export_destination_item` überträgt ausschließlich öffentliche Daten
in begrenzten sequenziellen Teilen.

Native Validierung und DPAPI-Ablage sind an Profil und Umgebung gebunden. Maximal
20 Sicherungen mit je 4 MiB können gespeichert werden. JSON-Import und -Export
verwenden Format v2 ohne Passwort. Private Felder werden abgewiesen. Vorhandene
lokale v1-Sicherungen werden beim Lesen ohne private Kopien neu gespeichert.
Der Profil-Schlüsselbestand bleibt davon unabhängig. Die zusätzlichen privaten
Schlüsselimport-Befehle der ersten Implementierung sind entfernt.

Anlage und Änderung nutzen die vorhandenen Assistenten. Schlüssel werden separat
im Profil verwaltet und für die Anlage gewählt. Statuswechsel und Registrierung
bleiben explizite Aktionen. Callback-Secrets fehlen in lesbaren Vorschauen und im
Journal. Die Grundlage ist die
[Destination API 3.0.0](https://schema.fitko.de/fit-connect/destination-api/3.0.0/destination-api.yaml).

### Weitere Grenzen

- Der Renderer hat keine allgemeinen HTTP-, Shell- oder Dateisystemrechte. Private Archivbefehle (`export_session_item`, `restore_session_item`, `export_destination_item`) sind nur aus Rust erreichbar.
- Schreibaktionen sind an Inhalt, Sitzung, API und Ziel gebunden und benötigen eine Bestätigung. Nach einem ungewissen Übertragungsausgang erfolgt kein automatischer Neuversand.
- Annahme und Ablehnung benötigen aktuelle native Inhaltsnachweise. Historische Kopien und Event-Logs ersetzen diese nicht. Case-Logs können mehrere Nachrichten und quittierende Destinations enthalten. Jeder Aussteller wird anhand seines registrierten Schlüssels per SDK verifiziert; jedes Ereignis bleibt an die angefragte Case-ID gebunden.
- Profile, private Schlüssel und Vorgangskopien werden getrennt und benutzergebunden mit Windows-DPAPI gespeichert. Vorgänge sind nach Profil und API isoliert und für gespeicherte Profile unter Windows standardmäßig dauerhaft aktiviert. Eine ausdrückliche Abwahl bleibt als verschlüsselte Einstellung erhalten. Tokens und alte Prüfnachweise werden nicht wiederhergestellt. Andere Plattformen haben keinen Klartext-Fallback.
- Profilsicherungen werden nativ entschlüsselt. Drag-and-drop reicht nur größenbegrenzte, verschlüsselte `.fctest-profile`-Dateien weiter und gibt Profilmetadaten zurück. Eine Profil-Sicherung enthält keine Vorgänge.
- Antwortschlüssel werden vor dem Versand gesichert. Bei aktivierter Vorgangsaufbewahrung muss die Sicherung vor der Empfangsbestätigung gelingen. Ein Speicherfehler nach erfolgtem Versand darf keinen erneuten Versand auslösen.
- Öffentliche Schemaquellen benötigen eine ausdrückliche Freigabe für die aktive Verbindung. Die Freigabe wird weder im Profil gespeichert noch auf eine andere Verbindung übertragen. Lokale Schemata benötigen sie nicht.
- Einzel- und Sammelabruf verwenden denselben Freigabeablauf für öffentliche Schemaquellen, auch bei strukturierten SDK-Fehlern. Schemaabweichungen bleiben im Prüfnachweis erhalten. Der Host bindet daraus `schema-violation` mit `instance: data` an die Annahme und prüft die Bindung vor dem Senden erneut. Der native Schreibpfad verlangt die Bestätigung des aktuellen Versuchs aus dem App-Dialog. Für Sammelannahmen ist diese Ausnahme standardmäßig aus.
- Der v3-Adapter führt seinen nachgewiesenen Schemafehler und die dazugehörige SDK-Warnung `DATA` nur bei einem typisierten `DataSchemaViolation` zusammen. Andere Warnungen, nicht zugeordnete Datenhinweise und echte Fehler bleiben erhalten. Einreichungen und Antworten verwenden dieselbe Zuordnung.
- Nachrichten-Downloads schreiben die entschlüsselten Originalbytes ohne zusätzliches Exportmanifest. Ein gewählter `FBForge-Connect-Export`-Ordner wird wiederverwendet. Nachrichten erhalten eigene, kollisionsfrei angelegte Unterordner. Teilfehler bereinigen ausschließlich selbst angelegte Dateien.
- Leistungsnamen können gezielt aus dem öffentlichen FIM-Portal geladen werden. Der Renderer darf dafür ausschließlich die festgelegte HTTPS-Quelle verwenden; übertragen werden LeiKa-Kennungen, keine Zugangsdaten oder Fachdaten.
- Einzeldownloads und generierte Dateien verwenden binäres IPC und einen nativen Speichern-Dialog mit dem Benutzer-Downloadordner als Vorschlag. Der Renderer liefert keinen Zielpfad. Größenbegrenzung, Originalbytes, atomarer Dateitausch und sichtbare Fehler gelten auch für technische Inhalte.
- Gemeinsame Nachrichtendownloads benötigen eine native Ordnerfreigabe. Exportiert werden erfolgreich geprüfte Originalinhalte oder ausdrücklich gekennzeichnete historische Vorgangskopien. Downloads liegen unverschlüsselt außerhalb der DPAPI-Ablage. Annahmen mit gewähltem Download werden erst nach erfolgreichem Export gesendet. Technische Fehler im Sammeldurchlauf bleiben manuell; es gibt keine automatische Ablehnung.

JSON/XML-Fachdaten werden im nativen Kern gegen JSON Schema beziehungsweise XSD geprüft. Vor dem Versand ist die Prüfung standardmäßig aktiv. Bewusste Negativtests lassen sich ausdrücklich ohne Fachdatenprüfung vorbereiten. Die Bestätigung weist darauf hin.

Die Testwerkzeuge bieten einen gemeinsamen Bereich „Tests“ mit Übersicht,
Vorbereitung, Durchführung und Ergebnissen. `ScenarioLibrary` zeigt aktuelle
Tests sowie bisherige Pakete und Ablaufdefinitionen über `useTestCollection` an.
Die Speicherformate und ihre geprüften Leser bleiben getrennt. Das Öffnen einer
alten Definition erzeugt eine bearbeitbare Kopie. Frühere Durchläufe verwenden
weiterhin den bisherigen Prüfer, damit ihr Fortschritt erhalten bleibt.
Testserien erhalten eine eigene Ansicht und halten ihre Definition fest.

Tests und Schema-Vergleich arbeiten lokal. Die begrenzten Sammlungen werden
benutzergebunden mit Windows-DPAPI gespeichert. Ablaufdefinitionen enthalten
Testdaten und Schrittfolge, keine Sitzung oder laufenden Testergebnisse.
Pakete enthalten fiktive Nutzdaten, Anlagen, lokale Schemata und Erwartungen.
Verbindungsdaten und private Schlüssel werden nicht übernommen. Erst die
Übernahme in den normalen Versandablauf ermöglicht einen separat bestätigten Versand.

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

## Prozessnachrichten und Antwortschemas

BPMN-Element-IDs sind keine FIT-Connect-Kennungen. Eigene Modelle verwenden die
Erweiterung `urn:fit-connect:test-client:bpmn:1` mit `processModelId`, `messageId`
und optional `schemaUri`/`mimeType`. `processModelId` darf an Definition oder Nachricht
stehen. Zuordnungsdateien sind an den Modell-SHA-256 gebunden. Beispiel:
[frontend/src/examples/test-process.bpmn](frontend/src/examples/test-process.bpmn).

`process-context.js` stellt übernommene Zuordnungen lokal bereit. Destination-Angebote
und erlaubte Prozessantworten übernehmen sie ausdrücklich. Manuelle Kennungen sind
begrenzt, duplikatfrei und erweitern keine Berechtigung. Ein Schemawechsel verwirft
die bisherige Prozessantwortliste. Es gibt keine Prozess-Engine und keinen BPMN-Editor.

`channel-schemas.js` erzeugt lokal JSON Schema Draft 2020-12, fiktive Daten und einen
versionierten bearbeitbaren Entwurf. Maximal 32 Zusatzfelder, begrenzter Import,
keine Bearbeitung beliebiger fremder Schemas unter Verlust unbekannter Regeln.
Dateihilfen übernehmen Kennungen, laden aber keine Definition auf den Server.
Beide Gegenstellen benötigen dieselbe Schemadatei oder eine eigene HTTPS-Quelle.
Versand und Antwort bleiben an tatsächlich angebotene Kennungen gebunden.
Es gibt keinen Schemahost oder neue Netzwerkfreigaben. Generatorbeispiele und
Negativfälle werden durch beide echten SDK-Validatoren geprüft.

## Tests

Kritische native Ablaufregeln liegen außerhalb der Tauri-Adapter. `write_gate`
steuert Scannerbereitschaft, native Bestätigungen und Checkpoints vor und nach
Schreibaktionen. `profile_archive` und `export_source` prüfen die Kontextbindung
privater Archive und Exporte. `update_state` und `update_install` verwalten
Versionsbindung, Installationsfreigabe und Wiederaufnahme nach Fehlern. Die
Vertragstests kompilieren diese Produktionsmodule direkt. Dialoge und Engine-IPC
bleiben Aufgaben der Desktop-Adapter.

SDK-Tests prüfen Verschlüsselung und Rundläufe. Frontend- und native Tests die Verträge und Kontextbindung. Browser-Fixtures werden nicht ausgeliefert. DPAPI, Installation und Upgrades werden unter Windows geprüft. Reale Austausche auf FIT-Connect TEST. Befehle stehen in [BUILDING.md](BUILDING.md), Live-Abnahmen in [RELEASING.md](RELEASING.md#live-abnahme).

Änderungsprüfungen wählen betroffene Module aus. Die manuelle Windows-Release-Prüfung baut das vollständige Paket und prüft Installation, Profilerhalt und NVDA. Die Signierung erfordert einen erfolgreichen Lauf für denselben Commit. Ein separater Windows-Runner prüft anschließend das signierte Paket.

## Abläufe, Profil-Arbeitsdaten und Scanner

Die Testabläufe kombinieren vorhandene Testfälle und prüfen lokale Nachrichtenergebnisse. Sie besitzen keine zusätzliche Schreibberechtigung; Versand, Empfangsbestätigungen und Antworten bleiben hinter ihren bestehenden nativen Bestätigungen. Der Versandabgleich liest signierte SETs anhand bekannter Kennungen und verändert keinen Versandversuch.

Die geführten Integrationstests ab 0.4 liegen in `integration/scenarios`. Versionierte
Definitionen beschreiben Gegenstellen, Datensätze und Erwartungen. Ein Durchlauf
enthält eine unveränderliche Definitionskopie, aufgelöste Werte, Kennungszuordnungen
und sämtliche Prüfversuche. JSON-Feldänderungen erhalten große Zahlen, XML-Vergleiche
beachten Namensräume und gemischten Text. Antworten können beobachtete Werte übernehmen,
ohne die erwartete Einreichung nachträglich zu verändern.

Zusätzliche Antworten erweitern das bestehende Version-2-Format durch optionale
Felder. Alte Definitionen und Durchläufe behalten ihre Form und Kennungen.
Jede zusätzliche Antwort hat stabile Prüfschritte und eine eigene Reply-ID-Zuordnung.
Sie verwendet das vereinbarte Antwortschema der Einreichung. Prozesskennungen werden
bei der Vorbereitung in deren Antwortangebot übernommen. Bereits gesendete Angebote
bleiben unveränderlich. Die normalen nativen Versandbestätigungen gelten weiterhin.

Vollständige Vergleiche liefern begrenzte JSON-/XML-Strukturdetails zusätzlich zur
maßgeblichen Inhaltsprüfung. Höchstens 20 Abweichungen je Versuch, gekürzte Feldwerte
und insgesamt 128 KiB Vergleichsdetails verhindern unbegrenzte Prüfprotokolle.
Ein Detail-Limit macht keinen fehlgeschlagenen Vergleich erfolgreich. Ergebnisexporte
enthalten verglichene Feldwerte nur nach ausdrücklicher Auswahl. Der Modus
`field-exceptions` maskiert ausschließlich skalare Werte nach erfüllter
Feldbedingung. Alle übrigen Strukturen und Anlagen bleiben vollständig relevant.
JSON-Zahlen werden als unveränderte Tokens verglichen und formatiert.
Ergebnisexporte nennen den Vergleichsmodus und die hinterlegten Bedingungen.

Der Controller trennt Vorbereitung, Durchführung und Vergleich. Er bindet Nachweise
an Profil, Umgebung, API, Nachricht und Startzeit. Der ausdrücklich gestartete
Wartemodus liest höchstens fünf Minuten ohne parallele Abfragen und ohne Schreibaktionen.
Profilwechsel und Abbruch verwerfen verspätete Ergebnisse. Bereits laufende native
Leseaufrufe können innerhalb ihrer bestehenden Zeitgrenzen noch auslaufen.

`scenario_library` validiert Definitionen und Durchläufe nochmals nativ. Getrennte
Sammlungen unter `test-library/scenarios-v2`, `scenario-runs-v2` und `scenario-series-v1` sind mit Windows-DPAPI
für das Benutzerkonto geschützt, jeweils auf 32 Einträge und 64 MiB begrenzt.
Einzelne Dokumente bleiben unter 8 MiB. Testdaten, Definitionskopie und Prüfverlauf
zählen gemeinsam zur Durchlaufgröße. Referenzen erfordern vollständig nachgewiesene
Schritte und sind bis zur ausdrücklichen Aufhebung gegen Löschen geschützt.
Vorgangsübernahme kopiert nur freigegebene Inhalte und lokale Schemata in neue Tests.
Bestehende Pakete und Abläufe behalten bei der Formatübernahme ihre Originale bis
zur ausdrücklichen Löschung. Stabile IDs aus Quellformat und ursprünglicher ID
verhindern doppelte Einträge beim erneuten Öffnen. Eine Kopie entsteht ausdrücklich.
Versand und Testwerkzeuge verwenden denselben Sammlungsadapter.

Automatische Vorbereitungssicherungen liegen getrennt unter
`test-library/preparations-v1/<environment>`. Je Umgebung gibt es einen begrenzten,
DPAPI-geschützten Arbeitsstand, der auch unfertiges JSON/XML enthalten darf.
Die vollständige Definition wird vor Speichern oder Teststart erneut geprüft.
Eine Warteschlange sichert Änderungen nach kurzer Pause und beim normalen Beenden.
Dateiimporte müssen vorher abgeschlossen sein. Eine unlesbare frühere Sicherung
wird bis zum erfolgreichen Lesen oder ausdrücklichen Verwerfen nicht überschrieben.
Die Wiederherstellung öffnet nur bearbeitbare Daten und startet keine Aktion.

Testserien speichern eine eigene Definitionskopie und bis zu 32 Kombinationen aus
Datensatz und API. Sie verknüpfen getrennte Durchläufe, übernehmen deren aktuellen
Prüfstand und benötigen zum Start jeder Kombination eine ausdrückliche Aktion.
Native Speicherung prüft Definition, Umgebung, Datensatz und Profilzuordnung der
verknüpften Durchläufe. Fehlende oder abweichende Durchläufe liefern keinen Erfolg.
Das Entfernen einer Serie entfernt keine Durchläufe und keine geschützten Referenzen.

Profil-Arbeitsdaten (Destination-Vorlagen, Merkliste und lokale Konfigurationshistorie) liegen getrennt von Credentials und Vorgängen in Windows-DPAPI-Dateien. Zusätzliche Entropie bindet Profil, Umgebung und API. Nur native Engine-Ergebnisse erzeugen Historieneinträge. Vor dem Schreiben wird ein ungewisser Zustand dauerhaft hinterlegt; ein Fehler der abschließenden Speicherung darf einen tatsächlichen Servererfolg nicht als fehlgeschlagenen Versand umdeuten. Profilentfernung löscht auch diese Arbeitsdaten. Profil-Backups enthalten sie nicht.

Der optionale Scanner ist im gemeinsamen Java-Host hinter beiden SDK-Adaptern angesiedelt. Er prüft nach Kryptografie und vor Inhaltsfreigabe; ausgehende unveränderliche Vorbereitungen werden vor dem tatsächlichen SDK-Schreibaufruf erneut geprüft. Jeder Scan hat ein Gesamtzeitlimit einschließlich DNS, Verbindung, Schreiben und Antwort. Nur ClamAV `stream: OK` oder ICAP 204 ohne Infektionsmeldung gelten als unauffällig. Eigene Gegenstellen werden nativ bestätigt und gelten für die Verbindung. Kein Callback-Dienst oder FBForge-Relay.

Die native Schicht verwaltet optional einen lokalen ClamAV als Benutzerprozess. Festes Manifest, offizieller Talos-Schlüssel, Archiv-/Dateihashes und signierte CVD-Dateien bilden die Vertrauensgrenze. ZIP-Importe sind begrenzt; Engine und Datenbanken werden vor atomarer Übernahme geprüft. Online-Installationen verwenden je Versuch einen eigenen Arbeitsbereich, damit ein abgebrochener oder unter Windows gesperrter Download den nächsten Versuch nicht blockiert. Zurückgebliebene Download-Arbeitsbereiche werden beim Öffnen der Laufzeit bereinigt. Unterbrochene Verzeichnis-/Einstellungstausche stellen beim nächsten Start den vorhandenen Vorgänger wieder her; eigene temporäre Scannerdateien werden beim Stoppen und nächsten Start bereinigt. Windows-Jobobjekte beenden ausschließlich eigene Prozesse auch bei erzwungenem App-Ende; Bereitschaft erfordert einen dem Prozess zugeordneten Loopback-Port. Der Renderer liefert weder Programmpfade noch Download-URLs. Updates der Signaturen sind gesondert zustimmungspflichtig. Ihr Beschäftigt-Zustand ist vom Java-Nachrichtenstrom getrennt. Globale Statusanzeige und Abbruch bleiben beim Seitenwechsel erreichbar. Statusabfragen warten nicht auf laufende Komponentenupdates und melden einen beschäftigten Scanner niemals als ausgeschaltet. Komponente und Einstellungen liegen unter dem lokalen App-Datenverzeichnis, unabhängig von FIT-Connect-Profilen.

Anlagenfunde entfernen ausschließlich betroffene Bytes aus dem freigegebenen Snapshot. `scan-report` speichert begrenzte Kennungen und Namen im geschützten lokalen Vorgang. Ein vollständiger Originalexport ist dann nativ gesperrt. Hostseitig gebundene Problem-IDs bleiben mit den ursprünglichen Authentifizierungstags verbunden und werden im signierten Accept als `problems` gemeldet. Dafür ist eine zusätzliche native Bestätigung nötig; Sammelannahme bleibt gesperrt. Metadaten-/Fachdatenfunde und unvollständige Scans geben keinen Annahmenachweis frei.

## Zusätzliche HTTPS-Vertrauensanker

Netzwerkeinstellungen speichern bis zu acht ausdrücklich importierte öffentliche
CA-Zertifikate zusammen mit den Proxy-Einstellungen geschützt für das Windows-Konto.
Die native Grenze prüft DER, CA- und Signaturverwendung, Größe, Gültigkeit und
eindeutige SHA-256-Fingerabdrücke. Nur aktive zusätzliche CAs erweitern Transportvertrauen.

Reqwest ergänzt seine normalen Vertrauensanker. Ein nativ erzeugtes öffentliches
PEM mit Fingerabdruckliste erreicht den eigenen Java-Prozess. Dieser verbindet
seine normalen Aussteller mit den zusätzlichen CAs und initialisiert vor den
isolierten SDKs den gemeinsamen TLS-Kontext und einen temporären PKCS12-Speicher.
FreshClam erhält ein eigenes öffentliches Bundle aus den paketierten JDK-CAs und
aktiven Ergänzungen. Temporäre Dateien bleiben an den jeweiligen Prozess gebunden.
Hostnamenprüfung, V-PKI-Nachrichtenzertifikate und die separate Signaturprüfung
von Virendatenbanken werden dadurch nicht aufgehoben.

Manuelle Proxy-Zugangsdaten bleiben an den ausdrücklich konfigurierten Proxy
gebunden. Native Übergabe und Java-Konfiguration geben sie im System- und
Direktmodus nicht weiter. Eine vom Betriebssystem gewählte Route erhält keine
Zugangsdaten einer früheren manuellen Route. Die getrennte Authentifizierungsprüfung
gilt auch für vorhandene Authenticator-Instanzen und die SDK-/Schema-Verbindungen.
