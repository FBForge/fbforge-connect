# Abnahmestand 0.3.0

Stand: 2. November 2026. Wartbarkeitsänderungen, Regressionen und reproduzierbare
Abdeckungsmessungen sind umgesetzt. Die reguläre CI, normale und Offline-Installation,
Upgrade, NVDA sowie die erneute SDK- und installierte UI-Abnahme auf TEST sind bestanden.
Die Produktquellen stammen unverändert aus `4ce71bc`. Nachfolgende Commits verbessern
Testwerkzeuge, Messung und Dokumentation. Die finale Signierung bleibt beim Eigentümer.

Vor diesem Refactoring wurde die Entwicklungshistorie von 101 auf 17 Themen-Commits
zusammengefasst. Der damalige Produktbaum blieb gegenüber `681fbd1` identisch.
Die Nachweise unten nennen ihre tatsächlichen Quellen. Sie sind keine Signierfreigabe
für eine andere Commit-ID. Vor der endgültigen Signierung ist der resultierende
Main-Commit nach dem Release-Ablauf erneut zu validieren.

## Wartbarkeit und gemessene Abdeckung

- Native Aufrufe, Sitzungen, Profilmetadaten, Empfängerangebote und Schema-Paging
  verwenden strenge TypeScript-Verträge mit Laufzeitprüfung von `unknown`.
  Auch die Zuordnung von Sender-/Empfängerprofilen wird in Vue streng geprüft.
  Bestehende JavaScript-Ansichten sind noch nicht vollständig typisiert.
- Die Versandadressierung besitzt klare synchrone Übergänge und sieben gezielte
  Regressionen. Der übergeordnete Versandcontroller benötigt fünf statt zwölf Watcher.
- Der identische HTTPS-Schemaabruf liegt in `adapter-support`. Beide SDKs laden
  getrennte Klassen. Der zusätzliche Isolationstest prüft auch identischen Bytecode.
- Fehlerhaft angebotene Prozessstandards ergeben einen verständlich zuordenbaren
  Protokollfehler. Der Regressionstest schlägt auf dem ursprünglichen Stand fehl.
- c8, Chromium/V8, JaCoCo und llvm-cov erzeugen getrennte HTML-Berichte. Fehlende
  Frontend-Dateien und leere Java-Berichte werden durch Regressionen abgefangen.
  Nicht geladene Frontend-Module zählen als ungetestet. Instrumentierung gehört
  ausschließlich zu den Tests, niemals zum ausgelieferten Paket.

