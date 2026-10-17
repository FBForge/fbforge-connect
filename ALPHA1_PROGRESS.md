# Alpha-1-Umsetzung

Work-Goal: [ALPHA1_GOAL.md](ALPHA1_GOAL.md). Stand: **dev.8-Kandidat, noch keine Alpha-1-Freigabe**.

Öffentlicher Produktname: **FBForge Connect**, Zusatz **Integrationstests für FIT-Connect**. Fenstertitel, Installer und Projektbeschreibung verwenden diesen Namen. App-/Speicher- und NSIS-Upgrade-Identitäten bleiben für bisherige Dev-Installationen kompatibel; eine eigene, zur FBForge-Farbfamilie passende Bildmarke ist eingebunden.

| Paket | Implementierung und Nachweis |
| --- | --- |
| A: Austausch / Ereignisse / Quittierung | v2/v3-Anfragen und Replies, Empfang nach Neustart, bestätigte Annahme/Ablehnung, signierte Case-/Submission-/Reply-Logs. Reale vollständige Windows-TEST-Abnahme erfolgreich. |
| B: Geschützte Profile | Optionales Windows-DPAPI, Checkpoints vor Veröffentlichung privater Schlüssel, Wiederherstellung, Secret-Wechsel, Profilname, geschützte Sicherungen und Standard-Zustellpunkte. Einzelnes Inventar mit Zweck, Fingerabdruck, Zertifikatslaufzeit und Vorgangszuordnung; gezieltes Entfernen einschließlich geladener Paarkopien. Vorbereitete/ungewisse SDK-Schlüsselvorgänge bleiben gesperrt. Native SDK-, Rust-, Browser- und tatsächliche Windows-Installationsprüfung einschließlich DPAPI-Profil erfolgreich. |
| C: Zustellpunkte / Schlüssel | Geführte v3-Anlage, exaktes authentifiziertes Rücklesen, getrennte Aktivierung, Angebotsbearbeitung, Schlüsselwechsel bis zehn Ziele und bestätigte Bereinigung nie aktivierter Entwürfe. Typ C ohne langlebige Schlüssel. Anlage, DPAPI-Neustart, Aktivierung, Rotation und anschließender Austausch real auf Windows geprüft. |
| D: BPMN / Prozesskommunikation | Lokaler Viewer mit Tastatur, ausdrückliche/prüfsummengebundene Kennungen, Empfängersuche und Versandentwurf. v3-Prozess-Submission/-Reply einschließlich Schema und Ereignissen real erfolgreich geprüft. |
| E: Fachdaten / UX / Wartbarkeit | Schemaabhängige JSON-/XML-Formularansicht, Originalwerte und Herkunft; offizielle unveränderliche FIM-Beispiele mit fiktiven Werten geprüft. Einheitliche Dateiablage mit Drag-and-drop und Tastatur-Dateiauswahl für alle Importe, einschließlich verschlüsselter Profilsicherungen. Eigene reduzierte Projektbildmarke für App und Installer. Explizite externe Schemafreigabe, lokale Demo, Formatierung/Lint und automatisierte Barrierefreiheits-, Fokus- und Reflow-Prüfungen. Manuelle Zielgeräte-/Screenreader-Abnahme bleibt offen. |
| F: Freigabe | Windows-Installerbau, DPAPI, echte Neuinstallation, Upgrade von dev.7 sowie Profil-Erhalt nach Neustart/Deinstallation bestanden. Abschließender Paketlauf ergänzt Prüfsumme/Build-Manifest. Signierungs-/Zielgeräteentscheidung und privater Meldeweg bleiben offen. macOS/Linux erfordern einen gesonderten sicheren Speicher und Zielabnahmen. |

## Nachweise

