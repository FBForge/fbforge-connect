# Umsetzungsplan 0.5.0: macOS-Unterstützung

Stand: 15. November 2026. Status: Umsetzung auf `release/0.5.0` läuft.
Der aktuelle Nachweis- und Abnahmestand steht in [MACOS.md](../MACOS.md).
Die folgenden Kriterien beschreiben das Ziel; sie sind keine pauschale Erledigtmeldung.
Geprüfte Ausgangsbasis: `ba26dba0b101fea1f096ac4fb40b4a4afab80a99`
auf `release/0.4.0`. Planungsbranch: `docs/plan-0.5.0`.

## 1. Ziel und Umfang

FBForge Connect 0.5.0 unterstützt Windows x64 und erstmals macOS auf Apple
Silicon nativ. Anwender installieren eine eigenständige App, ohne Java, Node,
Rust oder Homebrew einrichten zu müssen. Beide Plattformen verwenden denselben
Fachkern und dieselben geführten Abläufe. macOS erhält die üblichen Menüs,
Tastenkürzel, Dateidialoge und Fensterbedienung.

Der geplante macOS-Funktionsumfang umfasst:

- FIT-Connect API v2 und v3 mit TEST, STAGE und PROD.
- Profile, Credentials und private Schlüssel sowie Zertifikatsimporte.
- Senden, Empfangen, Inhaltsprüfung, Annahme/Ablehnung, Antworten nach Annahme,
  Prozessnachrichten und mehrere Antworten im selben Vorgang.
- Dauerhaft gespeicherte Vorgänge, Testdefinitionen, Testserien, Ergebnisse,
  unfertige Vorbereitungen und Antwortschemas sowie die vorhandene Sitzungsoption.
- Destination-Verwaltung im bestehenden API-/Berechtigungsumfang und öffentliche
  Zustellpunkt-Sicherungen.
- Proxy, zusätzliche CA-Zertifikate, öffentliche und lokale Schemaquellen.
- Die vorhandenen Scanner-Modi einschließlich optionalem lokalem ClamAV.
- Originalexporte, PDF-/Dateiansicht, Diagnose und signierte Updates.

Intel-Macs, Linux, Universal-Binaries, Mac App Store, neue Fachfunktionen und
iCloud-Synchronisierung sind nicht Bestandteil dieses Plans. Apple-Silicon-
Unterstützung bedeutet keinen Betrieb über Rosetta. Die macOS-Mindestversion
wird in M0 anhand der tatsächlich kompatiblen und unterstützten Versionen von
Tauri, WKWebView, Java und Scanner festgelegt. Sie ist noch nicht zugesichert.

0.4.0 bleibt während der Umsetzung stabilisiert. Die vollständige macOS-Arbeit
beginnt auf `release/0.5.0` vom abgenommenen 0.4-Stand. Notwendige spätere
0.4-Korrekturen werden nachvollziehbar übernommen. Dieser Plan erklärt 0.4.0
nicht für veröffentlicht. Installer und installierte Live-Abnahme des zuletzt
geänderten 0.4-Stands waren beim Planungsbeginn noch offen.

## 2. Befund im vorhandenen Code

| Bereich | Nachgewiesener Ausgangspunkt | Konsequenz |
| --- | --- | --- |
| Speicher | [`vault/protection.rs`](../../desktop/src/vault/protection.rs) liefert außerhalb Windows `vault_unsupported` | Schlüsselbund-Backend und verschlüsselte Dateispeicherung entwickeln |
| Plattformfreigaben | `commands/sessions.rs`, `case_store.rs`, `cases.rs`, `scenario_recovery.rs`, `network_settings.rs` enthalten Windows-Prüfungen | Gemeinsame Fähigkeiten statt verstreuter OS-Abfragen verwenden |
| Laufzeit | `engine.rs` unterscheidet bereits `java.exe` und `java`. `stage-engine.mjs` kann eine lokale Laufzeit erzeugen | Tatsächliches macOS-Bundle, Architektur, Rechte und Signierung prüfen |
| Bundle | [`tauri.conf.json`](../../desktop/tauri.conf.json) enthält NSIS und Windows-Icons | macOS-Konfiguration und `.icns` ergänzen |
| Updates | `update_policy.rs` verlangt `windows-x86_64`, eine feste EXE-URL und `MZ` | Plattformabhängige Ziel-/Paketprüfung ergänzen, Vertrauensgrenzen erhalten |
| Scanner | Windows-Manifest, EXE-Dateien, Windows-Jobobjekte und OS-Sperren | Eigenes Komponentenpaket und macOS-Prozessaufsicht erforderlich |
| Hilfe | `documentation.rs` kennt bereits `/usr/bin/open` | Integration im ausgelieferten Paket prüfen |
| Prüfinfrastruktur | Browser-Fixtures und reguläre native Windows-Checks vorhanden | macOS-Nativtests und installierte WKWebView-Abnahme ergänzen |

