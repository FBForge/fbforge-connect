# FBForge Connect: Arbeitsplan bis Alpha 1

Stand: 16. Oktober 2026. Freigegebenes Work-Goal: Umsetzung durch den Nutzer beauftragt. Alpha-Freigabe bleibt an dokumentierte Live- und Windows-Abnahme gebunden. Ausgangspunkt ist `develop`, Commit `bc12b4ad0f0f47a77024e82a070dc2df993da438`, Version `0.1.0-dev.7`.

## 1. Ziel und Abgrenzung

Alpha 1 ist ein professioneller Windows-Testarbeitsplatz für Behörden, Integratoren und Entwickler. Ein Anwender kann einen TEST-Arbeitsplatz einrichten, eigene Zustellpunkte anlegen, normale Einreichungen und Antworten austauschen, Fachdaten und Anlagen prüfen, den Vorgang im Eventlog nachvollziehen und v3-Prozessnachrichten aus einem BPMN-Modell vorbereiten.

Der vom Nutzer festgelegte Produktname lautet **FBForge Connect**, mit dem Zusatz **Integrationstests für FIT-Connect**. Frühere interne Speicher-/Upgrade-Kennungen bleiben zur Kompatibilität erhalten. TEST ist die einzige Umgebung. V3 ist Standard; v2 bleibt für kompatible Versand-/Empfangs-/Reply-/Eventlog-Tests erhalten. Neue Zustellpunkt-Schreibverwaltung und BPMN-Prozessfunktionen werden ausschließlich für v3 gebaut. Für nicht unterstützte Kombinationen zeigt die Oberfläche die Voraussetzung vor der Aktion.

Nicht Bestandteil dieser Alpha: PROD-/Stage-Freigabe, Routing-Debugger, Support-Administrationsfunktionen für fremde Zustellpunkte, ZBP-Adapter, vollständiger BPMN-Editor oder Prozessmotor, universeller FIM-Formular-Editor, Lasttests. Ein einfaches Finden passender Empfänger gehört dagegen zum regulären Versand.

## 2. Gesicherter Ausgangsstand und offene Nachweise

dev.7 enthält die native Schemaprüfung für Reply-Entwürfe, schemaabhängige Beschriftungen und eigene verifizierte Reply-Eventlogs. SDK-Tests prüfen Anfrage und Antwort mit Anlagen in allen vier v2/v3-Kombinationen. Der Windows-Workflow einschließlich Rust-Tests und Installerbau war erfolgreich. Die zusammengeführten Java-Tests umfassen 194 Fälle; 22 Frontend-Testdateien und Browser-Ablaufprüfungen sind erfolgreich.

Das ist noch keine Live-Abnahme: V2-Versand war früher erfolgreich; der aktuelle Stand muss mit berechtigten FIT-Connect-TEST-Zugängen erneut real geprüft werden. Frische Windows-Installation und Upgrade sind ebenfalls offen. Ein grüner Build ersetzt diese Nachweise nicht.

Installer dev.7: https://github.com/FBForge/fbforge-connect/actions/runs/38967495361/artifacts/12076405136

## 3. Technische Leitlinien und Definition „fertig“

- Wartbarkeit und intuitive UX/UI sind Abnahmekriterien jedes Pakets: klare Modulgrenzen, dokumentierte Schnittstellen, passende Tests und nachvollziehbare Fehlerbehandlung. Keine unnötigen Abhängigkeiten oder spekulativen Abstraktionen.
- Für Mitwirkende Architektur, Einrichtung, Tests und Contribution-Ablauf dokumentieren; Formatierung, Linting, Typ-/Vertragsprüfungen und Tests in CI verankern.
- Fachliche Abläufe müssen auch ohne IT-Vorkenntnisse verständlich sein: geführte Einrichtung, Beispiele, Begriffsdefinitionen, Orientierung und konkrete Fehlerhilfe.
- WCAG 2.2 AA als Prüfziel, soweit auf die Windows-Desktop-Anwendung anwendbar: Tastatur, Fokus, Kontrast, zugängliche Beschriftungen, Screenreader und Skalierung. Keine ungeprüfte Konformitätsbehauptung.