- [Vollständiger realer Windows-TEST-Lauf 38988235240](https://github.com/FBForge/fit-connect-testclient/actions/runs/38988235240), Commit `9503027`: v2/v3 mit JSON/XML, bytegleichen Fachdaten/Anlagen, 5-MiB-Fragmentfall, Reply nach Prozessneustart, beiden Quittierungen und signierten Logs. Zusätzlich v3-Prozessnachricht/-Reply, technische Ablehnung sowie Rotation mit anschließendem neuen Austausch. Sieben getrennte fiktive Einreichungen; keine Lastprüfung und keine automatischen Schreibwiederholungen.
- [Windows-Build 38986412179](https://github.com/FBForge/fit-connect-testclient/actions/runs/38986412179), Commit `58cd105`: Formatierung, native/Frontend-/Browser-Prüfungen, tatsächliche DPAPI-Verträge und unsignierter Installer erfolgreich.
- [Erneute vollständige Windows-TEST-Abnahme 38990315338](https://github.com/FBForge/fit-connect-testclient/actions/runs/38990315338), Commit `c4783c4`: alle sieben Austauschfälle mit Schlüsselübersicht und Profilvorgaben im Produktstand erfolgreich. Windows-Installation/Upgrade laufen separat.
- Neuer lokaler Paketstand: 228 Java-Host-Tests erfolgreich; 11 isolierte native Verträge einschließlich Altdatenmigration der Voreinstellungen; Windows-Cross-Compile und paketierter Engine-Smoke erfolgreich. 15 bisherige Browserabläufe einschließlich öffentlicher FIM-/XML-Fälle bestanden; zwei zusätzliche Dateiablageprüfungen ebenfalls erfolgreich. Die abschließende UX-Nachprüfung von sechs betroffenen Abläufen ist erfolgreich. 34 Frontend-Vertragsdateien einschließlich Abgleich nativer Befehle, Berechtigungsdefinitionen, Hauptfenster-Freigaben und unveränderter Installer-Vorlage bis auf zwei geprüfte Registry-Zeilen erfolgreich. Der vollständige neue Kandidat erhält eigene Windows-CI.
- [Tatsächliche Windows-Installation/Upgrade 39037553713](https://github.com/FBForge/fit-connect-testclient/actions/runs/39037553713), Commit `06a7ee2`: installierte Anwendung bytegleich zum gebauten Binary, FBForge-Connect-Upgrade-Identität, beide SDKs mit gebündeltem Java bei bereinigtem PATH, natives synthetisches DPAPI-Profil, erneuter Start, Deinstallation mit Profil-Erhalt und Upgrade von dev.7 erfolgreich. Der Installer wurde danach als Actions-Artefakt `windows-alpha-unsigned-setup` bereitgestellt.
- [Erneuter Live-Lauf 38991770845](https://github.com/FBForge/fit-connect-testclient/actions/runs/38991770845), Commit `09888fe`: alle sieben realen Austauschfälle auch mit gemeinsamer Dateiablage und neuer Bildmarke erfolgreich. Die spätere Namensfestlegung auf FBForge Connect ändert das Austauschprotokoll nicht.
- Installationskorrekturen: Die optionale Tauri-Bündeltypänderung wird für den einzigen Windows-Pakettyp NSIS ohne Updater durch `--no-binary-patching` unterbunden; der bytegenaue Programmvergleich bleibt streng. Das CI-Hilfsprogramm erzeugt sein synthetisches Profil direkt aus Produkttypen und vermeidet PowerShell-JSON-/Pipe-Kodierung. Beide Korrekturen sind im tatsächlichen Installations-/Upgrade-Lauf bestätigt.
- `npm audit` über den gesperrten Baum einschließlich Entwicklungs-/Axe-Abhängigkeiten: keine bekannten Schwachstellen am 17. Oktober 2026. Zielabhängige Rust-Befunde und BSI-Grenzen stehen in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## Wesentliche Live-Korrekturen

Normale v3-Einreichungen öffnen einen Case implizit; eine zusätzliche explizite Case-Eröffnung war unzulässig. Typ-C-Zustellpunkte registrieren keine langlebigen Schlüssel. Reale Pflichtkontakte, null/leere CC-Listen und die offizielle TEST-Ereignisausstellerkennung sind berücksichtigt. SDK4 erwartet Metadaten-/Fachdaten-Authentifizierungstags in umgekehrter Konstruktorreihenfolge zu SDK3; ein unabhängiger Regressionstest reproduzierte den Fehler vor der Korrektur. Alle korrigierten Kernpfade wurden anschließend live bestätigt.

Am bereitgestellten TEST-Absender fehlten Metadatenversionen. Die vollständige CI-Abnahme ergänzte ausschließlich 2.0.0/3.0.0 per authentifiziertem, gezieltem PATCH und prüfte das öffentliche Rücklesen. Schlüssel und andere Einstellungen wurden nicht verändert. Der Client erklärt fehlende Reply-Versionen nun vor dem ersten Versand. Beim Quittieren nach Rotation wird der gewünschte Signaturschlüssel ausdrücklich gewählt; alte Schlüssel bleiben vorhanden.

Die API verlangt nach Deaktivierung zuvor aktiver Zustellpunkte eine Aufbewahrungsfrist. Automatische Testziele sind deshalb inaktiv und ohne Routing-Freigabe aufbewahrt; bekannte IDs/Fristen und Grenzen stehen in [LIVE_TESTS.md](LIVE_TESTS.md). Ein ungewisser älterer Versuch wurde nicht erneut geschrieben.

## Verbleibende Freigabepunkte

1. Abschließenden Paketlauf mit beigefügter Installer-Prüfsumme und Build-Manifest bestätigen. Die eigentliche Installation/der dev.7-Upgrade-Nachweis ist bereits erfolgreich ([INSTALLATION_TESTS.md](INSTALLATION_TESTS.md)).
2. Reale Zielgeräte mit Tastatur/Screenreader und Windows-Skalierung 125/150/200 Prozent; Behördenproxy/Endpoint-Schutz soweit für die Verteilung erforderlich.
3. Konkrete Herausgeber-/Signierungsentscheidung. Der aktuelle Installer ist unsigniert.
4. Privaten Sicherheitsmeldeweg gemäß [SECURITY.md](SECURITY.md) einrichten.
5. Abschließende Release-Unterlagen, Prüfsummen und bekannte Grenzen auf den tatsächlich geprüften Build beziehen. Keine Alpha-Veröffentlichung allein aufgrund eines grünen Teiltests.

Die Anwenderanleitung steht in [BEDIENUNG.md](BEDIENUNG.md), die Kandidatenhinweise in [RELEASE_NOTES.md](RELEASE_NOTES.md). Der Workflow erzeugt Prüfsumme und Build-Manifest erst nach bestandener Installation. Die Umbenennung des Repositorys in `fbforge-connect` ist weiterhin beauftragt; die verfügbare GitHub-Verbindung bietet dafür derzeit keinen Verwaltungsbefehl. Workflow-Referenzen verwenden bereits die stabile Repository-ID beziehungsweise den aktuellen Repository-Namen.

Die gewünschte Plattformprüfung ist abgeschlossen: Für vollständiges macOS/Linux wären sichere native Speicher, zielabhängige Pakete und weitere Sicherheits-/UI-Abnahmen nötig. Das ist kein kleiner Zusatz vor Alpha 1; siehe [PLATFORM_ASSESSMENT.md](PLATFORM_ASSESSMENT.md). Windows bleibt zunächst der Freigabeumfang.