Ein erfolgreicher Linux-/Browser-Build weist weder macOS-Schlüsselbundzugriff
noch Gatekeeper, WKWebView, VoiceOver oder macOS-Updates nach.

## 3. Technisches Zielbild

### 3.1 Gemeinsame Architektur

Vue 3/TypeScript, Tauri 2/Rust und Java 25 bleiben bestehen. SDK-Adapter,
Validierung, Abläufe und fachliche Modelle werden gemeinsam gepflegt.
Betriebssystemdetails liegen in kleinen nativen Modulen für Schutzspeicher,
Prozessaufsicht, Paketierung und Plattformfähigkeiten. Kein paralleler
macOS-Fachclient, kein zweites Frontend und keine Nachimplementierung der SDKs.

Die native Schicht meldet unterstützte Fähigkeiten wie geschützte Speicherung,
lokaler Scanner und Updates. Laufzeitfehler wie ein gesperrter Schlüsselbund
werden zusätzlich als konkrete Zustände gemeldet. Das Frontend darf einen
fehlgeschlagenen Zugriff nicht als dauerhaft fehlende Funktion interpretieren.
Windows-DPAPI bleibt bytekompatibel mit vorhandenen Daten und Sicherungen.

### 3.2 Schlüsselbund und verschlüsselte Daten

Auf macOS schützt ein zufälliger Schlüssel die lokalen Dateien durch ein
etabliertes authentifiziertes Verschlüsselungsverfahren. Der Schlüssel liegt
im macOS-Schlüsselbund. Festlegung von Bibliothek, Algorithmus und Keychain-
Zugriffspolitik erfolgt als dokumentierte Entscheidung in M1, ohne eigene
Kryptografie oder Shell-Aufrufe mit Geheimnissen in Argumenten.

- Versioniertes Dateiformat mit Schlüsselkennung und eindeutigen Nonces.
- Authentifizierte Kontextbindung an Zweck, Profil, Umgebung und API, soweit
  das bestehende Fachmodell diese Trennung vorsieht. Globale Einstellungen
  erhalten ihren eigenen Zweck statt einer erfundenen Profilbindung.
- Schlüsselinitialisierung nebenläufig sicher und atomar. Ein verlorener
  Schlüssel darf bei vorhandenen Daten nicht still ersetzt werden.
- Begrenzte Dateigrößen, sichere temporäre Dateien, atomare Ersetzung im selben
  Dateisystem, Benutzerrechte und Schutz vor Symlink-Zielen.
- Schlüsselbundabbruch, Sperre, Zugriff verweigert und beschädigte Daten erhalten
  unterscheidbare Fehlermeldungen. Vorhandene Dateien bleiben erhalten.
- Keine Synchronisierung des Hauptschlüssels über iCloud. Zugriffe bleiben im
  nativen Prozess. Schlüssel und Tokens erscheinen nicht in IPC-Diagnosen.
- Alle bestehenden Speicherarten einschließlich Quarantäne, Zustellpunkt-
  Sicherungen und Proxy-Geheimnissen werden inventarisiert und geprüft.
- Schlüsselbundzugriff auch nach einem korrekt signierten App-Update testen.
  Neustart, Abmeldung und Passwortänderung werden gesondert geprüft.

Automatische Speicherung folgt dem bestehenden Standard. Bei ausdrücklicher
Abwahl werden die betroffenen weiteren Daten nur für die Sitzung gehalten.
Ein Speicherfehler wird sichtbar und darf keinen erfolgreichen Serveraufruf
nachträglich als fehlgeschlagenen Versand ausgeben.

### 3.3 Profil-Backups und Windows-Umzug

