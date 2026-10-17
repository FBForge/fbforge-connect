# dev.9: Vorgänge, Vorschauen und Anwendungshilfe

Geprüfter Funktionsstand: `60c9287ce47c873901337ea47428ac3a8ff36ee8`. Das Paket erweitert den Entwicklungsstand; es erstellt keine Alpha-Freigabe, keinen Release-Tag und keine produktive Nachricht.

## Funktionsumfang

- Native Kopien gesendeter und empfangener Einreichungen und Replies, einschließlich Fachdaten, Anlagen, Metadaten und verfügbarer Schemaquellen. Ungeprüfte Abrufe enthalten nur Transportinformationen. Die Zuordnung zur tatsächlich angefragten Nachricht wird vor der Inhaltsübernahme geprüft.
- Profil-/API-bezogene Vorgangsübersicht mit Suche, direkter Formularansicht, Originaldownloads, Einzellöschung und bestätigter Gesamtlöschung. Auch die Verbindung eines gespeicherten Profils ohne Schlüsselwiederherstellung erlaubt das Lesen seiner lokalen Kopien.
- Automatischer Verlauf für die Anwendungssitzung; dauerhafte Windows-Aufbewahrung nur nach ausdrücklicher Wahl. Der Inhaltsspeicher ist vom Schlüsseltresor und dessen Backup getrennt. Versionierte DPAPI-Blöcke binden Profil, API, Datensatz, Revision und Position. Atomare Dateiersetzung verdrängt keine gültige Kopie durch einen unvollständigen Schreibvorgang.
- Vor einer Empfangsbestätigung muss eine aktivierte Sicherung gelingen. Speichergrenzen vor dem Versand werden als lokale Blockade gemeldet. Fehler beim anschließenden Sichern eines erfolgreichen Versands ändern dessen Serverergebnis nicht und lösen keine Wiederholung aus. Eine fehlgeschlagene erste Speicheraktivierung aktiviert die Aufbewahrung nicht stillschweigend.
- Lokale PDF-Darstellung mit eigenem, abbrechbarem Worker, Seitenwahl und auslesbarem Text. Skripte, Formulare, Verweise und eingebettete Dateien werden nicht ausgeführt. Die Testdatei enthält tatsächlich JavaScript-OpenAction, AcroForm und einen externen Link. HTML/SVG/Office und ausführbare Dateien erhalten keine Vorschauaktion.
- Zwölf lokale Hilfethemen mit neun Bildschirmaufnahmen tatsächlicher Komponenten und fiktiver Daten. Kompakte Abbildungen sind vergrößerbar; die Themenübersicht ist direkt erreichbar. Keine externen FIT-Connect-Dokumentationslinks oder Zugangsdaten in den Bildern.

## Prüfungen

- **JavaScript:** 176 erfolgreiche Vertrags-/Regressionstests, einschließlich Speichergrenzen vor der Übertragung, sichtbarer Checkpoint-Fehler nach Erfolg und begrenzter NVDA-Aufzeichnung.
- **Browser:** vollständiger Ablauf mit Vorgängen, PDF-Seiten, bytegleichem Download, inaktiven Dokumentaktionen, Profilwechsel, Einzellöschung, Gesamtlöschung, fehlerhafter Speicherzustimmung, Replies und Hilfe. Axe-Prüfungen und 125/150/200 Prozent sind enthalten. Die Windows-Pipeline besteht den endgültigen Satz von 25 Abläufen.
- **Java/SDK:** 235 erfolgreiche Tests der Gesamtsuite sowie ein erfolgreicher Smoke-Test der gebündelten Engine; zusätzliche Archivfälle prüfen unveränderte Bytes nach Proof-Verwerfen/Quittierung, unveränderliche Versandkopien, eindeutige Reply-Zuordnung, Aufwertung ungeprüfter Informationen, Profilisolation und Grenzen ohne Verdrängung.
- **Windows-Speicher:** 14 erfolgreiche isolierte Tests und 15 Desktop-Tests. Die Speicherprüfungen verwenden die produktive DPAPI-Implementierung und decken erneutes Öffnen, atomaren Ersatz, unterbrochene Staging-Dateien, vertauschte Profile/APIs, manipulierte Daten und Löschung ab. Archivkopien stellen keine Proofs oder Serverberechtigungen wieder her.
- **CodeQL:** alle fünf Analysen für Java/Kotlin, JavaScript/TypeScript, Rust, Python und Actions erfolgreich. Das npm-Audit meldet keine bekannten Schwachstellen der aufgelösten JavaScript-Abhängigkeiten.

Interaktiv wurden die echte Browseroberfläche und ihre Komponenten mit fiktiven Daten bedient: Navigation, Verbindungseingabe, schemaabhängige Formularbeschriftungen, wieder geöffnete Vorgänge, Anlagen, PDF-Seiten und Hilfe. Dies ist von den automatisierten Browser- und Windows-Prüfungen zu unterscheiden.