- Die vorhandene Vue-/Tauri-/Java-Architektur mit getrennten SDK-Adaptern bleibt bestehen. SDK-/API-Verträge werden gegen die tatsächlich eingebundenen Versionen geprüft. Ältere Dokumentationsbeispiele werden nicht als v3-Vertrag übernommen.
- Jede Mutation hat einen nativen, an Sitzung, API, Ziel und unveränderliche Vorschau gebundenen Schreibauftrag. Vorbereiten, Anzeigen oder ein BPMN-Klick schreiben nichts auf TEST. Ein unbekannter Übertragungsausgang führt zur Statusklärung, nicht zum automatischen Wiederholen.
- Native Prüfungen sind maßgeblich. Die Oberfläche kann keine Berechtigung oder Prüfbestätigung selbst erzeugen. Sitzungswechsel entwerten offene Vorschauen, Schlüsselzuordnungen und Prüfbezüge.
- Technische Integrität, Schema-Prüfung und manuelle fachliche Bewertung bleiben getrennte Ergebnisse. Eine Schema-Prüfung bestätigt keine fachliche Richtigkeit.
- Fehler werden verständlich erklärt, mit nächstem Handlungsschritt und freigegebenem technischem Code. Diagnosen enthalten keine Secrets, Schlüssel oder Fachdaten.
- Externe Schema-/Codelistenabrufe bleiben kontrolliert und begrenzt. Lokale Dateien und Modelle erhalten Größen-/Zeitlimits; DTD/XXE, Pfadübertritte und aktive Inhalte bleiben ausgeschlossen.

## 4. Paket A: Durchgängiger Vorgang und Eventlog-Suche

**Ergebnis:** Einreichung und Reply sind ohne manuelles Zusammensuchen ihrer Kennungen nachvollziehbar und abschließbar.

Implementierung:

1. Gemeinsames Vorgangsmodell für Case ID, Submission ID, Reply ID, beteiligte Zustellpunkte, API-Version und bekannte Prozessbezüge einführen. Native Nachweise bleiben sitzungsgebunden; wiederhergestellte Metadaten müssen vor einer Aktion neu geprüft werden.
2. Versandresultate und Empfang führen direkt in eine Vorgangsansicht: Antrag, Antworten, Anlagen, technische Prüfungen und Ereignisse. Ein neuer Entwurf übernimmt nur ausdrücklich ausgewählte Kontextdaten.
3. Annahme/Ablehnung empfangener Replies in der Oberfläche vervollständigen, einschließlich Begründung und Ergebnisanzeige. Fachliche Antwort, technische Empfangsquittung und Annahme des ursprünglichen Antrags sind getrennte Aktionen.
4. Eventlog-Suche nach Case ID, Submission ID oder Reply ID. Weil diese Kennungen dieselbe UUID-Form haben können, gibt es eine explizite Typauswahl; bekannte Vorgänge liefern den Kontext automatisch.
5. Case-ID-Suche lädt die berechtigten Ereignisse des Vorgangs. Einzelne Submission-/Reply-IDs werden über erlaubte Detailabfragen oder den bekannten lokalen Kontext zugeordnet. Wo die API zusätzlichen Kontext benötigt, wird dieser angefordert. Keine globale ID-Suche oder Existenzauflistung fremder Vorgänge versprechen.
6. Case-Logs benötigen eine eigene Mehrfach-Subjekt-Prüfung: erlaubte Ereignisarten, Signaturen, Aussteller, Case-Zuordnung und Seitenvollständigkeit prüfen. Die bisherige Prüfung genau einer Submission/eines Replies wird nicht einfach gelockert.
7. Zeitachse mit verständlichem Ereignisnamen, Zeitpunkt, Richtung und Subjekt; Filter für Nachrichtentyp/ID/Status. Token-Details bleiben eine Zusatzansicht. Unvollständige oder ungeprüfte Daten erscheinen nicht als vollständig verifiziert.

Tests/Abnahme:

- JSON und XML, mit/ohne Anlagen, normale Anfrage und Reply; alle vier kompatiblen v2/v3-Kombinationen, v3-Metadaten zusätzlich separat.
- Reply annehmen und ablehnen erzeugt nach Bestätigung genau eine erlaubte Aktion; Abbruch erzeugt keine. Fehlerhafte Inhalte lösen keinen automatischen Abschluss aus.
- Case mit mehreren Submissions und Replies; bekannte/unbekannte IDs, falscher ID-Typ, fehlende Rechte, leere Ergebnisse, mehrere volle Seiten, Signatur-/Aussteller-/Case-Manipulation und veraltete Sitzung.
- Timeout nach Schreiben zeigt ungewissen Ausgang; erneutes Lesen sendet nichts erneut.

## 5. Paket B: Optionale Profile und geschützter Schlüsselbestand

**Ergebnis:** Wiederkehrende Tests und Reply-Empfang funktionieren nach einem Neustart, wenn der Nutzer das Speichern aktiviert.

Entscheidung: Speichern anbieten, standardmäßig weiterhin sitzungsgebunden arbeiten. Unter Windows wird ein nativer, mit **DPAPI im Benutzerkontext** geschützter Speicher verwendet. Die Benutzerbindung wird erklärt; sie ist kein Schutz gegen bereits unter demselben Benutzer kompromittierte Prozesse. Kein Klartext-Secret in Local Storage, Konfigurationsdateien oder Diagnosen. Keine OAuth-Access-/Refresh-Tokens dauerhaft speichern.

Implementierung:

1. Benannte TEST-Profile mit Client ID, API-Voreinstellung, Standard-Zustellpunkten und Verweisen auf Schlüssel. Client-Secret und private JWKs liegen ausschließlich im nativen geschützten Bereich. UI erhält maskierte Metadaten und Handles.
2. Schlüsselbestand zeigt Zweck, `kid`, Fingerabdruck, Gültigkeit und Zuordnung. Importierte, generierte und ältere Entschlüsselungsschlüssel bleiben unterscheidbar.
3. Für ausstehende Replies auch benötigte Rückkanalschlüssel und Case-/Kanalbindungen geschützt sichern. Ein nur gespeichertes Client-Secret würde hierfür nicht reichen.
4. Nach Neustart neue Authentifizierung durchführen, Berechtigungen/Registrierung/Gültigkeit prüfen und neue native Nachweise aufbauen. Ein gespeicherter alter Prüfstatus autorisiert keine Aktion.
5. Funktionen: Speichern aktivieren, Profil wechseln, Secret ersetzen, gespeicherte Daten vergessen, einzelne Schlüssel entfernen und geschützte Sicherung ausdrücklich exportieren/importieren. Erforderliche Schlüssel für offene Vorgänge vor Entfernen kenntlich machen.
6. Atomare Speicherung, versioniertes Format und Migration; bei defektem oder nicht entschlüsselbarem Speicher verständlich abbrechen und sitzungsgebundene Nutzung anbieten. Keine stillschweigende Neugenerierung verlorener Schlüssel.
7. Personenbezogene Nutzdaten werden dadurch nicht automatisch archiviert. Lokaler Verlauf enthält nur die nötigen technischen Bezüge und ist löschbar.

Tests/Abnahme:

- Tatsächlicher Windows-Neustart der Anwendung: Profil wiederherstellen, neu verbinden, ausstehendes Reply mit erhaltenem Schlüssel empfangen.
- Anderer Benutzer/defekter Speicher/fehlender Schlüssel, Abbruch während Speichern, Profilwechsel, Migration sowie Vergessen und Reimport prüfen.
- Negativprüfung von Dateien, Frontend-Speicher und Diagnoseexport auf synthetische Test-Secrets. Sicherheitsgrenzen der nativen Schnittstelle prüfen.

## 6. Paket C: Eigene TEST-Zustellpunkte anlegen und Schlüssel verwalten

**Ergebnis:** Ein berechtigter Client richtet einen empfangsfähigen TEST-Zustellpunkt direkt in der Anwendung ein.

Voraussetzung: Vorhandener TEST-Account und Client mit erforderlichen API-Rechten. Die Anwendung beschafft keine Portalberechtigungen und erzeugt keine serverseitigen Client-Secrets.