Das heutige `.fctest-profile`-Backup verwendet ebenfalls den lokalen
Plattformschutz. Es ist kein bereits portables Windows-/Mac-Transferformat.
Vorhandene DPAPI-Dateien werden auf macOS nicht als lesbar beworben.

Für 0.5.0 ist die neue Einrichtung eines Mac-Profils mit vorhandenen Zugängen
und dem ausdrücklich importierten Schlüsselmaterial der unterstützte Weg.
Öffentliche Zustellpunkt-Sicherungen und portable Testdateien bleiben nutzbar.
Die Oberfläche erklärt die Kontobindung geschützter Profil-Backups.

Ein passwortgeschützter Rechnerwechsel ist eine separate, optionale Erweiterung
mit geschätzten 4–8 Personentagen. Sie benötigt ein versioniertes, authentifiziert
verschlüsseltes Format, geprüfte Passwortableitung, Vorschau, Konfliktbehandlung,
explizite Auswahl privater Schlüssel und Größenlimits. Tokens und alte
Sitzungsnachweise werden nicht übertragen. Keine neue unverschlüsselte
Exportmöglichkeit für private Schlüssel. Dieser Umfang ist nicht im Basisbudget.

### 3.4 App-Bundle und Java

Ein Apple-Silicon-Build enthält eine passende, reduzierte Java-25-Laufzeit und
beide SDK-Adapter. Die App findet Ressourcen relativ zum Bundle und benötigt
keine Laufzeit aus PATH. Start aus Finder, Dock und einem Pfad mit Leerzeichen
muss funktionieren. Das App-Bundle wird zur Laufzeit nicht verändert.

Persistente Daten liegen im vom System vorgesehenen App-Datenverzeichnis.
Caches und temporäre Dateien sind getrennt und bereinigbar. Exportdateien
werden ausschließlich in ausdrücklich ausgewählte Ziele geschrieben.

Alle Mach-O-Dateien, Bibliotheken und Helfer werden inventarisiert. Dynamische
Bibliothekspfade und Architektur werden geprüft. Java-JIT und benötigte
Hardened-Runtime-Ausnahmen werden mit möglichst engem Umfang verifiziert.
Ein pauschales Abschalten von Library Validation ist keine Vorentscheidung.
Lizenztexte und Herkunftsnachweise begleiten die ausgelieferten Komponenten.

### 3.5 Lokaler Scanner

ClamAV bleibt optional und wird ohne privilegierten Systemdienst als eigener
Benutzerprozess betrieben. M0 klärt zuerst verfügbare offizielle Pakete,
Architektur und Weiterverteilung. Falls kein passendes Paket existiert, ist
ein reproduzierbarer eigener Build mit festgelegten Quellen erforderlich.

Das macOS-Paket erhält plattformgebundene Manifeste, Größenlimits und Hashes.
Die vorhandene Upstream-Verifikation wird beim Build erhalten. Nach einer
notwendigen Code-Signierung gelten für die verteilten Bytes neue, nachvollziehbare
Hashes und eine authentifizierte Vertrauenskette. Externe Scannerkomponenten
müssen ebenfalls mit Gatekeeper/Notarisierung auf einem frischen Mac funktionieren.

Engine-Dateien bleiben unveränderlich. Datenbanken und Einstellungen liegen
benutzerbezogen außerhalb des App-Bundles. Updates und Abbruch verwenden die
bestehende atomare Übernahme und Wiederherstellung nach Unterbrechung.
Prozessaufsicht muss App-Absturz, erzwungenes Ende, verwaiste Kinder und
Portübernahme durch fremde Prozesse berücksichtigen. Unix-Prozessgruppen allein
sind kein Nachweis für Aufräumen nach SIGKILL. Die geeignete Aufsicht wird in M3
praktisch belegt. Niemals fremde ClamAV-Prozesse oder globale Ports beenden.

Releasekriterien sind saubere Datei und EICAR, Signaturupdate, Proxytransport,
Abbruch, Neustart, Offline-Import, Fremdprozessschutz und bestehende Quarantäne.
Ein Scheitern dieser Portierung wird als Umfangsentscheidung eskaliert.
Ein unfertiger lokaler Scanner wird nicht als gleichwertig ausgeliefert.

### 3.6 Netzwerk und SDKs

