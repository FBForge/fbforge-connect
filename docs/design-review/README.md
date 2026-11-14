# Abnahmestände

## 0.4.0 in Vorbereitung

### SSP-Kanäle und Nachprüfung – 14. November 2026

Die Antwortkanäle folgen dem SSP: Postweg als automatischer Rückfall sowie
BundID, FIT-Connect, ELSTER, E-Mail, DE-Mail und FINK als getrennte Auswahl.
PGP steht direkt bei E-Mail. Datenaustauschstandards gehören zu FIT-Connect.
Die tatsächliche Oberfläche wurde bei 1440 px hell und 520 px dunkel angesehen.
Die Anleitung enthält die neue Aufnahme. Die gezielten Kanaltests prüfen auch
390 px, die Reihenfolge und den Weg in die Änderungsvorschau.

Ein vollständiger App-Test reproduziert den beim Profilwechsel übersprungenen
Abruf gespeicherter Antwortschemas. Die Bibliothek lädt nun nach dem Ende des
Verbindungsaufbaus. Ein fehlgeschlagener Abruf wird nicht automatisch wiederholt.
Destination-Fehler zeigen aufklappbar den begrenzten Fehlercode, HTTP-Status und
Problemtyp. Die Profilhistorie versteht diese Angaben und bisherige Einträge.