Implementierung:

1. v3-Anlageassistent: Zweck/Rolle und unterstützter Destination-Typ, Name/Kontakt, Metadatenversionen, Leistungen/Regionen und Schemata bzw. Prozessnachrichten. Nur im aktuellen Vertrag verfügbare Typen anbieten.
2. Verschlüsselungs- und Signaturschlüssel lokal mit geeigneter Bibliothek und nach FIT-Connect-Vorgaben erzeugen. Für TEST selbst erzeugte Zertifikate unterstützen. Verwendungszweck, Laufzeit und Fingerabdruck anzeigen. Öffentliche JWK-/Zertifikatsteile von privaten Schlüsseln strikt trennen.
3. Vor einer Registrierung muss der private Teil geschützt gespeichert oder ausdrücklich als geschützte Sicherung gesichert sein. So entsteht kein aktiver Zustellpunkt, dessen Schlüssel mit dem nächsten Neustart verloren geht.
4. Vollständige Vorschau vor dem ersten Schreiben. Anlegen zunächst im zulässigen vorbereitenden Zustand, öffentliche Schlüssel registrieren, Serverzustand zurücklesen und Zuordnung prüfen. Aktivierung als eigener bestätigter Schritt. Die genaue Reihenfolge richtet sich nach dem realen v3-Vertrag.
5. Einrichtungszustand nach Teilausfall behalten: erstellt, Schlüssel registriert, Zuordnung gesetzt, aktiv. Keine blinden Wiederholungen einer möglicherweise erfolgreichen Anlage; soweit möglich anhand der bekannten ID klären, sonst manuelle Zuordnung anbieten.
6. Vorhandene eigene Zustellpunkte um benötigte Leistungs-/Schema-/Prozessnachrichtenverwaltung erweitern. Unbearbeitete Felder bleiben erhalten. Kein vollständiges PUT mit versehentlich fehlenden Feldern.
7. Schlüsselwechsel einzeln und für bis zu zehn eigene Zustellpunkte: je Ziel eigene Schlüssel als Standard, Vorschau und eindeutige Zuordnung, Registrierung vor Umschalten, Ergebnis/Teilfehler je Ziel. Alte private Entschlüsselungsschlüssel für noch wartende Nachrichten erhalten. Keine atomare Bulk-Transaktion behaupten.
8. Aktivieren/Deaktivieren und zulässige Bereinigung noch nicht aktivierter Testentwürfe anbieten. Endgültige Stilllegung und umfassende Löschverwaltung werden für diese Alpha nicht ausgebaut.

Tests/Abnahme:

- Generierte Schlüssel mit echtem SDK zur Verschlüsselung/Entschlüsselung und Signaturprüfung verwenden; falscher Zweck, abgelaufene Zertifikate und öffentliche/private Verwechslung blockieren.
- Fehlende Rechte, fremder Zustellpunkt, Statuskonflikt, externer Änderungsstand und Abbruch vor Bestätigung.
- Fehler nach jedem Einrichtungsschritt, verlorene HTTP-Antwort, Wiederanlauf nach Neustart und Teilfehler im Bulk-Schlüsselwechsel.
- Nachricht mit altem Schlüssel vor Rotation und neue Nachricht danach müssen beide entschlüsselbar bleiben.
- Live: eigenen TEST-Zustellpunkt anlegen, Schlüssel zuordnen, aktivieren, echte Testnachricht empfangen und erlaubten Testentwurf bereinigen.

## 7. Paket D: BPMN-Auswahl und v3-Prozesskommunikation

**Ergebnis:** Der Anwender wählt im Modell eine Nachricht, findet einen geeigneten Zustellpunkt und bereitet eine korrekt zugeordnete Prozessnachricht oder Antwort vor.

Implementierung:

1. BPMN-2.0-Datei lokal mit `bpmn-js` als Viewer öffnen; Zoom, Einpassen, Suche, auswählbare Nachrichtenflüsse und lesbare Detailseite. Keine Modellbearbeitung oder automatische Prozessausführung.
2. Nachprüfbare Zuordnung von Modell und Nachricht zu `processModelId`/`messageId`. FIT-Connect schreibt kein universelles BPMN-Mapping vor. Unterstützte Modellkonventionen anhand realer Beispiele dokumentieren; Kennungen nicht aus Anzeigenamen erfinden.
3. Bei fehlender/mehrdeutiger Zuordnung explizites Mapping anbieten und zusammen mit Modell-Prüfsumme/versionierter Referenz sichern. Nach Modellwechsel Zuordnung neu prüfen. Anzeige trennt BPMN-Element-ID, Nachrichtenreferenz und FIT-Connect-ID.
4. Klick übernimmt Modell-/Nachrichten-ID, Richtung und vorhandene Schemahinweise in einen Entwurf. Passende Empfänger über den v3-Prozessnachrichten-Suchendpunkt mit Region ermitteln; angebotene Nachricht und Schema am ausgewählten Ziel nochmals prüfen.
5. Vorgang korrekt führen: bestehenden Case fortsetzen oder den vom v3-Vertrag geforderten Leistungs-/Zustellpunktbezug für einen neuen Case angeben. Absender und berechtigte Teilnehmer berücksichtigen.
6. Zustellpunkt-zu-Zustellpunkt-Prozessnachrichten über Submission und angebotene Antworten über Reply unterscheiden. Reply-Kanal, unterstützte Antwortnachricht und Schema sind verbindlich; ein beliebiges BPMN-Element autorisiert keinen Reply.
7. Empfangene Prozessnachrichten im zugeordneten Modell hervorheben und mit Case, Daten, Anlagen und Eventlog verbinden. Hervorhebung bedeutet keine Bestätigung eines vollständig ausgeführten Prozesses.
8. Kleine mitgelieferte Demo mit fiktiven Daten und explizitem Mapping: Antrag, Nachforderung, Nachreichung und Rückmeldung. Die Demo funktioniert ohne Kundenquellcode.

Tests/Abnahme:

- Modelle mit/ohne IDs, doppelten/fehlenden Referenzen, Namensräumen und Erweiterungen; beschädigte/übergroße/gefährliche XML-Dateien.
- Ein Klick schreibt nichts, falsche oder mehrdeutige Zuordnung blockiert Übernahme, Modelländerung entwertet gespeichertes Mapping.
- Kein/ein/mehrere passende Zustellpunkte, Region, falsches Schema, nicht unterstützte Prozessnachricht und unberechtigter Case.
- SDK-Rundlauf mit Prozess-Submission und Prozess-Reply; echte TEST-Abnahme mit geeigneten Zustellpunkten und angebotenem Prozessschema.

## 8. Paket E: Verständliche Fachdaten und professioneller Arbeitsablauf

**Ergebnis:** Der Test-Client bleibt übersichtlich und sieht bei der Bearbeitung wie ein kleines Fachverfahren aus.

Dieses Paket wird gestalterisch schon zu Beginn festgelegt und in A–D laufend angewendet; am Ende folgt die Gesamtprüfung.