Beide SDKs, Tokenabruf, Schemaquellen, Scannerdownloads und Updater müssen die
vereinbarte Netzwerkkonfiguration konsistent berücksichtigen. Systemproxy,
expliziter HTTP-CONNECT-Proxy, Authentifizierung und zusätzliche CA-Zertifikate
werden auf macOS geprüft. PAC/WPAD und Unternehmensauthentifizierung werden
nur im tatsächlich nachgewiesenen Umfang dokumentiert.

Native TLS-Verbindungen und Java-TLS dürfen nicht still unterschiedliche
Vertrauensannahmen verwenden. Systemvertrauen und ausdrücklich importierte
CA-Zertifikate erhalten ein dokumentiertes Verhalten. TLS-Verifikation wird
nicht abgeschaltet. Proxy-Zugangsdaten bleiben beim Proxy. Abbruch und Timeout
bei Netzwechsel, Schlafmodus und Aufwachen werden geprüft. Ein Schreibaufruf
mit ungewissem Ergebnis wird nicht automatisch erneut gesendet.

### 3.7 Updates und Distribution

Für Benutzer ist ein signiertes und notarisiertes DMG mit der App vorgesehen.
Der Updater erhält das vom verwendeten Tauri-Updater tatsächlich benötigte
macOS-Paketformat. DMG und Updatepaket sind unterschiedliche Release-Artefakte.
Die exakten Dateinamen werden in M5 verbindlich festgelegt.

Plattform und CPU werden nativ bestimmt. Metadaten dürfen keine andere Plattform
oder fremde Downloadziele freigeben. Die Versionsbindung in der Updater-Signatur,
Downloadlimits und erlaubten GitHub-Weiterleitungen bleiben bestehen.
Apple Developer ID und die Tauri-Updater-Signatur erfüllen getrennte Aufgaben.
Beide müssen geprüft werden. Der gemeinsame Feed bleibt für Windows-0.4-Clients
lesbar und liefert weiterhin deren erwarteten Windows-Eintrag und Dateinamen.

Installation nach `/Applications` und nach `~/Applications` wird geprüft.
Beim Start aus dem gemounteten DMG erfolgt keine unkontrollierte Selbständerung.
Nicht beschreibbare Installationsorte erhalten einen verständlichen Updateweg.
Unterbrechung, Profilbestand und Neustart werden mit zwei echten Versionen
geprüft. Der Build erzeugt kein Update mit derselben Version als Testersatz.
Ein beliebiges Downgrade ist keine Recovery-Strategie, solange Speicherformate
nicht nachweislich rückwärtskompatibel sind.

## 4. UX/UI und Plattformverhalten

Die bestehende übersichtliche Führung bleibt das Produktprinzip. Keine neue
Verschachtelung und keine zweite Fachnavigation für macOS. Apple-Design-Skill
auf Vue/Tauri anwenden, nicht durch einen SwiftUI-Neubau ersetzen.

- Native Menüleiste mit App, Ablage, Bearbeiten, Darstellung, Fenster und Hilfe.
  Einstellungen über das App-Menü und `Cmd+,`, Beenden über `Cmd+Q`.
- Gemeinsame Aktionssteuerung für Menüs und Oberfläche. Menüs umgehen weder
  Berechtigungen noch Versandbestätigungen, Beschäftigt-Zustände oder Profilbindung.
- Standardaktionen wie Kopieren/Einfügen/Rückgängig erhalten Cmd-Tastenkürzel.
  Kontextmenüs für Texte und Eingaben funktionieren. Die bisherige Unterdrückung
  des Browser-Kontextmenüs wird gezielt geprüft, ohne Standardbearbeitung zu sperren.
- Fenster schließen und App beenden bewusst unterscheiden. Beim Schließen werden
  unfertige Eingaben geschützt gesichert und aktive Wartevorgänge beendet.
  Im Leerlauf versteckte App hält keine Engine-/Scannerprozesse unnötig offen.
  Dock-Aktivierung stellt das Hauptfenster wieder her. Cmd+Q führt denselben
  kontrollierten Speicher-/Abbruchpfad aus. Unsichere Schreibzustände bleiben erhalten.
- Single-Instance-Verhalten, Vollbild, mehrere Displays, Dateidialoge, Drag-and-drop,
  Finder-Öffnen und Exportrechte im tatsächlichen WKWebView prüfen.
