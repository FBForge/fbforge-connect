# Folgepaket: Vorgänge und Anlagen

Status: geplanter Zusatz zum Alpha-Umfang auf Basis des Anwenderfeedbacks. Dieser Plan beschreibt die nächsten Änderungen; die Vorgangsablage und PDF-Vorschau sind noch nicht umgesetzt. Die bisherigen Austausch-, Quittierungs- und Berechtigungsgrenzen bleiben Abnahmekriterien.

## Ziel

Empfangene und gesendete Testnachrichten lassen sich wie in einem kleinen Fachverfahren erneut öffnen: verständlicher Titel, Fachdaten, Anlagen, Prüfstand, Annahme/Ablehnung, Antworten und Ereignisse gehören zu einem Vorgang. Die Anwendung bleibt ein Testwerkzeug und erhält keine allgemeine Aktenverwaltung.

Der aktuelle Code bietet bereits eine sitzungsgebundene Kennungsübersicht, die letzten Versandversuche sowie PNG-/JPEG- und JSON-/XML-/Textvorschauen. Eine vollständige Ablage der Nutzdaten fehlt. PDFs werden bisher ausschließlich heruntergeladen.

## 1. Empfang als Arbeitsplatz

- Den vorhandenen Empfangsbereich um eine Vorgangsliste mit Detailansicht ergänzen. Eine Zeile öffnet den Antrag direkt; bereits geladene und geprüfte Inhalte werden nicht bei jedem Ansichtswechsel erneut abgerufen.
- Liste mit Titel, Eingang, Zustellpunkt, Status, Anlagen- und Antwortanzahl. Titel aus vorhandenen Metadaten beziehungsweise Schema-/Leistungsbezeichnungen ableiten; sonst einen verständlichen Datums-/Typnamen verwenden. Keine Bedeutung unbekannter Fachdatenfelder erraten. Technische UUIDs bleiben in den Details erreichbar.
- Zwischen lokal vorhandenen Vorgängen und neu vom Dienst abzurufenden Nachrichten unterscheiden. Ein vom Dienst nach Annahme nicht mehr lieferbarer Inhalt verschwindet nicht deshalb aus der ausdrücklich gewählten lokalen Ablage.
- Suche und Filter für Titel/Kennungen, Zustellpunkt, Zeitraum und Bearbeitungsstand. Mehrere Submissions und Replies über ihre tatsächliche Case-ID zusammenhalten; unbekannte Versandausgänge erhalten eine lokale Vorgangskennung, keine erfundene Case-ID.
- Nach dem Öffnen stehen Fachdaten im Vordergrund. Anlagen, Antworten und Ereignisse sind unmittelbar erreichbar. Transportinformationen und Rohdiagnosen bleiben als Zusatzdetails verfügbar.
- Der Leseaufruf „Antrag öffnen und prüfen“ kann Abruf, Entschlüsselung und technische Prüfung bündeln. Fehlende Schlüssel führen zur passenden Hilfe. Annahme, Ablehnung und Reply-Versand bleiben eigene bestätigte Schreibaktionen.
- Prüfungen getrennt darstellen: kryptographische Integrität, Schemaergebnis und manuelle fachliche Bewertung. Eine historische Prüfung wird mit Zeitpunkt angezeigt und nicht als neue Serverprüfung ausgegeben.

## 2. Verlauf und Aufbewahrung

Vorgeschlagener Standard: Vorgänge während der aktuellen App-Sitzung automatisch führen; verschlüsselte Aufbewahrung über Neustarts ausdrücklich je gespeichertem Profil einschalten. Ohne diese Option endet der Verlauf beim Schließen der Anwendung. Ein Profilwechsel filtert die Übersicht, vermischt aber keine Vorgänge und löscht nicht beiläufig den Verlauf eines anderen Profils. Abmeldung und erneute Verbindung entwerten weiterhin alte Servernachweise. Die gewählte Aufbewahrung muss im Arbeitsplatz sichtbar sein.