Die [Live-Wiederholung](https://github.com/FBForge/fbforge-connect/actions/runs/43539579641)
bestand 12 von 16 UI-Gruppen. Sammelverarbeitung und Testserie scheiterten beim
Anlagen-Upload an HTTP 500 mit ungewissem Versand. Es gab keine automatische
Wiederholung. Der Bibliotheksfehler ist lokal reproduziert und korrigiert.
Für den Callback-Test wurde die nicht auflösbare `.invalid`-Adresse durch einen
Pfad auf der eigenen Domain ersetzt, entsprechend der Destination-API-Dokumentation.
Die unbenutzte Test-Destination empfängt dabei keine Einreichungen.

Diese Änderungen betreffen das Produkt. Der nachfolgend dokumentierte Installer
aus `2382a883` enthält sie noch nicht und ist kein Nachweis für diesen Stand.
Eine neue Windows-Validierung und reale UI-Wiederholung sind erforderlich.
Signierung und Veröffentlichung bleiben bis zur Betreiberabnahme aus.

### Testwerkzeuge, Destination-Verwaltung und Formularansicht – 13. November 2026

Die Nachprüfung folgt den gemeldeten Screenshots: Profile beider APIs werden in
der Testvorbereitung aufgelöst, die Nachrichtenauswahl steht unter der
Antwortoption und ein geöffneter Test lässt sich mit gespeichertem Fortschritt
schließen. Mehrfachsicherungen, gruppenweise Auswahl, verständliche Rechtehinweise
und die dokumentierten Antwortkanäle ergänzen die Destination-Verwaltung.
Generierte Antwortschemas bleiben im geschützten Profil und werden anhand ihrer
URI ohne erneuten Dateiimport verwendet. Empfang und Vorgänge teilen die
überarbeitete Formularansicht. Die Originaldateien bleiben unverändert.

Die Hilfe enthält 63 aktuelle Aufnahmen mit fiktiven Daten. Testvorbereitung,
Formularansicht, Mehrfachauswahl, Sicherung und Profilbibliothek wurden visuell
geprüft und relevante Aufnahmen im Chat gezeigt.

Der Windows-Kandidat aus Produktstand
`2382a88317b4ff0fa4b35cc07a0ade17ec0bbd93` besteht die
[Windows-Validierung](https://github.com/FBForge/fbforge-connect/actions/runs/43518780320):
Installation, Deinstallation mit Profilbestand, Upgrade von 0.3.0,
Offline-Installer, beide SDKs und lokaler ClamAV einschließlich EICAR.
Die Prüfung mit NVDA 2026.2 kontrolliert aufgezeichnete Sprachsequenzen und
Fokusführung; sie ersetzt keine Hörprüfung oder vollständige
Barrierefreiheitsabnahme. Die
[CI](https://github.com/FBForge/fbforge-connect/actions/runs/43529171144)
besteht mit 322 Browserfällen, 302 Java-Tests, 428 Node-Tests bei sechs
Windows-Ausnahmen unter Linux sowie den nativen Windows-Suiten.

Die [reale TEST-Abnahme](https://github.com/FBForge/fbforge-connect/actions/runs/43526184822)
besteht die native Austauschmatrix und 13 von 16 installierten UI-Funktionsgruppen.
Belegt sind v2/v3-Austausch, JSON/XML, zwei Prozessnachrichten im selben Vorgang
über einen Neustart, Antworten und signierte Bestätigungen, Absenderbeschränkung,
Schlüsselrotation und Proxytransport. In der Oberfläche bestehen außerdem
Sammelannahme mit signiertem Problem Statement bei Schemaabweichungen,
Originalexport ohne zusätzliche Export-JSON, Wiederverwendung des Exportordners,
Profilverwaltung, gespeicherter sechsstufiger Testablauf, Mehrfachsicherung,
gemeinsame Kontaktänderung und manuelle Destination-Anlage.

Drei Gruppen sind noch nicht vollständig abgenommen: Bearbeiten der
Schema-Bibliothek, die vier ausgeführten Testserien-Durchläufe und zusätzliche
Destination-Einstellungen. Die automatische Verwendung des gespeicherten
Antwortschemas beim echten Antwortaustausch ist bereits belegt. Der Serienlauf
traf nach einem Neustart auf einen noch startenden Scanner; der nachfolgende
Testtreiber wartet ausdrücklich auf dessen Bereitschaft. Die beiden weiteren
Fehler erhalten gezielte Zustandsdiagnosen. Bis zur erfolgreichen Wiederholung
gelten diese Gruppen als offen. Testtreiberänderungen verändern den validierten
Installer nicht. Signierung und Veröffentlichung erfolgen erst nach Abnahme
durch den Betreiber.

### Korrektur der Zustellpunkt-Sicherung und Navigation – 12. November 2026

Die erste Implementierung prüfte die Sicherungen isoliert und übersah die
Bereichsnavigation: Zwei Komponentenwurzeln verhinderten die Wirkung von
`v-show`. Die Sicherung blieb deshalb auch in anderen Bereichen sichtbar.
Ein gemeinsames Wurzelelement behebt den Fehler. Der Regressionstest scheitert
vor der Korrektur beim Wechsel zu Hilfe und besteht danach für alle elf anderen
Bereiche. Die tatsächliche vollständige App wird mit gespeicherter Verbindung,
Hell/Dunkel und verschiedenen Fensterbreiten geprüft. Screenshots zeigen diese
App einschließlich Navigation und oberer Leiste.

Die präzisierte Zustellpunkt-Sicherung enthält ausschließlich Konfiguration und
öffentliche Schlüssel aus der Destination API v3. JSON-Import und -Export brauchen
kein Passwort. Private Schlüssel und Zertifikatsimporte bleiben im Profil und
im bestehenden Anlageassistenten. Der private Importweg der ersten Umsetzung
ist entfernt. Lokale v1-Sicherungen werden beim Lesen ohne private Schlüsselkopien
neu geschützt gespeichert. Das betrifft keine Schlüssel im eigentlichen Profil.

Die obere Leiste zeigt Verbindung und Profil einzeilig. Auswahllisten, Verbindung
und Darstellungswahl besitzen dieselbe Höhe. Die gezielten Browserprüfungen
umfassen alle Bereiche, bestehenden Profilwechsel, öffentliche Sicherung,
Import/Export, Anlage, Bearbeitung und Löschbestätigung. Echte Windows-Installation,
Dateidialoge und die Migration werden durch die Windows-Prüfungen ergänzt und
bleiben von einer reinen Browserprüfung unterscheidbar. Die Windows-Abnahme
und Veröffentlichung sind weiterhin eigene Schritte.

### Konkrete SDK-Fehler beim Empfang – 11. November 2026

Empfang, Antworten und Event Logs behalten neben dem stabilen Fehlercode die
konkreten SDK-Gründe mit Prüfphase und Fehlertyp. SDK v2 liefert diese teilweise
als Validierungsprobleme oder ungültige Authentifizierungs-Tags, SDK v3 auch als
Prüfbericht. Diese Angaben werden vor der bisherigen Verkürzung erfasst und
durch Java-Protokoll, native Schreibfreigabe und Oberfläche weitergereicht.
Eine fehlgeschlagene Prüfung erteilt weiterhin keine Annahmefreigabe.

Die aufklappbaren technischen Angaben und das lokale Aufrufprotokoll zeigen
dieselben Meldungen. Sie lassen sich ausdrücklich kopieren. Der gewöhnliche
Supportbericht enthält weiterhin nur technische Codes. SDK-Texte bleiben lokal,
sind begrenzt und werden als Text dargestellt. Erkennbare Zugangsdaten und
Schlüsselmaterial werden entfernt. Die zwei neuen Aufnahmen verwenden fiktive
Fehler und ergänzen die 15 Hilfekapitel auf 56 Bilder.

Der vollständige Java-Lauf besteht mit 295 Tests. Nach den abschließenden
Änderungen an Textbegrenzung und Berichtsauswertung bestehen die sechs gezielten
SDK-Regressionen erneut. Sie verwenden beide echten SDK-Laufzeiten mit lokal
erzeugten verschlüsselten Nachrichten, einem nicht angebotenen Antwortkanal
und manipulierten signierten Event Logs. Der neu zusammengestellte Java-Kern
besteht zusätzlich den Pakettest mit beiden APIs.

Lokal bestehen 406 Node-Tests bei sechs Plattformausnahmen, 131 native Verträge
unter Linux und 22 betroffene Browserfälle. Die Browserprüfung umfasst beide
APIs, Hell/Dunkel, schmale Fenster, erneute Prüfung, Kopieren, Aufrufprotokoll,
Event-Log-Fehler und weiterhin erreichbare manuelle Ablehnung. Typprüfung, Lint,
Formatierung, Größenbudget und die Ausführung des Produktionsbundles bestehen.
Der vollständige Windows-GNU-Quellstand einschließlich Testcode lässt sich
prüfen. Diese Nachweise ersetzen keine ausgeführte Windows-Installation und
keinen erneuten Abruf der konkreten Kundeneinreichung. Signierung und
Veröffentlichung bleiben bis zur Abnahme offen.

### Abschließende Bedien- und Netzwerkprüfung – 11. November 2026

Der geprüfte Produktstand ist `0747b7f` auf `release/0.4.0`.

Versand und Testbereich verwenden dieselbe gespeicherte Sammlung. Übernahmen
haben stabile Kennungen, Kopien sind ausdrücklich gekennzeichnet. Testfälle,
erste Antworten und erwartete Anlagen lassen sich direkt bearbeiten.
Feldbedingungen können einen vollständigen Vergleich ergänzen. Der ausgewiesene
Prüfumfang enthält weiterhin alle übrigen Felder, Strukturen und Anlagen.
Unfertige Vorbereitungen werden je Umgebung geschützt gesichert und nur nach
ausdrücklicher Auswahl wiederhergestellt. Ein Lesefehler verhindert das
Überschreiben einer vorhandenen Sicherung.

Die laufenden Oberflächen wurden mit fiktiven Daten in hellen und dunklen,
schmalen und breiten Ansichten geprüft. Das aktive Profil, die gemeinsame
Sammlung, der Editor, die Nachweisauswahl und zusätzliche CA-Zertifikate sind
dabei sichtbar geprüft. Die 15 Hilfekapitel verwenden 54 aktuelle Aufnahmen.
37 davon wurden gegenüber dem vorherigen Stand ersetzt.

Lokal bestehen 404 Node-Tests bei sechs Plattformausnahmen und 128 native
Verträge. Der Java-Gesamtlauf besteht mit 283 Tests. Ergänzend bestehen vier
TLS-Vertrauenstests und zuletzt neun gezielte Netzwerk-/Proxytests einschließlich
der beiden neuen Tests zur Bindung manueller Zugangsdaten. Die vollständige
Chromium-Suite wurde ausgeführt. Nach der Korrektur zweier Testannahmen und
erneuter Prüfung eines Zeitlimits bestehen insgesamt 292 Fälle. Ein Fall mit
einer nicht vorhandenen externen Schema-Fixture bleibt übersprungen. Die
betroffenen 20 Browserfälle bestehen gemeinsam im abschließenden Lauf.

Typprüfung, Lint, beide Formatter, Dateigrößen- und Lizenzprüfung sowie der
Produktionsbundle mit Größenbudget bestehen. Der Windows-GNU-Quellstand lässt
sich vollständig prüfen. Die neu zusammengestellte Java-Laufzeit besteht den
Pakettest mit beiden SDK-Versionen. Diese Nachweise ersetzen weder eine
installierte Windows-Abnahme mit DPAPI noch echte FIT-Connect-TEST-Verbindungen
oder eine Prüfung des Firmenproxies vor Ort. Ein neuer Installer, Signierung
und Veröffentlichung bleiben bis zur Abnahme offen.

### Vereinfachte Testwerkzeuge – 9. November 2026

Ein gemeinsamer Bereich „Tests“ ersetzt die getrennten Einstiege für Pakete,
Abläufe und Integrationstests. Vorlagen, bestehende Sammlungen und Ergebnisse
stehen in derselben Übersicht. Die Vorbereitung bleibt beim Wechsel zur
Übersicht erhalten. Ein anderer Test ersetzt ungespeicherte Änderungen erst
nach Bestätigung. Testserien öffnen eine eigene Ansicht. Frühere Durchläufe
behalten ihren bisherigen Prüfer und ihren gespeicherten Fortschritt.

Die laufende Oberfläche wurde mit fiktiven nativen Antworten visuell geprüft,
einschließlich Hell-/Dunkelmodus, schmaler Fenster, Tastaturbedienung und
vergrößerter Schrift. Die Anleitung beschreibt denselben Ablauf und enthält
15 Kapitel mit 54 referenzierten Bildern. Das gemeinsame Speichermodell und
die weiterhin getrennten Formate sind in [ARCHITECTURE.md](../../ARCHITECTURE.md)
beschrieben. Diese Browserprüfung ersetzt keine native Windows-Abnahme des
geänderten Produktstands.

Lokal bestehen 391 Node-Tests, sechs Plattformfälle werden übersprungen. Die
vollständige Chromium-Suite besteht mit 279 Fällen. Zwei zusätzliche gezielte
Browserfälle prüfen die aktualisierten Navigationstreiber der nativen Abnahme,
einschließlich alter Sammlungen und einer mehrdeutigen Nachweisauswahl.
Build, Bundlebudget und Ausführung des Produktionsbundles, Typprüfung, Lint,
Formatierung, Dateigrößenprüfung und Lizenzprüfung bestehen. Die vollständige
installierte Live-Abnahme wurde für diese Oberflächenänderung nicht erneut
ausgeführt. Dafür ist ein neuer Windows-Kandidat erforderlich.

### Frühere Funktionsprüfung

Der folgende Nachweis bezieht sich auf `46991b21b4d497ce66fc8ea4e3d875318bf1a4d9`.
Version 0.4.0 ist noch nicht veröffentlicht. Die folgenden Prüfungen verwenden
fiktive Daten und ersetzen keine installierte Windows- oder FIT-Connect-TEST-Abnahme.

| Prüfung                                                                                   | Tatsächlich geprüfter Umfang                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Checks 42304998045](https://github.com/FBForge/fbforge-connect/actions/runs/42304998045) | `46991b2`, Frontend, Java, native Windows-Verträge und vollständige native Windows-Tests einschließlich ihrer Abdeckungsgrenzen. Neue Serien werden mit Windows-DPAPI gespeichert und mit unveränderten Durchlaufzuordnungen erneut geöffnet. |

Lokal bestehen 391 Node-Tests, sechs Plattformfälle werden übersprungen. Alle
272 Chromium-Fälle sowie 122 native Verträge unter Linux bestehen. Die neuen
Oberflächen werden in hell/dunkel, schmalen Fenstern, mit vergrößerter Schrift und
automatischen Barrierefreiheitsprüfungen geprüft. Produktions-Build, Bundlebudget,
Typprüfung, Formatierung und Lizenzprüfung bestehen. Die 15 Hilfekapitel und 55 Bilder
lassen sich gemeinsam für Website und Wiki exportieren.

Zusätzlich geprüft sind Serien aus Datensätzen und API-Versionen, nicht anwendbare
v2-Kombinationen, falsche oder fehlende Durchlaufverknüpfungen, getrennte Reply-IDs,
mehrere Antworten nach einer Annahme und persistierte Vergleichsdetails.
Abweichungen bleiben auch nach erfolgreicher Wiederholung im Prüfverlauf erreichbar.
Lange Unicode-Werte bleiben beim Kürzen gültiger JSON-Text. Feldwerte werden nur
nach ausdrücklicher Auswahl exportiert. Bestehende Version-2-Dokumente behalten ihre Form.

Die lokale Node-Messung erreicht 57,93 % Produktzeilen und 85,95 % Zweige,
die Browsermessung 82,87 % Produktzeilen und 71,23 % Zweige. Fehlende Module zählen
als ungetestet. Die Umfänge werden nicht zu einer Gesamtquote verrechnet.
Windows- und Java-Messungen stehen in den zugeordneten CI-Artefakten.

Vor der Veröffentlichung fehlen noch die installierte Windows-Abnahme der neuen
Integrationstests mit echten TEST-Zugängen, das endgültige signierte Paket samt
Updater-Abnahme und die Veröffentlichung der 0.4-Anleitung. Dazu gehören auch
Serien und frühere Abweichungen nach einem App-Neustart sowie der vollständige
fachliche Dialog mit mehreren Antworten. Der Ablauf steht in
[RELEASING.md](../../RELEASING.md). Signierung und Veröffentlichung erfolgen erst nach der Abnahme.

## Abnahmestand 0.3.0

Version 0.3.0 enthält auch die ursprünglich für 0.2.1 vorgesehenen Korrekturen.
Der veröffentlichte Quellstand ist `4d5f4b47a0756879ca8ab59add067c2e14a6f1b0`.
Spätere reine Dokumentationsänderungen verändern weder diesen Tag noch die Pakete.

### Abschließende Bedienkorrekturen

- Empfangsfilter richten Laden, Altersauswahl und Sortierung gemeinsam aus.
  Bei schmalen Fenstern stehen die Bedienelemente untereinander.
- Der geprüfte lokale Empfangskontext bestimmt vorab, ob ein Antwortkanal besteht.
  Nur dann erscheint „Antwort verfassen“. Fehlende Angebote bleiben ein Hinweis,
  tatsächliche Prüfungsfehler bieten eine erneute Prüfung. Empfang und Ablehnung
  bleiben bedienbar. Antworten im geöffneten Case bleiben nach Annahme möglich.
- „Einstellungen“ enthält Netzwerk, Proxy und Updates vor den Programm- und
  Lizenzinformationen. Navigation, Hinweise, Hilfe und Testtreiber verwenden den
  gleichen Namen.
- Die Desktop-App unterdrückt das Browser-Kontextmenü. Eingaben und übliche
  Tastenkürzel zum Kopieren und Einfügen bleiben verfügbar.
- Der ClamAV-Paketbau benötigt beim öffentlichen GPG-Schlüsselimport und der
  Signaturprüfung keinen Agenten. Hash-, Signatur- und Fingerprintprüfung bleiben
  aktiv. Ein echter GPG-Test reproduziert den ursprünglichen Fehler.

Gezielte Browserregressionen prüfen v2/v3, fehlende und fehlerhafte Antwortkanäle,
erneute Prüfung, Kontextwechsel, Antworten nach Annahme, Tastaturbedienung,
Hell-/Dunkelmodus sowie Filterausrichtung und schmale Fenster. Aktuelle Bilder mit
fiktiven Daten liegen unter `docs/guide/images/`.

### Vorliegende automatisierte Nachweise

Die Links nennen den tatsächlich geprüften Quellstand. Frühere erfolgreiche Läufe
sind keine Prüfung späterer Produktänderungen. Main wurde auf denselben vollständigen
Commit wie der abgenommene Release-Branch übernommen. Dadurch bleibt die vorhandene
Windows-Validierung gültig. Ein neuer Merge-, Rebase- oder Produktcommit wäre separat zu prüfen.

| Abschließende Prüfung                                                                         | Tatsächlich geprüfter Umfang                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Checks 41531392702](https://github.com/FBForge/fbforge-connect/actions/runs/41531392702)     | `4d5f4b4`, Node, Browser, Java, native Windows-Tests und Coverage-Grenzen                                                                                                             |
| [Windows 41531392037](https://github.com/FBForge/fbforge-connect/actions/runs/41531392037)    | `4d5f4b4`, normales und vollständiges Offline-Setup, Upgrade von signiertem 0.2.0, Profilerhalt, NVDA, echte ClamAV-Prüfung mit sauberer Datei und EICAR sowie lesende TEST-Anmeldung |
| [CodeQL 41541239704](https://github.com/FBForge/fbforge-connect/actions/runs/41541239704)     | `4d5f4b4`, Actions, Java/Kotlin, JavaScript/TypeScript, Python und Rust                                                                                                               |
| [Signierung 41542584783](https://github.com/FBForge/fbforge-connect/actions/runs/41542584783) | `4d5f4b4`, Authenticode mit Zeitstempeln, Updater-Signatur und unabhängige Installation beider signierter Pakete                                                                      |

Frühere Live-Abnahmen bleiben getrennt zugeordnet:

| Prüfung                                                                                                         | Tatsächlich geprüfter Umfang                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [Checks 41488660955](https://github.com/FBForge/fbforge-connect/actions/runs/41488660955)                       | `530b8be`, Node, Browser, Java und native Verträge vor den abschließenden Bedienkorrekturen                     |
| [Scanner 41488699487](https://github.com/FBForge/fbforge-connect/actions/runs/41488699487)                      | `530b8be`, Windows-Paketbau, offizielle Signaturen, drei Einrichtungen mit sauberem Scan, EICAR und Prozessende |
| [Windows 41448697391](https://github.com/FBForge/fbforge-connect/actions/runs/41448697391)                      | `426960a`, normale und Offline-Installation, Upgrade von 0.2.0, Profilerhalt und NVDA                           |
| [Installierte TEST-Oberfläche 41455480784](https://github.com/FBForge/fbforge-connect/actions/runs/41455480784) | `8f1153b`, v2/v3-Nachrichtenfluss, Downloads, Profile, lokale Scanner-Einrichtung, Abbruch und erneuter Versuch |
| [SDK-Matrix 41440500168](https://github.com/FBForge/fbforge-connect/actions/runs/41440500168)                   | `18587c5`, v2/v3, JSON/XML, Prozessnachrichten, Antworten, Absenderbeschränkung und Schlüsselwechsel            |

Die spätere Historienkonsolidierung hat den Produktbaum von `8f1153b` unverändert
übernommen. Der danach korrigierte GPG-Paketbau wurde separat unter Windows geprüft.
Die abschließenden Bedienkorrekturen und Sicherheitskorrekturen sind in den
oben genannten Prüfungen für `4d5f4b4` enthalten.

### Testabdeckung und Grenzen

Node/c8, Chromium/V8, JaCoCo und llvm-cov messen getrennte Testumfänge. Fehlende
Frontend-Module zählen als ungetestet. Die nativen Produktberichte schließen
ausschließlich über einen Rust-Syntaxbaum erkannte Testbereiche aus. Es gibt keine
gemeinsame Gesamtquote und keine Behauptung von 95 oder 100 Prozent Gesamtdeckung.

Gemessene native Produktzeilen am Release-Stand `4d5f4b4`:

| Umfang                                                             | Zeilenabdeckung |
| ------------------------------------------------------------------ | --------------- |
| Isolierte Verträge unter Linux am früheren Referenzstand `426960a` | 69,08 %         |
| Isolierte Verträge unter Windows                                   | 79,77 %         |
| Vollständige native Windows-Tests                                  | 38,04 %         |

Node erreicht 56,56 % Produktzeilen, der Browser 83,22 % und Java 83,52 %.
Die Werte stammen aus Checks `41531392702` und sind nicht zu einer Gesamtquote addierbar.

Am früheren Referenzstand `426960a` erreichten gemeinsame Ablaufmodule für
Schreibfreigaben, Schlüsselarchive, Exportbindung, Scanner-Downloads und Updates
97,30 bis 100 Prozent. Die vollständige
Quote zeigt weitere Testlücken an den Tauri-I/O-Adaptern. Installierte UI-Tests
fließen ohne Instrumentierung nicht in diese Messung ein.

Befehle, Berichtspfade und Mindestwerte stehen in
[BUILDING.md](../../BUILDING.md#testabdeckung-messen). Aktuelle CI-Artefakte enthalten
die Messungen ihres jeweiligen Quellstands.

### Sicherheitsprüfung

Die zusätzliche manuelle Prüfung am früheren Stand `6e390a4` blieb teilweise
unvollständig. Sie ist keine vollständige Sicherheitsfreigabe. Die lokal
reproduzierte Weitergabe von Proxy-Anmeldedaten wurde in `4d5f4b4` behoben und
mit beiden SDK-Laufzeiten geprüft. Zusätzlich begrenzen eine lineare
XML-Geschwisterindizierung und eine Rückschrittsperre für alle drei
ClamAV-Datenbanken die untersuchten Risiken. Die abschließenden CodeQL-Prüfungen
sind erfolgreich. Weder diese Prüfungen noch automatisierte Tests garantieren
Fehlerfreiheit. Sicherheitsmeldungen folgen [SECURITY.md](../../SECURITY.md).

### Freigabe und Veröffentlichung

STAGE und PROD sind auf ausdrücklichen Wunsch nicht Teil der Live-Abnahme.
TEST-Nachweise gelten nicht automatisch für andere Umgebungen oder Berechtigungen.
Frühere serverseitige v2-Anlagenfehler führten korrekt zu einem ungewissen Zustand.
Die separat ausgeführte SDK-Matrix und installierte TEST-Abnahme sind anschließend
bestanden. Daraus folgt keine allgemeine Verfügbarkeitszusage des Dienstes.

Die erste Version mit Updater wird manuell installiert. Das Upgrade von 0.2.0 prüft
den Profilerhalt, keinen integrierten Updater. Die endgültigen signierten
Installer, `latest.json`, Versionsbindung und unabhängige Paketprüfung gehören zum
[Release-Ablauf](../../RELEASING.md). Der beauftragte Release-Prozess veröffentlicht ausschließlich die unabhängig
geprüften Pakete. Produktänderungen nach der Abnahme benötigen eine erneute Validierung.

Die [0.3-Anleitung](https://fbforge.de/connect/hilfe/0.3/start) ist veröffentlicht.
Ältere veröffentlichte Anleitungen
und funktionierende Downloads erhalten. Überholte Actions-Läufe erst entfernen,
wenn ihre Nachweise und Artefakte durch erfolgreiche aktuelle Prüfungen ersetzt sind.
