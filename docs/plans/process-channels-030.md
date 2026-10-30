# Goal 0.3.0: Prozessantworten und eigene JSON-Antwortschemas

Arbeitsbranch: `feature/process-channels-0.3.0`, ausgehend von `release/0.3.0`.
Nach erfolgreichen Prüfungen in den Release-Branch integrieren, Historie erhalten.
Kein PR, Main-Merge, Tag oder Deployment.

## Vereinbarter Umfang

- Übernommene BPMN-Zuordnungen als gemeinsame lokale Nachrichtenliste mit
  Modellkennung, Nachrichtenkennung und Schemahinweis bereitstellen.
- Beim Bearbeiten von Destination-Prozessnachrichten eine Modellzuordnung samt
  vorhandenem Schemahinweis ausdrücklich übernehmen. Region und übrige Angebote
  erhalten. Die Serveränderung bleibt ein eigener Vorschau-/Bestätigungsschritt.
- Beim v3-Versand mehrere erlaubte Prozessantworten direkt aus dem Modell auswählen
  oder anhand vereinbarter Kennungen hinzufügen. Maximal 16, keine Duplikate,
  Schemahinweise müssen passen. Beim Wechsel des Antwortschemas die Liste leeren.
  Empfänger dürfen weiterhin nur tatsächlich angebotene Prozessantworten senden.
- Unter „Testwerkzeuge → Antwortschemas“ einfache JSON-Schemas erstellen: ID mit
  Version, Bezeichnung, Beschreibung, editierbare Statuswerte und bis zu 32
  Zusatzfelder. Text, Zahl, Ganzzahl, Ja/Nein, Datum, Datum/Uhrzeit und Textliste;
  Pflichtangaben konfigurierbar. Keine XSD-Erstellung und kein BPMN-Editor.
- Schema (Draft 2020-12), fiktives Beispiel und bearbeitbaren Entwurf getrennt
  exportieren. Entwürfe begrenzt importieren. Keine automatische Speicherung in
  localStorage und keine automatische Veröffentlichung.
- In Destination-Einrichtung/-Verwaltung die `$id` aus einer JSON-Schema-Datei
  übernehmen. Im Versand nur ein bereits vom Empfänger angebotenes Antwortschema
  auswählen. Empfang und Antwort nutzen die vorhandenen lokalen Schema-Importe.

## Bedeutung eines eigenen Rückkanals

Eine fachliche Statusmitteilung ist weder technisches Accept noch Reject. Eine
Nachforderung schließt den Empfang nicht automatisch ab. Eigene Bezeichnungen
und Statuswerte sind mit der Gegenstelle zu vereinbaren.

FIT-Connect erhält eine Schema-Kennung, nicht automatisch den Schema-Inhalt.
Bei leistungsbezogenen Einreichungen muss der Empfänger sie als unterstütztes
Antwortschema anbieten; der Sender lädt dieses aktuelle Angebot und bietet den
Antwortkanal ausdrücklich an. Prozessantworten benötigen zusätzlich die
vereinbarten Kennungen und Metadatenversion 3.

Beide Seiten erhalten dieselbe Datei als lokalen Import oder über eine selbst
bereitgestellte HTTPS-Quelle. Eine URN ist keine Downloadadresse. Für inkompatible
Änderungen eine neue ID verwenden. Kein öffentlicher Schemahost und keine neuen
Website-Endpunkte erforderlich.

## Teststrategie

- Generator: Datentypen, Pflichtangaben, Status-Enums, Limits, mehrdeutige Felder,
  gefährliche Eigenschaftsnamen, URI-/UTF-8-Fehler und verlustfreier Entwurfimport.
- Dasselbe generierte Fixture wird gegen den Generator verglichen und von beiden
  echten SDK-Validatoren geprüft: fiktives Beispiel besteht; falscher Status,
  fehlende Pflichtangabe, falscher Typ und Zusatzfeld schlagen fehl. Offline.
- Browser: Dateidownload/Wiederimport, Angebotsübernahme ohne Serverwrite,
  Ablehnung nicht angebotener IDs, direkte Prozessauswahl und manuelle Kennungen,
  vorbereitete Metadaten, Duplikate, Schemaabweichung, v2-Abgrenzung,
  Tastatur, Dark Mode und schmale Ansichten.
- Vor Integration vollständige Frontend-/Java-Regression, Format-, Typ- und
  Dokumentationsprüfungen. Hilfe und Website aus gemeinsamer Quelle aktualisieren.
  Vor Veröffentlichung im endgültigen Windows-Paket abnehmen.

## Später: Integrationsszenarien als Abdeckungsmatrix

Szenario-Pakete sind noch nicht Teil dieser Umsetzung. Vorhandene Testfälle und
Testabläufe bleiben die Grundlage; kein zweites Ausführungssystem.

Zwei Betriebsarten:

1. **Eigene Gegenstellen:** getrennte Sender- und Subscriber-Profile sowie eigene
   TEST-Destinations. Bei vorhandenen Verwaltungsrechten Konfiguration vorbereiten,
   Unterschiede anzeigen und ausdrücklich bestätigen. Ohne Rechte einen
   Konfigurationsauftrag für den jeweiligen Administrator exportieren.
2. **Externes System als Prüfling:** FBForge Connect übernimmt nur die Gegenrolle.
   Das Szenario beschreibt die Einrichtung und wartet auf die externe Sendung,
   Antwort oder Empfangsbestätigung. Zugangsdaten des Prüflings sind nicht erforderlich.

Der Konfigurationsauftrag enthält Rollen, Umgebung/API, Destination-Typen,
Leistung/Prozesskennungen, Metadatenversionen, Schema-IDs und -Dateien,
Antwortangebote und Berechtigungen/Absenderbeschränkungen. Keine Secrets,
privaten Schlüssel oder echten Antragsdaten in exportierten Szenarien.

Voraussetzungen, einzelne bestätigte Aktionen, beobachtete Ergebnisse und
Erwartungen trennen. Kunden-Destinations nie automatisch verändern. Aufräumen
nur für selbst angelegte TEST-Ressourcen unter Beachtung serverseitiger
Aufbewahrung. Ungewisse Schreibausgänge lesend abgleichen, nicht wiederholen.

Abdeckungsdimensionen: v2/v3; JSON/XML; Leistung/Prozess (nur v3);
mit/ohne Antwortkanal; fachliche Antwort/Prozessantwort; ohne/eine/mehrere Anlagen;
Schemaabweichung, fehlende Rechte, fehlendes Schema, Scannerfund/-ausfall,
Verbindungsabbruch und Neustart. Ungültige Kryptografie gezielt lokal prüfen;
keine manipulierten Nachrichten an fremde Empfänger senden.

Nicht alle Kombinationen sind sinnvoll oder erlaubt. Die Matrix unterscheidet
bestanden, fehlgeschlagen, nicht ausgeführt, wartet auf Gegenstelle und nicht
anwendbar. Kernabläufe vollständig prüfen, weitere Kombinationen aus konkreten
Risiken ableiten. Keine pauschale Behauptung „deckt alles ab“.
