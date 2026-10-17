# FIT-Connect Test-Client

Der **FIT-Connect Test-Client** ist eine Desktop-Anwendung für Integrationstests mit FIT-Connect. Entwickler und Integratoren können damit Onlinedienste und Fachverfahren simulieren und Einreichungen über API v2 und v3 austauschen.

Die Anwendung arbeitet ausschließlich mit der FIT-Connect-Testumgebung. Sie ist ein unabhängiges Projekt und kein offizielles Produkt von FITKO.

## Funktionen

- Einreichungen mit Fachdaten und Anlagen über API v2 und v3 versenden, einschließlich Prozessadressierung bei v3.
- Leistungen und Fachdaten-Schemata aus dem Empfängerzustellpunkt auswählen und fiktive Beispieldaten erzeugen.
- Verfügbare Einreichungen eines Zustellpunkts auflisten, abrufen und lokal entschlüsseln.
- Einreichungen mit den FIT-Connect-SDKs technisch prüfen und anschließend annehmen oder ablehnen.
- JSON-/XML-Fachdaten nach dem Entschlüsseln als gegliederte, durchsuchbare Formularansicht lesen; Originalfelder, Pfade und XML-Namensräume nachvollziehen. Anlagen separat ansehen oder herunterladen. Vor dem Versand und beim Verfassen einer Antwort dieselbe lokale Vorschau nutzen. JSON zusätzlich als Baum durchsuchen und Originalquelltext lesen.
- Zustellpunkte und registrierte Testschlüssel abfragen, private Testschlüssel lokal laden.
- Event Logs einer Einreichung verifizieren, Ereignisse durchsuchen und ihre JSON-Daten anzeigen.
- Eigene Zustellpunkte über die Destination API laden. Über v3 Name, Kontakt, Metadatenversionen und zulässige Aktiv-/Inaktiv-Wechsel einzeln oder für bis zu zehn Zustellpunkte mit Vorschau bearbeiten.
- Beim Versand einen FIT-Connect-Antwortkanal mit eigenem Antwortschema und sitzungsgebundenem Schlüssel anbieten. Verfügbare Antworten (Replies) und lokale Antwortkanäle auflisten. Replies mit dem zugehörigen temporären Schlüssel entschlüsseln, technisch prüfen, anzeigen und herunterladen.
- Auf geprüfte Einreichungen mit verschlüsselten Fachdaten und Anlagen antworten, bei v3 auch als Prozessnachricht. Der Versand erfordert eine eigene Bestätigung.

## Entwicklungsstand

Die Anwendung wird für eine erste Alpha vorbereitet. Automatisierte Tests verwenden simulierte API-Antworten. Ein erster Versand über API v2 wurde erfolgreich gegen TEST erprobt. Im Stand `0.1.0-dev.2` wurden eine zusätzliche V3-Berechtigungsprüfung und die TEST-Ausstellerzuordnung im Event Log korrigiert. Automatisierte Roundtrip-Tests prüfen Versand, Empfang und Entschlüsselung einschließlich Anlagen mit beiden SDKs. Der erneute Live-Test von V3, Empfang und Event Log sowie die Windows-Installation stehen noch aus; siehe [Alpha-Testplan](ALPHA_TESTPLAN.md).

Vorgangsübergreifende Suche, Empfangsbestätigungen für Replies und interaktive BPMN-Prozessdarstellungen sind in Arbeit beziehungsweise geplant. Antwortschlüssel bleiben nur in der Sitzung verfügbar, in der das Antwortangebot versendet wurde.

Beim Empfang wird die Schema-URI aus den entschlüsselten Metadaten gelesen. Nach Bestätigung können öffentliche HTTPS-Schemata einschließlich ihrer JSON-Referenzen und XRepository-XSD-Archive geladen werden. Die Abrufe enthalten keine FIT-Connect-Zugangsdaten oder Einreichungsinhalte. JSON-Schema- und XSD-Prüfung erfolgen lokal. Alternativ können lokale JSON-Schemata mit passender `$id` bereitgestellt werden. Abrufe, Dateigrößen und Archivverarbeitung sind begrenzt. Erzeugte Beispieldaten sind Entwürfe und müssen fachlich geprüft werden. Ein Malwarescan ist derzeit nicht enthalten und wird im Prüfergebnis ausgewiesen.

