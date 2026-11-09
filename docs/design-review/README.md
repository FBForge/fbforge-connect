# Abnahmestände

## 0.4.0 in Vorbereitung

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

| Prüfung | Tatsächlich geprüfter Umfang |
| --- | --- |
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

| Abschließende Prüfung | Tatsächlich geprüfter Umfang |
| --- | --- |
| [Checks 41531392702](https://github.com/FBForge/fbforge-connect/actions/runs/41531392702) | `4d5f4b4`, Node, Browser, Java, native Windows-Tests und Coverage-Grenzen |
| [Windows 41531392037](https://github.com/FBForge/fbforge-connect/actions/runs/41531392037) | `4d5f4b4`, normales und vollständiges Offline-Setup, Upgrade von signiertem 0.2.0, Profilerhalt, NVDA, echte ClamAV-Prüfung mit sauberer Datei und EICAR sowie lesende TEST-Anmeldung |
| [CodeQL 41541239704](https://github.com/FBForge/fbforge-connect/actions/runs/41541239704) | `4d5f4b4`, Actions, Java/Kotlin, JavaScript/TypeScript, Python und Rust |
| [Signierung 41542584783](https://github.com/FBForge/fbforge-connect/actions/runs/41542584783) | `4d5f4b4`, Authenticode mit Zeitstempeln, Updater-Signatur und unabhängige Installation beider signierter Pakete |

Frühere Live-Abnahmen bleiben getrennt zugeordnet:

| Prüfung | Tatsächlich geprüfter Umfang |
| --- | --- |
| [Checks 41488660955](https://github.com/FBForge/fbforge-connect/actions/runs/41488660955) | `530b8be`, Node, Browser, Java und native Verträge vor den abschließenden Bedienkorrekturen |
| [Scanner 41488699487](https://github.com/FBForge/fbforge-connect/actions/runs/41488699487) | `530b8be`, Windows-Paketbau, offizielle Signaturen, drei Einrichtungen mit sauberem Scan, EICAR und Prozessende |
| [Windows 41448697391](https://github.com/FBForge/fbforge-connect/actions/runs/41448697391) | `426960a`, normale und Offline-Installation, Upgrade von 0.2.0, Profilerhalt und NVDA |
| [Installierte TEST-Oberfläche 41455480784](https://github.com/FBForge/fbforge-connect/actions/runs/41455480784) | `8f1153b`, v2/v3-Nachrichtenfluss, Downloads, Profile, lokale Scanner-Einrichtung, Abbruch und erneuter Versuch |
| [SDK-Matrix 41440500168](https://github.com/FBForge/fbforge-connect/actions/runs/41440500168) | `18587c5`, v2/v3, JSON/XML, Prozessnachrichten, Antworten, Absenderbeschränkung und Schlüsselwechsel |

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

| Umfang | Zeilenabdeckung |
| --- | --- |
| Isolierte Verträge unter Linux am früheren Referenzstand `426960a` | 69,08 % |
| Isolierte Verträge unter Windows | 79,77 % |
| Vollständige native Windows-Tests | 38,04 % |

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