- Empfang und Versand verwenden dasselbe Vorgangsmodell. Senderseite zeigt gesendete Inhalte, Ziel, Ergebnis und zugeordnete Replies. Fehlgeschlagene und ungewisse Versandversuche bleiben unterscheidbar; ein Verlaufseintrag löst keinen erneuten Versand aus.
- Zu einem abgelegten Vorgang gehören ursprüngliche Fachdatenbytes, Anlagen, notwendige Metadaten, verfügbare Schema-Beschriftungen, Prüfzusammenfassung und bestätigte Bearbeitungsergebnisse. Originale werden nicht durch formatierte Vorschauen ersetzt.
- Wenn dauerhafte Ablage eingeschaltet ist, die gesicherte Inhaltskopie vor einer Annahme/Ablehnung anlegen. Scheitert die Ablage, darf kein Erfolg vorgetäuscht werden; die Anwendung erklärt den Fehler vor einer möglichen Quittierung.
- Inhalte nativ und verschlüsselt speichern, getrennt vom Zugangsdaten-/Schlüsseltresor. Große Anlagen nicht als Base64 in die auf 8 MiB begrenzte Profildatei schreiben. Benutzerbindung, Größenlimits, atomare Schreibvorgänge, Formatversion und Wiederherstellung nach Abbruch gehören zum Speicherentwurf.
- Nach Neustart sind lokal abgelegte Inhalte wieder lesbar. Profil, Rolle, API-Version und Zustellpunkt bleiben eindeutig zugeordnet. Ein Profilwechsel darf keine Vorgänge eines anderen Arbeitsplatzes einblenden.
- Alte Session-IDs, Proof-Handles und Schreibfreigaben werden nicht als Berechtigung wiederhergestellt. Eine Aktion aus einem abgelegten Vorgang benötigt erneut die passende native Prüfung und erforderlichenfalls aktuelle Serverabfragen. Ist das nicht möglich, bleibt der Vorgang lesbar und die Aktion wird verständlich gesperrt.
- Keine Nutzdaten in Local Storage, Diagnoseexporten, Logs oder ungeschützten Vorschaudateien. Der spätere Export ganzer Vorgänge ist ein eigener, ausdrücklich auszulösender Schritt und keine automatische Sicherung.

## 3. Direkt nutzbare Anlagenvorschau

- PNG/JPEG und JSON/XML/Text bleiben unterstützt. Ihre Darstellung wird mit Fachdaten und Anlagen derselben Detailansicht verbunden; der Wechsel benötigt keinen neuen Abruf des gesamten Antrags.
- PDF-Vorschau lokal mit einer festgelegten, geprüften PDF.js-Version und lokalem Worker aufbauen. Seitenauswahl, Zoom, Textauswahl und zugängliche Textdarstellung anbieten. Keine externe Upload-/Konvertierungsplattform verwenden.
- PDF-Skripte, Formularaktionen, automatische externe Abrufe, eingebettete Dateiaufrufe und ungeprüfte Linknavigation nicht ausführen. Dateityp anhand des Inhalts prüfen; Größe, Seiten-/Pixelaufwand und Laufzeit begrenzen. Abbruch und Freigabe der Vorschauressourcen vorsehen.
- Originale unverändert herunterladen können. Große, beschädigte, verschlüsselte oder nicht unterstützte Dateien erhalten eine verständliche Erklärung und weiterhin den Download.
- Für Formate ohne Vorschau direkt den Download anbieten, statt erst einen nutzlosen „Ansehen“-Dialog zu öffnen. HTML, SVG, Office-Dateien und ausführbare Inhalte erhalten dadurch keine aktive Vorschau.
- Im Empfang nur Inhalte des passenden geprüften Vorgangs zeigen. In der Senderansicht dieselbe Vorschau für die tatsächlich ausgewählten beziehungsweise versendeten Originaldateien nutzen.

## 4. Löschen und Orientierung

- Einzelne lokale Nachrichten beziehungsweise ganze lokale Vorgänge direkt entfernen können. Eine kurze Rückgängig-Möglichkeit ist einer Bestätigungsserie vorzuziehen; „Alle lokalen Vorgänge entfernen“ erhält eine klare Bestätigung mit Umfang.
- Entfernen räumt zugehörige lokale Inhalte, Vorschauressourcen und Indexeinträge auf. Es verändert keinen FIT-Connect-Serverstatus und entfernt keine Schlüssel oder Schutzsperren für ungeklärte Übertragungen. Diese Trennung muss in der Bedienhilfe verständlich sein.
- Bei Lösch-/Speicherfehlern den tatsächlichen Zustand zeigen. Kein angeblich gelöschter Vorgang bei fehlgeschlagenem Dateizugriff; keine stillschweigende Verwerfung älterer Anträge beim Erreichen eines Limits.
- Aufbewahrungsmodus, Speicherverbrauch und „Verlauf leeren“ an einem nachvollziehbaren Ort anbieten. Profilentfernung und Vorgangsentfernung bleiben ausdrücklich unterschiedliche Entscheidungen.
- Technische Diagnose als Werkzeug für Fehlerfälle behalten und unter den zusätzlichen Werkzeugen zurücknehmen. Für einen normalen Vorgang sind keine technischen Aufrufe erforderlich.
- Sichtbarer Tastaturfokus, verständliche Beschriftungen, kurze Hinweise, sinnvolle Fokus-Rückkehr und stabile Lesepositionen gehören zu allen Ansichten. Keine wesentliche Hilfe ausschließlich hinter einem Tooltip verstecken.