## Reale TEST-Kommunikation

[Lauf 39061438414](https://github.com/FBForge/fbforge-connect/actions/runs/39061438414) auf `697ed5b2c64be017b838c00b488d02fdb3501856` besteht alle sieben echten Austausche: v2/v3, JSON/XML, Anlagen/Fragmentierung, Replies nach Kernneustart, Prozesskommunikation, Annahme/Ablehnung, signierte Submission-/Reply-/Case-Ereignisse und Schlüsselwechsel. Zusätzlich werden die nativen Versandkopien und die Originalbytes empfangener Nachrichten nach der Quittierung verglichen. Dieser Nachweis gehört zu diesem Quellstand; spätere lokale Speicher-, Fehler- und UX-Korrekturen werden durch die Paketabnahme des oben genannten Endstands ergänzt.

Der dafür erzeugte eigene Zustellpunkt ist deaktiviert. Seine serverseitige Aufbewahrungsfrist steht in [LIVE_TESTS.md](../LIVE_TESTS.md). Zugangsdaten stammen ausschließlich aus Actions-Secrets; OAuth-Secrets und private Schlüssel werden nicht protokolliert oder als Artefakt veröffentlicht.

## Windows-Paketnachweis

Der abschließende [Lauf 39063273538](https://github.com/FBForge/fbforge-connect/actions/runs/39063273538) prüft den oben genannten Funktionsstand einschließlich Neuinstallation, Upgrade von dev.7, erhaltenem Profil, beiden tatsächlich mitgelieferten SDKs und NVDA 2026.2.

Der anfangs auf 256 Einträge begrenzte CI-Rekorder war für den erweiterten Tastaturweg zu klein. Er ist jetzt auf 4096 Einträge begrenzt und signalisiert Erschöpfung ausdrücklich. Der Regressionstest prüft die Kapazität; die Windows-Abnahme muss weiterhin echte NVDA-Sprachsequenzen für alle 13 Bedienelemente erzeugen. Es werden keine erwarteten Sprachausgaben synthetisiert und keine Assertions entfernt.

Der vollständige Lauf ist erfolgreich: beide Jobs, alle 25 Browserabläufe, Neuinstallation, Upgrade und 13 NVDA-Kontrollen. Der unabhängige Downloadabgleich bestätigt:

- Installer: `FBForge Connect_0.1.0-dev.9_x64-setup.exe`, **56370091 Bytes**.
- Installer-SHA-256: `859355daa84d362d8169c2471a701bbea256c7496d6202b9e012cf2a713aaf55`.
- [Setup-Artefakt](https://github.com/FBForge/fbforge-connect/actions/runs/39063273538/artifacts/12112642005), ZIP-SHA-256: `06d8fccad611370741a6aee7b0ccf69cd8a74f1e21580a33271ce97cfbecba2b`.
- [NVDA-Artefakt](https://github.com/FBForge/fbforge-connect/actions/runs/39063273538/artifacts/12113005786), ZIP-SHA-256: `f0ca23c999828c0096060693c531cfc13c7726a01c063c0f74cc9e0a40df7e43`.

ZIP-Größen/Digests, Setup-Hash, Manifest-Version `0.1.0-dev.9`, Repository, Commit, Lauf-ID und PE-Kennung wurden geprüft. Der NVDA-Bericht referenziert genau denselben Installerhash und denselben Quellstand. Seine 13 eindeutigen Namen sind tatsächlich in den erzeugten Sprachsequenzen enthalten; native Tab-Bedienung und Dialog-Fokusrückkehr sind bestanden. Temporäre Download-URLs wurden nicht in die Dokumentation übernommen.

## Grenzen des Nachweises

Die NVDA-Prüfung beobachtet echte erzeugte Sprachsequenzen mit stillem Synthesizer und native Tastaturereignisse; sie ist keine manuelle auditive Gebrauchstauglichkeitsprüfung. Die anfängliche WebView-Aktivierung erfolgt durch einen Klick in ein leeres Feld. Die Skalierungstests ersetzen keine physische Monitor-/DPI-Abnahme. Eine vollständige BSI-, WCAG- oder Aktenführungskonformität wird nicht behauptet.

Die optionale Vorgangsablage ist kein revisionssicheres Archiv. Ein abrupter Prozessabbruch während eines Versands kann den anschließenden lokalen Checkpoint verhindern; Serverereignisse und ein ungewisser Ausgang müssen dann gesondert geprüft werden. Eine bereits entschlüsselte Empfangskopie wird bei aktivierter Aufbewahrung vor ihrer Quittierung gesichert. Exporte, Betriebssystem-Sicherungen und ein garantiertes physisches Überschreiben von SSD-Daten liegen außerhalb der Löschfunktion der Anwendung.