Im Stand `0.1.0-dev.3` wurden zusätzliche Eventlog-Fehler bei großen Logs und leeren Abschlussseiten korrigiert. Die erste Zustellpunktverwaltung ist umgesetzt: v2 bietet die authentifizierte Detailansicht, v3 zusätzlich bestätigte PATCH-Änderungen und Bulk-Edit. Erstellen, Löschen, Schlüsselregistrierung sowie das Bearbeiten von Leistungen, Schemata, Prozessen und Callbacks sind noch nicht Teil dieser Verwaltungsstufe. Es wird keine Bulk-Transaktion versprochen: Bei Teilfehlern zeigt die Oberfläche den Ausgang je Zustellpunkt. Bei ungewissem Ausgang wird nicht automatisch wiederholt. Die Live-Abnahme dieser Verwaltungsfunktionen steht noch aus.

Im Stand `0.1.0-dev.4` erhält die Anwendung einen festen Desktop-Rahmen mit seitlicher Navigation, globaler API-Auswahl, Verbindungsdialog und Statusleiste. Nur der Arbeitsbereich scrollt; Eingaben und Scrollposition bleiben beim Ansichtswechsel erhalten. Der Versand ist in Adressierung, Fachdaten sowie Anlagen/Antwortkanal gegliedert. API v3 ist die anfängliche Auswahl, v2 bleibt für Senden und Empfangen ausdrücklich wählbar. Herstellerwerbung wird in der Oberfläche nicht angezeigt; Programmversion und EUPL-Lizenz stehen unter „Info“.

Unter „Diagnose“ lassen sich die lokalen SDK-Komponenten prüfen und bis zu 100 technische Aufrufe der laufenden Programmsitzung als JSON exportieren. Der Bericht enthält ausschließlich festgelegte Befehle, API-Version, Zeitpunkt, Dauer, ausgewählte Ergebniszustände und freigegebene Fehlercodes. Er enthält keine Argumente oder Antwortinhalte, Zugangsdaten, Schlüssel, Kennungen oder Dateinamen und wird nicht automatisch versendet. Datenübertragungs-Chunks werden nicht protokolliert. „Antwort erhalten“ bedeutet, dass der native Aufruf zurückgekehrt ist; es ist kein fachlicher Erfolgsnachweis. Ein ungewisser Schreibausgang bleibt ungewiss und wird durch den Diagnoseexport nicht wiederholt.

Im Stand `0.1.0-dev.5` heißt die Anwendung **FIT-Connect Test-Client**. Fenstertitel, Installer, Programminformationen und Diagnoseberichte verwenden diesen Namen; die interne Installationskennung bleibt bestehen. JSON- und XML-Fachdaten können in einer nur lesenden Formularansicht betrachtet werden. Nach erfolgreicher technischer Prüfung erscheint sie direkt beim Empfang, mit separater Anlagenliste und dem bestehenden Antwortbereich. Vor dem Versand und beim Verfassen einer Antwort steht sie für Texteingabe oder ausgewählte Datei über „Fachdaten visuell ansehen“ zur Verfügung. Das Anzeigen verändert die Versanddaten nicht und löst keine Übertragung aus.

Die Formularansicht gliedert vorhandene Felder und verschachtelte Gruppen, bietet Suche und Feldherkunft und erhält große JSON-Zahlen, mehrfach vorhandene JSON-Felder, XML-Namensräume, Attribute und gemischte Textinhalte. XML-Leerraum ist separat aufklappbar; Kommentare und Verarbeitungsanweisungen stehen im unveränderten Quelltext. Es gibt kein automatisch erfundenes fachliches Mapping und keine Bearbeitung von Werten in der Formularansicht. Grenzen: 256 KiB, 16 Ebenen und 2.000 Struktur-Einträge. Größere Texte bleiben bis zur allgemeinen Vorschaugrenze von 2 MiB als Quelltext und darüber als Originaldownload zugänglich. DTD-/Entity-Deklarationen werden vor dem XML-Parser abgelehnt; Inhalte werden ausschließlich als Text dargestellt und externe Verweise nicht geladen. Ein Darstellungsproblem stellt keinen zusätzlichen fachlichen Prüfnachweis dar und ersetzt die SDK-Prüfung nicht.