## 5. Umsetzungspakete

1. **Vorgangsmodell und Sitzungsablage:** Nativen `CaseRepository` mit begrenzten Inhalts-Handles vorsehen, von `case-context.js` als reiner Navigationshilfe trennen und Empfang, Quittierung, Versand und Reply gemeinsam anbinden. Inhalte beim Ansichtswechsel gezielt halten und beim Entfernen freigeben.
2. **Arbeitsplatz und Anlagen:** Vorgangsliste/Detailansicht, direkter Formularzugriff, Statuswechsel und gemeinsame Anlagenansicht umsetzen. PDF-Worker und dessen Berechtigungen, lokale Ressourcen und Drittanbieterhinweise prüfen. Bestehende `StructuredData`- und Bild-/Textvorschauen weiterverwenden.
3. **Geschützte Aufbewahrung:** Eigene versionierte Inhaltsablage mit benutzergebundener Schlüsselverwaltung, optionaler Profilzuordnung, Neustart, atomarer Aktualisierung und Löschung ergänzen. Die Profilverschlüsselung nicht durch eine unverschlüsselte Datenbank oder einen Klartext-Fallback ersetzen.
4. **Abnahme und Konsolidierung:** Vollständige Abläufe, Ressourcenlimits, gespeicherte Altdaten, Tastatur/Screenreader, Skalierung und den tatsächlichen Installer prüfen. Anschließend ein gemeinsames Featurepaket bereitstellen und die knappe Anwenderanleitung aktualisieren.

UI, Archivspeicher und FIT-Connect-Schreibaktionen erhalten getrennte Verantwortlichkeiten. Kein Ausbau von `App.vue` oder `SessionManager` zu einem weiteren Sammelmodul; gemeinsame DTOs und kleine, fachlich benannte Komponenten verwenden.

## 6. Tests und Definition „fertig“

- **Austausch:** v2/v3, JSON/XML, mit und ohne Anlage, Submission und Reply; Annehmen/Ablehnen und anschließendes erneutes Öffnen einschließlich der ursprünglichen Bytes. Bereits geprüfte Inhalte bleiben beim Wechsel zu einem anderen Vorgang erhalten.
- **Versand:** Inhalt der bestätigten nativen Vorschau ablegen; spätere Eingabeänderungen verändern den historischen Versand nicht. Erfolgreich, fehlgeschlagen und ungewiss unterscheiden; keine automatische Wiederholung.
- **Neustart und Grenzen:** Aktive Aufbewahrung über einen echten App-Neustart prüfen; deaktivierte Aufbewahrung, anderer Windows-Benutzer, Profilwechsel, defekte/vertauschte Dateien, Speicherlimit, Schreibabbruch und gesperrte Dateien abdecken. Nutzdaten nicht aus dem Schlüsseltresor oder dessen Backup beiläufig exportieren.
- **Berechtigung:** Fremder Vorgang, falsche Sitzung/API, manipulierte IDs sowie alte Proof-/Versand-Handles bleiben gesperrt. Eine gespeicherte Prüfzusammenfassung autorisiert keine neue Servermutation.
- **Anlagen:** Mehrseitige und formularhaltige PDF-Fixtures, PNG/JPEG, XML/JSON/Text, falscher MIME-Typ, beschädigte/große Dateien und aktive PDF-Inhalte testen. Netzwerkzugriffe und Skriptausführung aus Dokumenten müssen blockiert sein; Originaldownloads bleiben bytegleich.
- **Löschen:** Einzelne Nachricht, gesamter Vorgang und Gesamtlöschung einschließlich Anlagen prüfen. Andere Vorgänge, Profile, Schlüssel und Serverzustände bleiben erhalten. Offene Vorschauen schließen und Ressourcen tatsächlich freigeben.
- **UX und Zugänglichkeit:** Empfang → direkt lesen → Anlage ansehen → bestätigt annehmen/ablehnen → wieder öffnen → Reply vorbereiten ohne technische Zwischenansichten bedienen. Tastatur, Screenreader, leere Listen, lange Titel und 125/150/200 Prozent prüfen.

Fertig ist das Paket, wenn diese Abläufe mit echten SDKs und geeigneten fiktiven Daten bestehen, die Aufbewahrung verständlich gewählt und wieder entfernt werden kann und das geprüfte Windows-Paket denselben Stand enthält. Die Vorschau ersetzt keine Schadsoftwareprüfung; eine formale Fachverfahrens-/Aktenkonformität wird daraus nicht abgeleitet.