- Einstellungen bleiben fachlich gemeinsam. Das App-Menü öffnet denselben
  Einstellungen-Bereich, statt eine zweite, abweichende Einstellungslogik anzulegen.
- Hell/Dunkel/System, erhöhter Kontrast, reduzierte Bewegung, große Schrift,
  sichtbarer Fokus und VoiceOver werden mit der kompletten Nutzerführung geprüft.

Grundlage der Planung, noch kein Audit einer fertigen Mac-Oberfläche:
Apple HIG „Designing for macOS › Best practices“: „Use the menu bar to give people
easy access to all the commands they need“. „The menu bar › Best practices“:
„Support the default system-defined menus and their ordering“. „Windows › Best
practices“: „Avoid creating custom window UI“. „Accessibility › Vision“:
„Support larger text sizes“. Die vorhandene Erscheinungswahl bleibt als bewusste
plattformübergreifende Produktentscheidung erhalten.

## 5. Arbeitspakete und Meilensteine

| Meilenstein | Umsetzung und betroffene Stellen | Fertig, wenn |
| --- | --- | --- |
| M0 Machbarkeit | Echter Apple-Silicon-Mac, Xcode-/SDK-/Rust-/JDK-Abgleich, `stage-engine.mjs`, macOS-Tauri-Konfiguration, ClamAV-Probe | Gebündelte App startet aus Finder, beide Java-Adapter laufen ohne installiertes Java. Mindest-OS und Scanner-Lieferweg sind entschieden. |
| M1 Schutzspeicher | `vault/protection.rs`, Speicher-Aufrufer und Plattformfreigaben, gemeinsame Fähigkeitsschnittstelle | Alle Speicherarten bleiben nach Neustart lesbar. Sperre, Abbruch, Korruption und fehlender Schlüssel werden sicher behandelt. Vorhandene Windows-Dateien bleiben lesbar. |
| M2 Fachlicher Kern | `engine.rs`, Import-/Export-/Dateipfade, Netzwerk und Plattformtexte | V2/v3-Kernabläufe, private Schlüssel, PDF, Proxy und Schemaquellen bestehen native Mac-Tests. |
| M3 Scanner | Scanner-Manifest, Staging, `local_scanner.rs`, `scanner_process.rs`, Portprüfung | Verifizierte Komponente mit sauberer Datei/EICAR und Update-/Abbruch-/Prozessfehlerfällen besteht auf einem frischen Mac. |
| M4 Bedienung | Tauri-Menüs, Fenster-Lebenszyklus, Kurzbefehle, gemeinsame Vue-Komponenten | Zentrale Abläufe sind per Tastatur und VoiceOver durchführbar. Vorher-/Nachher-Bilder aller veränderten Flächen sind angesehen. |
| M5 Paket und Updates | Bundle, `.icns`, Entitlements, Developer-ID-Signierung, Notarisierung, `update_policy.rs`, Feed-Erzeugung | DMG und Updatepaket bestehen Gatekeeper und eine echte Aktualisierung mit Profilerhalt. Windows-Updatefeed bleibt kompatibel. |
| M6 Releaseabnahme | CI, native installierte Tests, TEST-Austausch, Doku, Security-Audit | Abnahmematrix vollständig erfüllt, Nachweise einem konkreten Commit zugeordnet, Betreiberabnahme vorhanden. |

Abhängigkeiten: M0 vor dem ersten belastbaren Aufwandabgleich. M1 vor dauerhaftem
Funktionstest. M2 vor vollständiger Live-Abnahme. M3 und M4 können nach den
jeweiligen Grundlagen unabhängig fortschreiten. M5 berücksichtigt Ergebnisse
aus M0/M3 zur Signierung aller Helfer. M6 setzt M1–M5 voraus.

## 6. CI und Teststrategie

Normale Änderungen bauen und testen die tatsächlich betroffenen Module.
Zusätzlich zu Windows gibt es einen explizit auf Apple Silicon laufenden,
versionierten macOS-Runner. WKWebView wird im installierten Paket geprüft.
Playwright/WebKit ergänzt die Browserprüfung, ersetzt WKWebView aber nicht.
Schlüsselbundtests erhalten isolierte Testdaten und kontrollierte Aufräumwege.
Interaktive Keychain-Freigaben werden zusätzlich manuell am echten Mac geprüft.