`0.1.0-dev.6` ergänzt Schema-Beschriftungen: Die Werte stammen ausschließlich aus den Fachdaten; Bezeichnungen, Erläuterungen, Typen und Pflichtfeldhinweise aus dem passenden JSON-Schema beziehungsweise XSD. JSON-Referenzen, Array-Einträge und eindeutig unterscheidbare Varianten sowie XSD-Includes/-Imports, Namensräume, Attribute und dokumentierte Enumerationen werden berücksichtigt. Die Feldherkunft zeigt die Schemaquelle und ihre Position. Beim Empfang wird nur ein an das Prüfergebnis gebundener Schnappschuss der bereits geladenen Schemaquellen gelesen; die Ansicht löst keine zusätzlichen Abrufe aus. Beim Senden lassen sich die Beschriftungen separat über „Schema-Beschriftungen laden“ abrufen; die bestehende Bestätigung für öffentliche Schemaquellen gilt auch hier. Bereits zur Beispielerzeugung geladene Quellen werden wiederverwendet, bis sich die Adressierung ändert.

Die Ansicht ist keine universelle FIM-/XRepository-Formular-Engine. Nicht dokumentierte Feldkennungen bleiben Originalfeldnamen; externe Codelisten und FIM-spezifische `appinfo`-Erweiterungen werden nicht automatisch interpretiert. Fehlende Referenzen, konkurrierende Beschriftungen, dynamische JSON-Referenzen, Pattern-/Abhängigkeitsschemata und nicht unterstützte XSD-Konstrukte führen konservativ zu Originalnamen. Eine kurze erste Zeile der XSD-Dokumentation kann als Bezeichnung dienen; längere Absätze und vollständige Sätze erscheinen als Erläuterung unter dem Originalfeldnamen. Es werden keine Schema-Defaults als Antragswerte ergänzt. Schemaquellen für die Ansicht sind auf 8 MiB und 512 Dokumente begrenzt; vorhandene Quelltextansichten und Downloads bleiben verfügbar. Repräsentative reale FIM-/XÖV-Standards sind Bestandteil der ausstehenden Live-Abnahme.

`0.1.0-dev.7` vervollständigt den Testablauf mit schemageprüften Antworten und einem eigenen Reply-Event-Log. Nach dem Entschlüsseln wird der angebotene Antwortkanal aus dem nativen Prüfergebnis geladen. „Antwortschema laden“ lädt das angebotene JSON-Schema/XSD und seine Referenzen nach ausdrücklicher Bestätigung. Alternativ kann ein lokales JSON-Schema mit passender Dokument-`$id` ausgewählt werden (maximal 2 MiB, dann ohne externe Abrufe). Die Schemaquellen werden für Beschriftungen und die native Entwurfsprüfung wiederverwendet. Fiktive Antwortdaten können ausdrücklich aus dem Schema erzeugt werden.

„Antwort prüfen und vorbereiten“ prüft die exakten Antwortbytes im nativen Kern gegen das geladene Schema. Ein fehlendes/fremdes Schema, ungültiges JSON/XML oder ein Schemafehler verhindert die Versandbestätigung. Die Vorbereitung bindet Prüfergebnis, Schema-ID, Format, Antwortinhalt und Anlagen; erst die anschließende Bestätigung versendet die Antwort. Der native Prüfschritt hat keinen Netzwerkresolver und lädt keine neuen Schemaquellen. Die Fehlermeldung unterscheidet Format-, Schema- und Verfügbarkeitsfehler; detaillierte feldbezogene Validator-Meldungen sind noch ein weiterer Ausbau. Erfolgreiche Schemaprüfung bestätigt keine fachliche Richtigkeit.

Der Event Log kann nun ausdrücklich für eine Einreichung oder eine Antwort gewählt werden. Für Antworten genügen Vorgangs- und Reply-ID; gesendete und ausgewählte empfangene Antworten bieten einen direkten Einstieg. Beide SDKs prüfen alle Ereignisse, Signaturen, Vorgang und Subject. Der Log benötigt keine privaten Schlüssel und bestätigt keine Inhalts-Authentifizierungstags. Ein bekannter Reply-Log bleibt auch bei ungewissem Versand zur manuellen Prüfung erreichbar; ein solcher Ausgang löst keinen automatischen Neuversand aus. Entschlüsselung/Integrität, Schemaprüfung und die noch offene fachliche Prüfung werden beim Empfang getrennt angezeigt.

