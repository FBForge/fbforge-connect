# Goal 0.3.0: optionaler lokaler Malwarescanner

Arbeitsbranch: `feature/local-scanner-0.3.0`, Ausgangspunkt `release/0.3.0`.
Nach bestandener Abnahme in den Release-Branch integrieren. Keine vorzeitige
Veröffentlichung, kein automatischer Main-Merge und kein eigener Pull Request.

## Ziel und Bedienung

Vier ausdrücklich auswählbare Modi: ausgeschaltet, mitgelieferter lokaler ClamAV,
eigener ClamAV (INSTREAM), eigener ICAP-Dienst (RESPMOD). Kein FBForge-Relay,
kein Sanitizing und keine automatische serverseitige Annahme oder Ablehnung.
Aktive PDFs oder Office-Makros sind nicht automatisch ein Malwarefund.

Das Windows-Setup enthält ClamAV als abwählbare Komponente und einen datierten
offiziellen Signaturbestand. Die bestehende WebView2-Unterscheidung der Installer
bleibt davon unabhängig. Eine spätere Installation ist über ein geprüftes lokales
Paket oder einen ausdrücklich angeforderten Download möglich. Ein App-Upgrade
erhält die Auswahl; eine Deinstallation beendet nur den eigenen Scannerprozess.

Der lokale Scanner läuft als Benutzerprozess während der aktivierten App-Sitzung,
nicht als systemweiter Dienst. Nur Loopback, feste begrenzte Konfiguration,
kontrollierter Start mit Bereitschaftsprüfung, kein ausführbarer Renderer-Pfad.
Die Anwendung beendet ausschließlich ihren eigenen Prozess. Engine-Version,
Signaturversion/-datum, letzter erfolgreicher Updateversuch und Bereitschaft
werden angezeigt. Fehlende Datenbanken oder ein nicht betriebsbereiter Scanner
werden nicht als erfolgreicher Scan behandelt.

## Paket- und Updatevertrauen

ClamAV-Engine separat versionieren; aktuelle freigegebene Windows-x64-Version
zunächst 1.5.4. Offizielle Release-Signatur mit festgelegtem Talos-Schlüssel
prüfen, SHA-256 und Dateigrößen im vertrauenswürdigen Paketmanifest festhalten.
Archive vor Entpacken begrenzen: kein Traversal, keine absoluten Pfade, Links,
Duplikate oder unerwarteten ausführbaren Dateien. Installation atomar; eine
fehlgeschlagene Aktualisierung erhält die vorige funktionsfähige Installation.
Keine beliebigen URLs, Programme oder Befehlszeilen aus Renderer-Eingaben.

Lizenztexte und passender Quellcode einschließlich Build-/Abhängigkeitshinweisen
gehören zur Weiterverteilung. Große Binärdateien und Signaturdatenbanken sind
Build-Artefakte, keine Git-Dateien. Komponenten dürfen die Auswahl des neuesten
App-Releases durch den bestehenden Updater nicht beeinflussen.

FreshClam aktualisiert nur nach ausdrücklicher Einrichtung. Offline-Import nutzt
die offizielle Datenbankprüfung; gescheiterte Prüfungen ersetzen keinen gültigen
Bestand. Alter und fehlgeschlagene Updates bleiben sichtbar. CI prüft neue
Engine-Versionen und bereitet überprüfbare Änderungen vor, veröffentlicht aber
keine ungeprüften Komponenten automatisch. Paketbau lädt Datenbanken gezielt,
nicht bei jedem Commit.

## Datenfluss und Anlagenprobleme

Der vorhandene Host scannt nach erfolgreicher Entschlüsselung und Integritäts-
prüfung. Erweiterung um native Ergebnisse je Metadaten/Fachdaten/Anlage:
unauffällig, Fund, nicht vollständig geprüft. Meldungen aus fremden Scannern
werden begrenzt und nicht ungefiltert in HTML, Logs oder Protokollantworten kopiert.

Bei einem Anlagenfund bleiben unauffällige Inhalte lesbar. Betroffene Anlagen
erscheinen mit Kennung und Grund, aber ohne les-/exportierbare Schadbytes.
Keine dauerhafte zusätzliche Quarantäne. Lokale Vorgänge behalten den Hinweis
auch nach Neustart. Ein Export darf keine vollständige Originalübertragung
vortäuschen, wenn Anlagen fehlen. Sammelannahme bleibt für Funde gesperrt.

