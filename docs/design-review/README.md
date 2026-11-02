# Abnahmestand 0.3.0

Stand: 2. November 2026. Der Windows-Kandidat einschließlich der Korrektur der
Profilnavigation und seine vollständige installierte TEST-Abnahme sind bestanden.
Testzahlen sind keine gemessene Codeabdeckung oder Zertifizierung.

Die Entwicklungshistorie wurde anschließend auf Wunsch des Eigentümers von
101 auf 17 Themen-Commits zusammengefasst. Der vollständige Dateibaum blieb dabei
gegenüber `681fbd1` identisch. Danach wurde ausschließlich diese Herkunftsnotiz
ergänzt. Die folgenden Abnahmen gehören weiterhin zu den jeweils genannten
ursprünglichen Commit-IDs. Sie belegen den geprüften Inhalt, keine Signierfreigabe
für eine neue Commit-ID. Vor der endgültigen Signierung ist der resultierende
Main-Commit nach dem Release-Ablauf erneut zu validieren.

## Nachweise

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

Windows: 278 Java-Fälle, 242 Browserfälle einschließlich öffentlicher FIM-Schemata,
69 isolierte native Fälle und 72 Desktop-Fälle bestanden. Lokal sind alle 330 Skriptfälle
mit PowerShell ohne übersprungene Fälle bestanden. Windows überspringt zwei dort
nicht anwendbare POSIX-Dateirechtefälle, die lokal ausgeführt wurden.
Installation, Upgrade, Profilerhalt, Scanner-Auswahl, NVDA sowie Bau und Installation
des Offline-WebView2-Setups sind bestanden.
Die letzten Änderungen nach dem Windows-Quellstand betreffen ausschließlich den
Abnahmetreiber und die Dokumentation, keinen Produktcode. Ein früherer Windows-Versuch
scheiterte vor einem Browserseitenaufruf an `ERR_NO_BUFFER_SPACE`. Derselbe Quellstand
bestand anschließend auf einem frischen Runner alle 242 Browserfälle und die
vollständige Installation. Auch lokal bestanden alle 242 Fälle ohne Testwiederholungen.

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