1. Hauptnavigation auf Senden, Eingang/Vorgänge, Prozesse und eigene Zustellpunkte konzentrieren. Profile/Verbindung global; Einstellungen, Diagnose und Info zurückhaltend erreichbar.
2. Feste Desktop-Hülle mit klarer Werkzeugleiste und geteilten Listen-/Detailbereichen. Eine primäre vertikale Scrollfläche je Arbeitsbereich; lange Tabellen und Quelltexte dürfen eigene notwendige Scrollbereiche haben. Eingaben und Auswahl bleiben beim Wechsel erhalten.
3. Empfangsansicht: übersichtlicher Kopf mit IDs und Status, danach Fachdaten, Anlagen, Antworten und Ereignisse. Technische Metadaten aufklappbar. Senden führt durch Empfänger, Inhalt und Prüfung/Bestätigung.
4. JSON-Schema-/XSD-Beschriftungen anhand einer kleinen versionierten Sammlung repräsentativer FIM-/XÖV-/XRepository-Beispiele prüfen und gezielt verbessern. Labels, Gruppen, Beschreibungen, Pflichtfelder und unterstützte Codebezeichnungen nur bei nachgewiesener Zuordnung anzeigen.
5. Originaldaten bleiben die Quelle der Werte. Bei fehlenden Informationen technische Namen und Feldpfade zeigen, unbekannte Felder erhalten; keine semantische Zuordnung aus ähnlichen Feldnamen behaupten. Codebezeichnung ergänzt den Originalcode.
6. Kleine Sammlung wiederverwendbarer fiktiver JSON-/XML-Testanträge mit Schema-/Versionsbindung; Vorlagenexport enthält keine Zugangsdaten oder privaten Schlüssel. Kein universeller Formular-Editor für Alpha.
7. Anlagenliste mit Größe/Typ, sichere Text-/Bildvorschau; weitere Formate nach sicher unterstützter Vorschau, sonst lokal speichern. Keine Ausführung eingebetteter Inhalte.
8. Erststart mit kurzer Einrichtungshilfe und Checkliste: Zugang, Schlüssel, Empfänger, erster Test. Tooltips und Hilfetexte erklären fachliche Begriffe und Voraussetzungen, auch per Tastatur erreichbar.
9. Keine direkten FIT-Connect-Dokumentationslinks in der Anwendung. Bei Bedarf allgemeiner Hinweis auf die ausführliche offizielle Dokumentation. Alle für typische Aufgaben nötigen Erklärungen direkt im Ablauf bereitstellen; wichtige Hinweise nicht nur in Tooltips verstecken.
10. Konsistente Typografie, Abstände, Icons mit Beschriftung, Statusfarben mit Text, sichtbarer Fokus, sinnvolle Tab-Reihenfolge und Fokus nach Dialogen. Hell/Dunkel, kleine Fenster und Windows-Skalierung 125/150/200 % prüfen. Kein Herstellerbanner; Lizenz und optionale Projekt-/Fehlerberichtlinks unter Info.

Tests/Abnahme:

- Gleiche Originalwerte vor/nach Darstellung; große Zahlen, leere Werte, doppelte JSON-Schlüssel, XML-Namensräume, Attribute und Wiederholungen.
- Reale Schemabeispiele mit erwarteten Labels und nachvollziehbarem Fallback, externe Referenzen/Codelisten nicht unbemerkt nachladen.
- Browser-Abläufe für typische Rollen statt Snapshots jedes kosmetischen Details; Tastatur, Fokus, Skalierung, lange Inhalte, leere/fehlerhafte Zustände.

## 9. Paket F: Stabilisierung und Alpha-Freigabe

1. Alle neuen nativen Protokolloperationen eng erlauben und versionieren; Zeitlimits, Abbruch und Aufräumen temporärer Dateien prüfen. Keine privaten Nutzdaten aus ungeprüften SDK-Fehlertexten anzeigen.
2. Vollständige automatisierte Prüfung unter Linux und Windows: Java-Adapter/Host, Rust-Protokoll, Frontend, gebündelte Engine, produktiver Frontend-Build und Installer. Windows-DPAPI ausdrücklich auf Windows testen.
3. Wiederholbare Browser-Abläufe für Einrichtung, Senden, Empfangen, Reply, Eventlog, Schlüsselwechsel und BPMN. Staging-/Prüfwerkzeuge bleiben aus dem Produktbuild ausgeschlossen.
4. Frisches Windows-System ohne separat installiertes Java/Node/Rust: installieren, starten, neue Profile/Schlüssel einrichten, Upgrade von dev.7, Datenmigration, Deinstallation mit bewusster Wahl zum Erhalt/Entfernen gespeicherter Daten. Netzwerk-/Proxyfehler verständlich anzeigen; keine globale TLS-Abschaltung.
5. Echte TEST-Abnahme mit fiktiven Daten: v2/v3-Anfrage und Reply, XML/XRepository, Anlage über Fragmentgrenze, Annahme/Ablehnung, Case-/Submission-/Reply-Log, Neustart-Empfang, eigene Zustellpunktanlage, Rotation und v3-Prozesskommunikation.
6. Testprotokoll je Fall mit Build, API-Version und Ergebnis. Nach gefundener Abweichung gezielter Regressionstest und betroffene Abnahme wiederholen. Keine Lasttests gegen öffentliche Infrastruktur.
7. Abhängigkeiten/Lizenzen, gepackte Dateien und Diagnoseexport prüfen. Installer-Prüfsumme, verständliche Release Notes, bekannte Grenzen, kurze Bedienanleitung und Datenschutz-/Speicherhinweise bereitstellen. Optionale Herstellerlinks gehören nicht in den normalen Arbeitsablauf.
8. Code-Signing und Herausgeberidentität klären. Falls für Alpha kein Signierzertifikat verfügbar ist, unsignierte Verteilung nur als klar bezeichnete, ausdrücklich vereinbarte Alpha-Ausnahme; Signierung nicht als bereits erledigt ausgeben.