Eine Einzelannahme mit Anlagenproblemen benötigt eine zusätzliche native
Bestätigung. Die Problemangaben werden aus dem nativen Prüfergebnis erzeugt,
nicht aus einer frei erfundenen Renderer-Liste. Das signierte Accept-Event
enthält `problems` mit Bezug auf die betroffenen Anlagen. Die Nachricht wird
insgesamt angenommen; es gibt keinen unabhängigen Attachment-Status im
Zustelldienst. v2/v3 und Antworten sind getrennt zu prüfen. Metadaten-/
Fachdatenfunde sowie nicht vollständig ausgeführte Scans geben keine normale
Annahme frei. Ablehnen bleibt eine explizite Entscheidung.

Vor Versand ebenfalls scannen, sofern ein Scanner aktiviert ist. Ein Fund oder
unvollständiger Scan darf keinen POST zum Ankündigen einer Nachricht auslösen.
Kein erneuter Scan mit anschließend veränderten Versandbytes; Prüfung an den
vorbereiteten unveränderlichen Inhalt binden. Auch Antworten berücksichtigen.

## Teststrategie und Abnahmekriterien

- Echte ClamAV-Engine: saubere Text-/PDF-Datei, zur Laufzeit erzeugte standardisierte
  EICAR-Testdatei, optional EICAR im Archiv. Keine echte Schadsoftware und kein
  vollständiger EICAR-String als dauerhaftes Repository-Asset. EICAR prüft Erkennung,
  nicht die allgemeine Qualität des Scanners.
- ClamAV-Protokoll: korrektes INSTREAM, Paketgrenzen, unvollständige Antworten,
  Fund, Verbindungsabbruch, Zeitlimit, Limits und begrenzte Fehlermeldungen.
- ICAP: gleiche saubere/EICAR-Inhalte; kontrollierter lokaler Testdienst für 204,
  Infection-Header, blockierende 200-Antwort, Teilantworten und Abbruch. Ein bloßer
  ICAP-Protokolltest ist kein Nachweis eines echten Fremdprodukt-Virenscans.
- Host/SDK v2 und v3: saubere Daten passieren; gesperrte Anlagen nie über Lesen,
  Vorschau, Export, Archiv oder Neustart freigeben. Authentifizierung, Hashes,
  Schemafehler und Scannerfehler bleiben getrennt. Neue Prüfung widerruft alte
  Freigaben; Profil-/Umgebungs-/API-Wechsel darf kein Ergebnis übernehmen.
- Receipts: Fund automatisch im signierten Accept-Problem referenziert; native
  Bestätigung erforderlich; Abbruch sendet nichts; keine Sammelannahme; signierte
  Eventlogs nach realem TEST-Accept prüfen. Keine EICAR-Übermittlung in STAGE/PROD.
- Versand/Antwort: saubere unveränderte Bytes erfolgreich; Fund/Timeout verhindert
  jeden schreibenden Netzaufruf; kein Replay bei ungewissem Ausgang.
- Native Pakettests: gültiges Paket, falsche Version/Architektur/Signatur/Hash,
  Traversal, Archive-Bomben, beschädigte/zu alte Datenbank, Abbruch, kein Speicher,
  atomare Wiederherstellung und keine fremden Prozesse beenden.
- Windows: Setup mit/ohne Komponente, Nachinstallation offline/online, reparieren,
  Upgrade mit Erhalt der Auswahl, Deinstallation, Prozessstart/-ende und Portkonflikt.
  Tests verwenden isolierte Benutzerverzeichnisse, keine vorhandene ClamAV-Installation.
- UI: alle Modi, Fortschritt, Abbruch, Bereitschaft und Signaturalter, einzelne
  gesperrte Anlage, native Annahme-/Ablehnungsbestätigung, Tastatur, beide Themes,
  schmales Fenster. Fachliche Testberichte zeigen keine vermeintliche Garantie.

Nach Abschluss: vollständige Regression, echter Windows-Installer und TEST-Lauf,
Dokumentation/Architektur/Security/Release Notes sowie Hilfe, Screenshots und
Website-Nginx-/Deploymentprüfungen aktualisieren. Erst dann Integration in 0.3.0.
