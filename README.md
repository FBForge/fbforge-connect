# FIT-Connect Integrationsclient

Der **FIT-Connect Integrationsclient** ist eine Desktop-Anwendung für Integrationstests mit FIT-Connect. Entwickler und Integratoren können damit Onlinedienste und Fachverfahren simulieren und Einreichungen über API v2 und v3 austauschen.

Die Anwendung arbeitet ausschließlich mit der FIT-Connect-Testumgebung. Sie ist ein unabhängiges Projekt und kein offizielles Produkt von FITKO.

## Funktionen

- Einreichungen mit Fachdaten und Anlagen über API v2 und v3 versenden, einschließlich Prozessadressierung bei v3.
- Leistungen und Fachdaten-Schemata aus dem Empfängerzustellpunkt auswählen und fiktive Beispieldaten erzeugen.
- Verfügbare Einreichungen eines Zustellpunkts auflisten, abrufen und lokal entschlüsseln.
- Einreichungen mit den FIT-Connect-SDKs technisch prüfen und anschließend annehmen oder ablehnen.
- Fachdaten und Anlagen anzeigen oder herunterladen, JSON strukturiert durchsuchen und formatiert lesen.
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
