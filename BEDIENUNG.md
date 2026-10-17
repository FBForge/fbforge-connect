# FBForge Connect: erster Testvorgang

FBForge Connect simuliert die beiden Seiten eines FIT-Connect-Austauschs: Ein **Onlinedienst** sendet einen Antrag; ein **Fachverfahren** empfängt und prüft ihn und kann fachlich antworten. Alle Schritte verwenden ausschließlich **TEST und erfundene Daten**. TEST-Zugänge und die nötigen Berechtigungen müssen bereits vorhanden sein.

## 1. Arbeitsplatz verbinden

Unter **Verbinden** API v3 und die passende Rolle auswählen und den zugehörigen Client-Zugang eingeben. Für ältere Integrationen ist v2 separat auswählbar. Ein Zugang für den Onlinedienst erhält dadurch keine Fachverfahrensrechte.

Optional ein benanntes Profil speichern. Windows schützt Zugangsdaten, Schlüssel und Antwortkanäle für das angemeldete Benutzerkonto. Ohne Speicherung gelten Schlüssel nur für die Sitzung. Eine geschützte Sicherung lässt sich unter Verbindung exportieren oder importieren; sie ist an die zugehörigen Windows-Benutzerschlüssel gebunden und kein frei übertragbarer Export.

## 2. Empfang vorbereiten

Als Fachverfahren unter **Zustellpunkte** einen vorhandenen eigenen TEST-Zustellpunkt wählen oder mit v3 einen neuen anlegen. Der Assistent führt durch Testanwendung, Fachdaten und Schlüssel/Vorschau. Neue private Schlüssel werden geschützt gesichert; nur öffentliche Teile werden registriert. Ein neu angelegter Zustellpunkt wird gesondert aktiviert.

Für einen vorhandenen Empfangszustellpunkt müssen dessen passende private Schlüssel verfügbar sein. Neu erzeugte Schlüssel können alte verschlüsselte Nachrichten nicht entschlüsseln. Beim Schlüsselwechsel alte private Schlüssel für noch offene Nachrichten aufbewahren.

## 3. Antrag senden

Als Onlinedienst **Senden** öffnen, Empfänger sowie dessen angebotene Leistung beziehungsweise Nachricht und Schema wählen. Fiktive JSON-/XML-Daten eingeben oder Dateien ablegen; Anlagen können separat hinzugefügt werden. Jede Dateiablage bietet auch die normale Dateiauswahl per Tastatur.

Fachdaten lokal visuell prüfen und anschließend den Versand vorbereiten. Erst die ausdrückliche Bestätigung überträgt den Antrag. Für eine spätere fachliche Antwort muss ein geeigneter Antwortkanal angeboten werden. Die Vorgangs- und Einreichungskennung erscheinen nach dem Versand.

## 4. Antrag empfangen und prüfen

Als Fachverfahren **Empfangen** öffnen, Zustellpunkt wählen und verfügbare Einreichungen laden. Eine Einreichung abrufen und mit ihren passenden Schlüsseln entschlüsseln und prüfen. Die Formularansicht zeigt vorhandene Werte und – soweit eindeutig verfügbar – Bezeichnungen aus dem Schema. Originalfelder und Herkunft bleiben nachvollziehbar. Anlagen separat ansehen oder speichern.

Technische Integrität, Schema-Prüfung und fachliche Bewertung sind unterschiedliche Ergebnisse. Eine technisch gültige Nachricht ist nicht automatisch fachlich richtig. Ein fehlender Malwarescanner wird ausdrücklich angezeigt.

## 5. Empfang quittieren und fachlich antworten

Unter **Empfang abschließen** ausdrücklich annehmen oder ablehnen und die Aktion bestätigen. Das ist eine technische Empfangsquittung.

Eine **Antwort (Reply)** ist dagegen eine eigene fachliche Nachricht mit Fachdaten und gegebenenfalls Anlagen. Die angebotenen Antwortmöglichkeiten laden, ein passendes Schema wählen, die Antwort prüfen und vorbereiten und gesondert bestätigen. Eine Antwort nimmt den ursprünglichen Antrag nicht automatisch an oder lehnt ihn ab.

Auf der Onlinedienst-Seite die Antwort mit dem zugehörigen Antwortkanal empfangen und prüfen; auch deren Empfang wird separat quittiert. Nach einem Neustart benötigt diese Seite das zuvor geschützte Profil mit Antwortschlüssel und Kontext.

## 6. Ereignisse nachvollziehen

Unter **Event Log** zwischen gesamtem Vorgang (Case), Einreichung (Submission) und Antwort (Reply) wählen. Die angezeigten Kennungen aus dem Versand- oder Empfangsergebnis übernehmen. Je nach Suchart werden zusätzliche Vorgangs- oder Zustellpunktangaben benötigt; die Oberfläche zeigt die Felder. Der Client prüft Signaturen und Zuordnung, bevor er Ereignisse als geprüft anzeigt.

Bei **ungewissem Übertragungsausgang** nicht einfach nochmals senden: zuerst den bekannten Vorgang beziehungsweise seine Ereignisse prüfen. So wird ein möglicherweise bereits übermittelter Antrag nicht versehentlich dupliziert.

## 7. Prozessnachrichten aus BPMN vorbereiten

Unter **Prozesse** ein BPMN-Modell per Dateiablage öffnen oder zunächst den fiktiven Demo-Prozess wählen; dafür ist keine Anmeldung nötig. Eine Nachricht im Diagramm oder in der Tastaturliste auswählen. FIT-Connect-Kennungen müssen ausdrücklich im Modell oder einer zu dessen Prüfsumme passenden Zuordnung stehen. Anzeigenamen allein reichen nicht aus.

Mit einer berechtigten v3-Sitzung passende Prozess-Zustellpunkte suchen und die Auswahl in einen Entwurf übernehmen. Ein Modellklick versendet nichts. Der Client ist ein Nachrichten-Testwerkzeug und führt keinen vollständigen BPMN-Prozess aus.

## Hilfe und Grenzen

**Diagnose** prüft die beiden lokalen SDKs und erstellt einen begrenzten technischen Bericht ohne Fachdaten, Zugangsdaten oder private Schlüssel. Für weiterführende Informationen gibt es die offizielle FIT-Connect-Dokumentation. Versionsabhängige Grenzen und noch offene Alpha-Abnahmen stehen in [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md).

Ein bereits aktivierter TEST-Zustellpunkt lässt sich nach der Deaktivierung aufgrund der serverseitigen Aufbewahrungsfrist nicht sofort löschen. Ein deaktiviertes Testziel ist deshalb nicht automatisch ein unbereinigter Fehler. FBForge Connect zeigt den zulässigen Zustand; eine Umgehung ist nicht vorgesehen.