Vollständige Installation, Signierung, Notarisierung und reale Schreibtests
bleiben getrennte manuelle Workflows. Entwickler-PRs benötigen keine Apple-
Signiergeheimnisse. Credentials liegen in geschützten CI-Environments. Der
native Mac-Testtreiber wird nachgewiesen, bevor er als Release-Gate gilt.

Gemeinsame Node-/Java-/Browser-Tests laufen weiter. Native Plattformtests messen
reale Schlüsselbund-/DPAPI- und Dateisystempfade separat. Coverage-Schwellen
werden nach einer transparenten Ausgangsmessung festgelegt. Keine pauschale
95-Prozent-Zusage oder Verbesserung der Quote durch Ausschluss neuer OS-Module.

Actions-Speicher: Abhängigkeiten cachen, Java-Artefakte gezielt wiederverwenden,
kleine Testberichte und kurze Aufbewahrung für interne Kandidaten. Fehlgeschlagene
Nachweise erst nach Ursachenanalyse und erfolgreichem Ersatz aufräumen.
Ein aktueller Kandidat bleibt erhalten, bis sein Ersatz geprüft verfügbar ist.

## 7. Verbindliche Abnahmematrix

| Gruppe | Mindestens erforderlicher Nachweis |
| --- | --- |
| Installation | Frischer Mac, Download mit Quarantäneattribut, Gatekeeper, Finder-Start, Application-Pfade, kein installiertes Java erforderlich |
| Speicher | Profile, private Schlüssel, Vorgänge, Bibliotheken und Vorbereitung nach Neustart. Session-only, Schlüsselbundsperre, fehlender Schlüssel, defekte Dateien, zweiter Benutzer |
| Austausch | V2 und v3: JSON/XML, Anlagen, Empfangen, Vergleichen, Annehmen/Ablehnen, Antworten nach Annahme und konkrete SDK-Fehleranzeige |
| Prozess | V3-Prozessnachrichten, Nachforderung/Nachreichung und weitere Antworten im selben Case über einen Neustart |
| Eingang | Mehrfachauswahl, Schemafreigabe, Review bei Schemafehler, ausdrückliche Annahme mit Problem Statement, Originalexport ohne zusätzliche Export-JSON |
| Werkzeuge | Geführte Vorbereitung, lokale Sicherung, Import/Export, Variablen, Testserien, Ergebnisvergleich, Abbruch und Wiederaufnahme |
| Destination | Berechtigung, API-Grenzen, Anlage/Bearbeitung, Reply-Channels, Mehrfachsicherung und öffentliche Sicherungsdateien ohne private Schlüssel |
| Netzwerk | Direkt, expliziter Proxy mit/ohne Authentifizierung, zusätzliche CA, Systemproxy im dokumentierten Umfang. Alle relevanten Download-/Schema-/SDK-Wege |
| Scanner | Alle vorhandenen Modi, EICAR, saubere Daten, falsche/manipulierte Komponenten, Update, Abbruch, erzwungenes Ende, fremder Prozess, Quarantäne |
| Updates | Zwei Versionen, gültige und ungültige Signaturen, falsches OS/CPU, unterbrochener Download, Schreibrechte, Profilerhalt, unvertrauenswürdige Metadaten |
| Bedienung | Cmd-Kurzbefehle, Menüstatus, Fokus, VoiceOver, Hell/Dunkel, 200 Prozent Schrift, kleines Fenster und Vollbild |
| Regression | Windows-0.4-Profile auf Windows-0.5, DPAPI, Scanner, Installer, beide SDKs und bestehender Updater |

TEST-Abnahme verwendet eigene Destinations mit Wiederverwendung und
nachvollziehbarem Aufräumen. Keine Stage-/Prod-Schreibabnahme. Schlafmodus,
Netzverlust und ungewisser Versand dürfen keine automatischen Duplikate erzeugen.
Security-Audit umfasst besonders Schlüsselbund, Speicherbindung, signierte
Helfer, Updateformat und Scannerverifikation. Findings werden wie vereinbart
im Chat dokumentiert. Ein Auditbericht ist kein automatischer Repo-Inhalt.

## 8. Release-Artefakte, Dokumentation und Freigabe

