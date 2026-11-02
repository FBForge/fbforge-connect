# Abnahmestand 0.3.0

Stand: 2. November 2026. Die Entwicklung liegt auf `release/0.3.0`, einschließlich
der ursprünglich für 0.2.1 vorgesehenen Korrekturen. Die Veröffentlichung und die
Signierung des endgültigen Pakets stehen noch aus.

## Abschließende Bedienkorrekturen

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

## Vorliegende automatisierte Nachweise

Die Links nennen den tatsächlich geprüften Quellstand. Frühere erfolgreiche Läufe
sind keine Prüfung späterer Produktänderungen. Vor der Signierung muss der endgültige
Main-Commit erneut die normale CI und vollständige Windows-Validierung bestehen.

| Prüfung | Tatsächlich geprüfter Umfang |
| --- | --- |
| [Checks 41488660955](https://github.com/FBForge/fbforge-connect/actions/runs/41488660955) | `530b8be`, Node, Browser, Java und native Verträge vor den abschließenden Bedienkorrekturen |
| [Scanner 41488699487](https://github.com/FBForge/fbforge-connect/actions/runs/41488699487) | `530b8be`, Windows-Paketbau, offizielle Signaturen, drei Einrichtungen mit sauberem Scan, EICAR und Prozessende |
| [Windows 41448697391](https://github.com/FBForge/fbforge-connect/actions/runs/41448697391) | `426960a`, normale und Offline-Installation, Upgrade von 0.2.0, Profilerhalt und NVDA |
| [Installierte TEST-Oberfläche 41455480784](https://github.com/FBForge/fbforge-connect/actions/runs/41455480784) | `8f1153b`, v2/v3-Nachrichtenfluss, Downloads, Profile, lokale Scanner-Einrichtung, Abbruch und erneuter Versuch |
| [SDK-Matrix 41440500168](https://github.com/FBForge/fbforge-connect/actions/runs/41440500168) | `18587c5`, v2/v3, JSON/XML, Prozessnachrichten, Antworten, Absenderbeschränkung und Schlüsselwechsel |

Die spätere Historienkonsolidierung hat den Produktbaum von `8f1153b` unverändert
übernommen. Der danach korrigierte GPG-Paketbau wurde separat unter Windows geprüft.
Die aktuellen Bedienkorrekturen benötigen ihre eigenen erneuten Prüfungen.

## Testabdeckung und Grenzen

Node/c8, Chromium/V8, JaCoCo und llvm-cov messen getrennte Testumfänge. Fehlende
Frontend-Module zählen als ungetestet. Die nativen Produktberichte schließen
ausschließlich über einen Rust-Syntaxbaum erkannte Testbereiche aus. Es gibt keine
gemeinsame Gesamtquote und keine Behauptung von 95 oder 100 Prozent Gesamtdeckung.

Gemessene native Produktzeilen am Referenzstand `426960a`:

| Umfang | Zeilenabdeckung |
| --- | --- |
| Isolierte Verträge unter Linux | 69,08 % |
| Isolierte Verträge unter Windows | 79,66 % |
| Vollständige native Windows-Tests | 37,94 % |

Gemeinsame Ablaufmodule für Schreibfreigaben, Schlüsselarchive, Exportbindung,
Scanner-Downloads und Updates erreichen dort 97,30 bis 100 Prozent. Die vollständige
Quote zeigt weitere Testlücken an den Tauri-I/O-Adaptern. Installierte UI-Tests
fließen ohne Instrumentierung nicht in diese Messung ein.

Befehle, Berichtspfade und Mindestwerte stehen in
[BUILDING.md](../../BUILDING.md#testabdeckung-messen). Aktuelle CI-Artefakte enthalten
die Messungen ihres jeweiligen Quellstands.

## Freigabe und Veröffentlichung

STAGE und PROD sind auf ausdrücklichen Wunsch nicht Teil der Live-Abnahme.
TEST-Nachweise gelten nicht automatisch für andere Umgebungen oder Berechtigungen.
Frühere serverseitige v2-Anlagenfehler führten korrekt zu einem ungewissen Zustand.
Die separat ausgeführte SDK-Matrix und installierte TEST-Abnahme sind anschließend
bestanden. Daraus folgt keine allgemeine Verfügbarkeitszusage des Dienstes.

Die erste Version mit Updater wird manuell installiert. Das Upgrade von 0.2.0 prüft
den Profilerhalt, keinen integrierten Updater. Die endgültigen signierten
Installer, `latest.json`, Versionsbindung und unabhängige Paketprüfung gehören zum
[Release-Ablauf](../../RELEASING.md). Veröffentlichung und Signierung bleiben beim
Eigentümer. Produktänderungen nach der Abnahme benötigen eine erneute Validierung.

Die [0.3-Anleitung](https://fbforge.de/connect/hilfe/0.3/start) bleibt bis zum
Software-Release als Vorbereitung gekennzeichnet. Ältere veröffentlichte Anleitungen
und funktionierende Downloads erhalten. Überholte Actions-Läufe erst entfernen,
wenn ihre Nachweise und Artefakte durch erfolgreiche aktuelle Prüfungen ersetzt sind.