Automatisierte SDK-Rundläufe übertragen Antrag mit Antwortkanal, Antwort und Anlagen in allen vier v2/v3-Kombinationen. Die ursprüngliche Sitzung entschlüsselt die tatsächlichen SDK-Antwortbytes und prüft deren Reply-Event-Log. Weitere Tests blockieren manipulierte Signaturen, fremde Subjects/Vorgänge, doppelte Submit-Ereignisse, unpassende Antwortdaten und veraltete Schema-/Prüfkennungen. Browser-Fixtures prüfen Bestätigung/Abbruch, Originalbytes, Schema-Beschriftungen und die Sperre nach ungewissem Ausgang. Die Live-Abnahme gegen FIT-Connect TEST und Installation/Aktualisierung unter Windows bleiben offen. Das ist weiterhin ein Alpha-Entwicklungsstand.

Für die Beta sind TEST-Zustellpunkte anlegen, lokale Testschlüssel/-zertifikate mit öffentlicher Registrierung, optionale geschützte Profile und Schema-bezogene Darstellungsvorlagen vorgesehen. Replies, Prozessnachrichten und eine auswählbare BPMN-Ansicht werden darauf aufbauend erweitert. Zugangsdaten und JWKs bleiben aktuell sitzungsgebunden; die Anwendung speichert sie nicht im Klartext dauerhaft. PROD, Routing-Debugger und ZBP-Adapter sind nicht Teil dieses Ausbauplans; siehe [Roadmap](ROADMAP.md).

## Technische Grundlage

| Komponente | Verwendung |
| --- | --- |
| Vue und Tauri 2 | Desktop-Oberfläche |
| Java 25 | Lokaler Anwendungskern |
| FIT-Connect Java SDK 3.5.2 | API v2 |
| FIT-Connect Java SDK 4.0.0-rc.2 | API v3 |

Die SDK-Versionen werden getrennt geladen. Die Anwendung benötigt keinen separat betriebenen Backend-Server. Die Java-Laufzeit wird beim Paketieren eingebunden.

## Entwicklung unter Windows

Voraussetzungen:

- Windows x64 mit WebView2.
- Node.js ab 22.12.0 und npm.
- JDK 25. `JAVA_HOME` muss auf das JDK zeigen.
- Rust mit MSVC-Toolchain, Visual Studio C++ Build Tools und Windows SDK. Siehe [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/).

Das Projekt in einem lokalen Windows-Verzeichnis auschecken und die Befehle dort in PowerShell ausführen.

Build und automatisierte Tests:

```powershell
.\scripts\verify-windows.cmd
```

Das Skript installiert die npm-Abhängigkeiten, baut den Java-Kern und beide SDK-Adapter, führt die automatisierten Tests aus, stellt die Java-Laufzeit bereit und baut das Frontend. Es benötigt keine FIT-Connect-Zugangsdaten und stoppt beim ersten fehlgeschlagenen Schritt.

Anwendung im Entwicklungsmodus starten:

```powershell
npm run desktop:dev
```

Windows-Installer erstellen:

```powershell
npm run desktop:build -- -- --locked
```

Der Installer wird unter `desktop/target/release/bundle/nsis/` erzeugt. Er kann fehlendes WebView2 nachinstallieren. Für ein Paket mit eingebettetem WebView2-Installer:

```powershell
npm run desktop:build:offline -- -- --locked
```

## Zugangsdaten und Testschlüssel

Zugangsdaten werden in der Anwendung eingegeben und standardmäßig nicht dauerhaft gespeichert. Private Zustellpunktschlüssel werden nur geladen, wenn sie zu einer Registrierung in TEST mit gültigem selbstsigniertem Zertifikat passen. Unterstützt werden RSA-Schlüssel als JWK, JWKS mit genau einem Schlüssel und unverschlüsseltes PKCS#8-PEM.

Für den Betrieb der gebauten Anwendung werden weder Node.js noch Rust oder ein separat installiertes JDK benötigt.

## Mitwirken

Fehlerberichte und Beiträge sind willkommen. Hinweise für Änderungen und Tests stehen in [CONTRIBUTING.md](CONTRIBUTING.md). Zugangsdaten, private Schlüssel und echte Einreichungsdaten gehören nicht in Issues oder Testdateien.

## Lizenz

[EUPL-1.2](LICENSE). Abhängigkeiten behalten ihre jeweiligen Lizenzen.

Der Branch `alpha1-work` enthält den dev.8-Kandidaten mit geschützten Profilen/Backups, Zustellpunktanlage und Schlüsselwechsel, BPMN-Nachrichtenauswahl sowie Prozesskommunikation. Noch keine Alpha-1-Freigabe. Offene Abnahmen und aktuelle Einschränkungen stehen in [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md), der Technik-/Sicherheitsprüfung in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