Geplante öffentliche Artefakte: vorhandene Windows-Pakete, macOS-Apple-Silicon-DMG,
macOS-Updaterpaket mit Signatur, gemeinsamer Updatefeed, Prüfsummen und zugeordnete
Build-/Herkunftsnachweise. Scanner bleibt eine getrennte optionale Komponente
mit eigenem Manifest und Lizenz-/Quellnachweisen. Interne Coverage-Berichte
werden nicht als Benutzerdownload veröffentlicht.

[BUILDING.md](../../BUILDING.md), [ARCHITECTURE.md](../../ARCHITECTURE.md),
[RELEASING.md](../../RELEASING.md), [SECURITY.md](../../SECURITY.md), Release Notes und
Frontend-Texte werden gezielt aktualisiert. Eine gemeinsame versionierte Hilfe
beschreibt die Fachabläufe und ergänzt Plattformunterschiede samt echten
Mac-Screenshots. Website-Download und Betriebssystemwahl müssen eindeutig sein.
Der Website-/Hilfe-Import bleibt auf einem eigenen Doku-Branch bis zur Freigabe.

Releasefolge: Kandidat bauen und prüfen → interne Abnahme → freigegebenes Paket
signieren/notarisieren → signiertes Paket erneut installieren und prüfen →
Betreiberfreigabe → Veröffentlichung. Frühe isolierte Signierproben zur Prüfung
der Machbarkeit benötigen einen gesondert freigegebenen Signierzugang. Sie sind
keine Veröffentlichung. Nach dem letzten produktiven Codewechsel ist erneut
nachzuweisen, welche Abnahmen noch zum tatsächlichen Paket passen.

Blockierend: Datenverlust, lesbare Geheimnisse, beschädigte Bestandsprofile,
unverifizierte Updates/Scanner, Gatekeeper-Fehler, automatische Wiederholung
ungewisser Schreibaktionen und nicht bedienbare Hauptabläufe. Eine rote
Abnahmegruppe wird nicht durch eine pauschale Releasefreigabe ersetzt.

## 9. Aufwand und Voraussetzungen

| Arbeitspaket | Personentage |
| --- | ---: |
| Nativer Prototyp und Machbarkeit | 2–4 |
| Schlüsselbund und alle Speicherarten | 6–10 |
| Fachkern, Zertifikate und Netzwerk | 4–7 |
| Lokaler Scanner | 6–12 |
| macOS-Bedienung und Barrierefreiheit | 3–5 |
| Signierung, Paket und Updates | 4–6 |
| CI, vollständige Abnahme, Doku und Korrekturen | 5–8 |
| **Basisschätzung** | **30–52** |

Die letzte Zeile bündelt übergreifende CI-/Abnahmearbeit. Umsetzung und gezielte
Tests gehören bereits in jedes einzelne Arbeitspaket. Die Schätzung bezeichnet
menschliche Entwicklungsleistung, keine feste Kalenderdauer oder Zusage für die
Laufzeit eines Agenten. Für Budgetplanung rund 20 Prozent Reserve vorsehen,
entsprechend etwa 36–63 Personentagen. Nach M0 und M3 neu schätzen. Ein interner
Prototyp liefert keine Releasegleichwertigkeit. Der optionale sichere
Windows-/Mac-Umzug kommt mit 4–8 Personentagen hinzu.

Voraussetzungen: Apple-Silicon-Testgerät mit interaktiver Nutzung, macOS-CI,
passende TEST-Zugänge und wiederverwendbare eigene Destinations. Für signierte
Abnahme zusätzlich Apple-Developer-Mitgliedschaft, Team-ID, Developer-ID-
Zertifikat mit privatem Schlüssel, sichere Notarisierungscredentials und der
bestehende Updater-Signierzugang. Geheimnisse nicht in Repo oder Chat ablegen.

## 10. Erster umsetzbarer Auftrag

M0 auf `release/0.5.0` ausführen, sobald die abgenommene 0.4-Basis feststeht:
minimalen macOS-Build mit mitgelieferter Java-Laufzeit erzeugen, beide SDKs lokal
laden, Schlüsselbundzugriff prototypisch prüfen und Scannerquelle/-signierung
klären. Ergebnis sind ein intern ausführbarer Prototyp, festgelegte Mindest-OS-
Version, verbindliche technische Entscheidungen und eine nachgeschärfte
Schätzung. Erst danach den vollständigen Schutzspeicher in M1 ausrollen.