### Abschließende Plattformprüfung

Auf Wunsch vom 17. Oktober 2026 folgt die Prüfung von macOS und Linux erst nach der funktionalen Stabilisierung und vor der Veröffentlichung. Zusätzliche Plattformen werden in Alpha 1 aufgenommen, wenn Build, gebündelte Engine und Bedienbarkeit ohne größere Umbauten zuverlässig unterstützt werden können. Gespeicherte Geheimnisse erfordern den macOS-Schlüsselbund beziehungsweise Linux Secret Service; es gibt keinen Klartext-Fallback. Plattformabhängige Abhängigkeiten, Sicherheitsbefunde, Installation und erforderliche Signierung/Notarisierung werden vor einer Zusage geprüft. Falls der Aufwand erheblich ist, bleibt Windows der Alpha-Schwerpunkt und der konkrete Mehraufwand wird dokumentiert. Ein erfolgreicher Cross-Build ersetzt keine Prüfung auf dem jeweiligen Betriebssystem.

## 10. Verbindliche Freigabekriterien

| Bereich | Alpha-1-Kriterium |
| --- | --- |
| Normaler Austausch | Reale TEST-Anfrage und Reply mit unveränderten Fachdaten/Anlagen; kompatible v2/v3-Pfade dokumentiert |
| Empfang | Entschlüsseln, getrennte Prüfergebnisse sowie bestätigte Annahme/Ablehnung für Submission und Reply |
| Ereignisse | Berechtigte Suche nach Case-, Submission- und Reply-ID; vollständige Seiten und korrekte Signatur-/Zuordnungsprüfung |
| Speicherung | Optionaler geschützter Speicher; Neustart erhält benötigte Schlüssel und Reply-Kontext; Vergessen funktioniert |
| Eigene Zustellpunkte | v3-Anlage, lokale Schlüsselgenerierung, öffentliche Registrierung, bestätigte Aktivierung und sicherer Schlüsselwechsel real geprüft |
| Prozesskommunikation | BPMN-Klick mit nachvollziehbaren IDs, Empfängersuche, v3-Prozess-Submission/-Reply und Empfangszuordnung |
| Fachdaten/UX | Repräsentative JSON-/XML-Schemata, sichere Anlagen, nachvollziehbare Darstellung, Tastatur und Windows-Skalierung |
| Verteilung | Grüner Windows-Build, frische Installation und Upgrade; dokumentierte Herausgeber-/Signierungsentscheidung |
| Fehlerverhalten | Kein stiller Datenverlust, kein doppelter Versand nach ungewissem Ausgang, keine Geheimnisse in Diagnose oder Browser-Speicher |

Bekannte wesentliche Defekte in diesen Kernabläufen blockieren die Bezeichnung Alpha 1. Nicht verfügbare TEST-Berechtigungen oder Windows-Abnahmen werden konkret als offene externe Abhängigkeiten ausgewiesen; der Kandidat darf bis dahin nicht als abgenommen gelten.

## 11. Reihenfolge, Lieferung und Freigabe

Reihenfolge: **UX-Grundstruktur und API-Vertragsmatrix → A → B → C → D → E-Gesamtprüfung → F**. Paket A kann ohne gespeicherte Profile fertiggestellt werden; B ist Voraussetzung für den verlässlichen Neustart-/Schlüsselworkflow in C. D verwendet Vorgänge aus A und eingerichtete Prozess-Zustellpunkte aus C. Tests entstehen im jeweiligen Paket.