Befehle und Mindestwerte stehen in [BUILDING.md](../../BUILDING.md#testabdeckung-messen).
Die Vergleichsmessung verwendet einen getrennten Checkout von `6cb27f6` und
identische Ausschlüsse für Typdeklarationen. Die Entdoppelung verändert den
Java-Nenner. Die Quoten sind keine gemeinsame Gesamtquote oder Sicherheitsgarantie.

| Messumfang | Vorher Zeilen/Zweige | Danach Zeilen/Zweige |
| --- | --- | --- |
| Node, alle Frontend-JS/TS-Module | 55,75 % / 85,21 % | 56,83 % / 85,47 % |
| Java, eigene Module und isolierte Adapter | 82,98 % / 63,62 % | 83,43 % / 64,42 % |
| Browser, alle Frontend-JS/TS-/Vue-Module | 83,06 % / 70,81 % | 83,08 % / 70,82 % |
| Rust, isolierte Verträge unter Linux, Produktzeilen | 58,16 % / nicht gemessen | 58,16 % / nicht gemessen |
| Rust, isolierte Verträge unter Windows, Produktzeilen | erstmals gemessen | 74,08 % / nicht gemessen |
| Rust, vollständige native Windows-Tests, Produktzeilen | erstmals gemessen | 31,73 % / nicht gemessen |

349 Node-Fälle ohne übersprungene Tests, 279 Java-Fälle und 69 isolierte native
Fälle sind lokal bestanden. Die sieben neuen Auswahlzustand-Tests decken den neuen
Adressierungsbaustein mit 100 % Zeilen- und 93,50 % Zweigabdeckung ab.
Die Browserabnahme entdeckte während des Refactorings eine ausbleibende Dropdown-Aktualisierung
nach dem FIM-Abruf. Ein expliziter, unveränderlicher Übergang für Katalogtitel behebt
das Problem und erhält manuelle Änderungen sowie die Schemaauswahl. Der gezielte
Browsertest und eine zusätzliche Zustandsregression bestehen. Auch der vollständige
Browserlauf besteht mit 242 Fällen ohne Wiederholungen oder übersprungene Tests.
Der Produktionsbundle-Test und der paketierte Java-Engine-Smoke-Test bestehen.
Die erste native Rohmessung enthielt Inline-Testmodule. LLVMs aggregierte
Zähler können zudem von der Anzahl eindeutiger physischer Quellzeilen abweichen. Die Produktmessung zählt nun eindeutige physische LCOV-Quellzeilen.
Ein Rust-Syntaxbaum identifiziert testexklusive Module, Funktionen und Felder.
Die Rohdaten bleiben erhalten. Auch ungetesteter Produktcode nach einem Testmodul
bleibt im Nenner. Drei Rust-Parserfälle und zwei LCOV-Regressionen sichern das ab.
Die vollständige native Messung erfasst 2.195 von 6.918 Produktzeilen.
Besonders die Tauri-Befehle für Profile, Scanner, Vorgänge und Updates sowie
`write_policy.rs` benötigen weitere gezielte Tests. Die gesonderte installierte
UI-Abnahme wird nicht instrumentiert und fließt nicht in diese Quote ein.
Die vollständige Migration des übrigen JavaScripts und weitere Tests bisher
unerreichter Fehler-/Abbruchpfade bleiben schrittweise Wartungsarbeit.

## Neue Nachweise des Refactorings

| Prüfung | Stand |
| --- | --- |
| [CI 41426876905](https://github.com/FBForge/fbforge-connect/actions/runs/41426876905) | Bestanden, `87f3ed2`, vollständige Produktberichte für Node, Browser, Java und beide nativen Windows-Umfänge |
| [Windows 41416057273](https://github.com/FBForge/fbforge-connect/actions/runs/41416057273) | Bestanden, `4ce71bc`, normale und Offline-Installation, Upgrade von 0.2.0, Profilerhalt, Scanner und NVDA |
| [SDK-Matrix 41416061122](https://github.com/FBForge/fbforge-connect/actions/runs/41416061122) | Bestanden, `4ce71bc`, Umfang `native_only`, v2/v3 JSON/XML/Prozessnachrichten, Antworten, Absenderbeschränkung, Schlüsselwechsel |
| [Installierte UI 41424503317](https://github.com/FBForge/fbforge-connect/actions/runs/41424503317) | Bestanden, Kandidat `4ce71bc`, Treiber `191781c`, Umfang `installed_ui_only`, lokale und Online-Scanner-Einrichtung, vollständiger Nachrichtenfluss |

Lokal bestehen alle 349 Node-Fälle ohne übersprungene Tests. Beide CI-Browserläufe
umfassen alle 242 Fälle einschließlich der geprüften öffentlichen FIM-Fixtures.
Java: 279 Fälle. Windows: 69 isolierte und 72 vollständige native Fälle sowie drei
Parserfälle des Messwerkzeugs. Die Plattformwerte werden getrennt festgeschrieben.
Die Produktquellen und der Live-Treiber blieben nach ihren geprüften Quellständen unverändert.

## Frühere Nachweise

| Prüfung | Stand |
| --- | --- |
| [Windows 41377964400](https://github.com/FBForge/fbforge-connect/actions/runs/41377964400) | Bestanden, Quelle `da295974c97a455f4bb2680255474897447992c0`, normale und Offline-Installation |
| [Vorheriger Windows-Kandidat 41369493912](https://github.com/FBForge/fbforge-connect/actions/runs/41369493912) | Bestanden, Quelle `56581d7` |
| [Scanner-Einzelprüfung 41369095465](https://github.com/FBForge/fbforge-connect/actions/runs/41369095465) | Drei reale Einrichtungen aus dem geprüften Paket mit sauberer Datei, EICAR und Prozessende bestanden |
| [Installer-Probe 41372279187](https://github.com/FBForge/fbforge-connect/actions/runs/41372279187) | Bestanden, derselbe validierte Installer mit Testtreiber `e85be47` ohne FIT-Connect-Zugang |
| [SDK-Matrix 41377423105](https://github.com/FBForge/fbforge-connect/actions/runs/41377423105) | Vollständig bestanden, Quelle `1bef705`, ausdrücklich ohne installierte Oberfläche |
| [Installierte Client-Abnahme 41385865809](https://github.com/FBForge/fbforge-connect/actions/runs/41385865809) | Vollständig bestanden, Installer aus `da29597`, Testtreiber `29f1646`, Umfang ausdrücklich `installed_ui_only` |
| [Reguläre CI 41385851855](https://github.com/FBForge/fbforge-connect/actions/runs/41385851855) | Bestanden, Testtreiber `29f1646`, Produktcode unverändert |
| [Website-Deployment 41381860547](https://github.com/FBForge/fbforge/actions/runs/41381860547) | Main `ed812c4`, aktuelle 0.3-Hilfe und als Vorschau gekennzeichnete Produktbilder veröffentlicht |

Diese früheren Nachweise gehören zu ihren jeweiligen Produktständen.
Die damaligen Änderungen von `da29597` bis `29f1646` betrafen ausschließlich den
Abnahmetreiber und die Dokumentation. Aktuelle Zahlen und Quellstände stehen oben.

## Umfang der Live-Abnahme

Die Nachweise umfassen die separate SDK-Matrix und die installierte Windows-App.
Die Oberfläche wird über WebView2 und native Dialoge bedient.
Ausschließlich echte TEST-Zugänge, fiktive Inhalte und eine eigene Test-Destination
werden verwendet. Profilsicherungen bleiben im temporären Benutzerbereich.

- SDK-Matrix: API v2/v3, JSON/XML, Anlagen, 5-MiB-Fragmentierung, signierte Event Logs,
  Empfangsbestätigungen, Absenderbeschränkung und Schlüsselwechsel.
- Antworten im geöffneten geprüften Vorgang nach bestätigter Annahme. Die Reihenfolge
  folgt der [FIT-Connect-Anleitung](https://docs.fitko.de/fit-connect/docs/sdks/lernen/empfangen-und-antworten):
  empfangen, prüfen, annehmen, im Case antworten.
- Lesbare Schemaabweichungen, Sammelannahme, begründete manuelle Annahme/Ablehnung,
  PDF-Vorschau und bytegenaue Einzel-/Gesamtexporte mit nativen Downloads-Dialogen.
- Geschützte Profile und Sicherungen, Fokus, alle Arbeitsbereiche, Hell/Dunkel/System,
  eigene Antwortschemas, Prozessnachrichten, Eingangsalter und Favoriten.
- Alle sechs Testablauf-Schritte anhand tatsächlicher Nachrichten. Zugeordnete Profile
  und gespeicherter Fortschritt werden nach regulärem Fensterschließen wiederhergestellt.
  Ergebnisse bleiben historische Prüfungen. Weitere Schritte erfordern erneutes Laden
  und ausdrückliche Aktionen. JSON-Abweichungen zeigen Pfade und Soll-/Ist-Werte,
  Anlagenabweichungen die betroffene Datei. XML bleibt ein exakter Vergleich.
- Authentifizierter CONNECT-Proxy für OAuth und FIT-Connect bei unveränderter TLS-Prüfung.
  Die separate Online-Probe bestätigt auch GitHub-Download und FreshClam über diesen Proxy,
  Abbruch, Wiederholung und geprüfte Datenbanken. SDK-/Schema-Proxy-Konfiguration und
  Schutz der Proxy-Zugangsdaten sind zusätzlich durch Java-Regressionen abgedeckt.
- ClamAV mit sauberen Dateien und lokalem EICAR-Test. EICAR wird nicht an FIT-Connect
  übertragen. Harmlose kontrollierte ICAP-Befunde prüfen Dateisperre und signierte
  Annahmeprobleme. Signaturupdates bleiben beim Seitenwechsel bedienbar und abbrechbar.

## Zusätzliche Fehler und Regressionen

- Das automatische Laden der Schlüssel konnte nach einem bestätigten Profilwechsel
  die Navigation des Testablaufs abbrechen. Ein reproduzierender Test der vollständigen
  App und Controller-Tests prüfen den Wechsel während eines offenen Schlüsselabrufs.
  Die gewünschte Aufgabe, Empfangs-Destination und der Einreichungseingang werden
  übernommen. Abbruch und fremde laufende Aktionen bleiben geschützt.

- Nach dem regulären Neustart startet auch ClamAV seine Datenbank neu. Der
  Abnahmetreiber wartete nur beim ersten App-Start auf dessen Betriebsbereitschaft.
  Die App verweigerte die Inhaltsfreigabe während des Starts korrekt mit
  `scanner_busy`. Beim Fortsetzen des Durchlaufs wartet der Treiber jetzt auch nach
  dem Neustart auf den tatsächlichen Bereitschaftsstatus und die aktive Scanner-Zuordnung.
  Es wird keine Einreichung automatisch erneut gesendet oder bestätigt.

- Der native Schließdialog benötigte explizite Ereignis-Empfangsrechte. Die minimale
  Freigabe für An-/Abmeldung behebt den Fehler, ohne Senden von Ereignissen aus
  der Oberfläche zu erlauben. Berechtigungstest, Oberflächentest und reguläres
  Schließen/Neustarten des installierten Clients sichern den Pfad ab.

- NVDA-Abnahme aktiviert den nativen WebView-Eingabebereich vor der ersten
  Sprachprüfung. Beschriftung und tatsächlicher NVDA-Fokus müssen weiterhin
  übereinstimmen. Ein PowerShell-Funktionstest sichert die Initialisierung ab.
- Verspätete Scanner-Konfiguration überschreibt keine Eingaben und versteckt keinen
  laufenden Abbruch. Reproduzierende Oberflächentests prüfen beide Fälle.
- FreshClam erzeugte bei erfolgreicher Einrichtung rund 1,6 MB Fortschrittsausgabe
  und überschritt die 64-KB-Hilfsprozessgrenze. Sein stiller Modus behebt die falsche
  Fehlermeldung. Ein echter Testprozess reproduziert Ausgabeüberschreitung und Erfolg.
  Ausgabe-, Zeit-, Abbruch- und Speichergrenzen bleiben erhalten.
- Abgebrochene Profilwechsel lassen den Arbeitsbereich unverändert. FIM-Abfragen
  blockieren den Java-Kommandokanal nicht mehr.
- Update-Abbruch umfasst auch das Warten auf Antwort-Header. Native Tests verwenden
  einen echten lokalen TLS-Server mit testbezogenem Vertrauen und signierter,
  nicht ausführbarer Paketattrappe bei aktiver Versionsprüfung.

Ein Windows-CI-Versuch meldete bei der lokalen Scanner-Installation nur
`scanner_install_failed`. Die Ursache ist aus diesem alten Sammelcode nicht
bestimmbar. Drei gezielte Wiederholungen und der Scanner-Schritt im nachfolgenden
vollständigen Bautest haben Einrichtung, sauberen Scan, EICAR-Erkennung und
Prozessende bestanden.
Die CI-Diagnose erfasst bei erneutem Auftreten nur den eigenen Installationszustand,
Dateisystem-Fehlernummern und freien Speicher. Der ursprüngliche Fehler bleibt ein
fehlgeschlagener Test. Ein nicht reproduzierter Fehler wird nicht als behoben ausgegeben.

Der erste abschließende TEST-Lauf wurde vom Zustelldienst beim v2-Anlagen-Upload
mit HTTP 500 `internal-server-error` nach rund 57 Sekunden abgebrochen. Die vorherige
Ankündigung hatte HTTP 201 geliefert. Der Client meldete korrekt einen ungewissen
Ausgang und versendete nicht automatisch erneut. Die eigene Test-Destination wurde
deaktiviert. Die Wiederholung bestand v2/v3 mit JSON/XML, Prozessnachrichten und
Ablehnung. Später brach erneut ein v2-Anlagen-Upload mit HTTP 500 nach rund
54 Sekunden ab, während v3 weiter funktionierte. Die installierte Client-Abnahme
wird deshalb separat ausgeführt. Die vollständige SDK-Matrix wurde anschließend
mit neuen fiktiven Daten erfolgreich ausgeführt, einschließlich beider
Absenderbeschränkungsproben und des Schlüsselwechsels.

## Website und verbleibende Freigabe

[0.3-Anleitung](https://fbforge.de/connect/hilfe/0.3/start), gemeinsame Farben,
Hell-/Dunkelmodus, Favicon, aktuelle Bilder und Nginx-Routen sind veröffentlicht.
Website-Prüfung: 66 Python-Fälle, Kontakt-API-Tests, 178 Browserprüfungen und beide
Nginx-Konfigurationen. Hilfe und Inspect-Routen lieferten öffentlich HTTP 200.
0.3 ist als Vorbereitung gekennzeichnet. Downloads zeigen weiterhin auf das
veröffentlichte App-Paket.

STAGE und PROD sind auf ausdrücklichen Wunsch nicht Teil dieser Live-Abnahme.
Der Eigentümer übernimmt die Freigabe des endgültigen Main-Stands, seine Signierung
und Veröffentlichung sowie das vollständige Update auf ein echtes neueres signiertes Paket.
Die erste Version mit Updater wird manuell installiert.

Überholte Actions-Läufe werden nach der Abnahme bereinigt. Aktuelle erfolgreiche
Nachweise und benötigte Paketquellen bleiben erhalten. Frühere Berichte und ersetzte
Bilder sind in Git nachvollziehbar. Aktuelle Ansichten stehen unter `docs/guide/images/`.