Commits bleiben klein und reviewbar; Dev-Versionen/Installer entstehen an sinnvollen Meilensteinen: (1) Vorgänge + geschützte Profile, (2) Zustellpunkte + Schlüssel, (3) BPMN + Fachdaten/UX, (4) Alpha-Kandidat. Bei einem dringend benötigten Fehlerfix kann ein gesonderter Build sinnvoll sein. Kein Release pro Einzelfeature.

Nach Go wird dieser Plan in Roadmap und überprüfbare Paket-Checklisten im Repository übernommen. Bestehende Beta-Zuordnungen für Zustellpunktanlage, Schlüssel und BPMN werden ausdrücklich durch den neuen Alpha-Umfang ersetzt. Es werden keine nicht angeforderten Nachrichten an Dritte gesendet.

Arbeitsgoal zur Freigabe:

> FBForge Connect von dev.7 bis zu einem funktionsvollständigen Alpha-1-Kandidaten für TEST entwickeln: normale Einreichungen und Replies einschließlich Prüfung und Quittierung, Eventlogs über alle drei Kennungstypen, optionale geschützte Profile/Schlüssel, eigene v3-Zustellpunkte mit Anlage und Schlüsselwechsel sowie anklickbare BPMN-Prozesskommunikation. Professionelle, verständliche Desktop-Bedienung und automatisierte Tests je Paket. Alpha 1 erst nach dokumentierter Live- und Windows-Abnahme; konkrete externe Blocker gesammelt melden.

## 12. Empfohlener Reasoning Effort

**GPT-6.1 High als Standard** für die Umsetzung, UI, API-Anbindung und Tests. **XHigh gezielt** für Sicherheits-/Schreibverträge, DPAPI-/Schlüssellebenszyklus, Wiederanlauf nach Teilausfällen, BPMN-Zuordnungssemantik und abschließende Prüfung. Falls nur eine feste Einstellung gewählt werden soll: **High**, mit gezielter intensiver Überprüfung dieser Stellen. Ein dauerhaftes Max ist für dieses Vorhaben nicht erforderlich.

## 13. Richtung Beta 1

Beta folgt erst auf Alpha-Rückmeldungen. Kandidaten: mehr reale FIM-/XÖV-Profile und Codelisten, schemaabhängiger Eingabeeditor, bessere Szenarioverwaltung und Vergleiche, robustere Großdaten-/Anlagenbedienung, weitere Prozessmuster und mehr Automatisierung der Regressionen. Umfang wird anhand der Alpha-Nutzung festgelegt; PROD, ZBP und Routing-Debugger bleiben separate Entscheidungen.

## Offizielle Grundlagen

- [FIT-Connect-Dokumentation](https://docs.fitko.de/fit-connect/)
- [Event Log abrufen](https://docs.fitko.de/fit-connect/docs/getting-started/event-log/get-events/)
- [Prozessbasierte Kommunikation v3](https://docs.fitko.de/fit-connect/docs/major-release/fit-connect_3_0/new_features_3_0/): Prozess-IDs, Empfängersuche und Case-/Reply-Rollen; keine universelle BPMN-Kodierung vorgegeben.
- [Destination API](https://docs.fitko.de/fit-connect/docs/apis/destination-api/) und [SDK-Rezept Zustellpunkte](https://docs.fitko.de/fit-connect/docs/sdks/rezepte/zustellpunkte-verwalten/). Für die Umsetzung ist der konkrete v3-OpenAPI-/SDK-Vertrag maßgeblich.
- [Zertifikate für TEST](https://docs.fitko.de/fit-connect/docs/organisation-tasks/certificates/): selbst erzeugte Zertifikate in TEST möglich.
- [bpmn-js](https://bpmn.io/toolkit/bpmn-js/): Grundlage für den BPMN-Viewer.
- [Microsoft DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata): Grundlage des vorgeschlagenen benutzergebundenen Windows-Speichers.
