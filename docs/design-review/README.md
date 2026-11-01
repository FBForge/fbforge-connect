# Abnahmestand 0.3.0

Stand: 31. Oktober 2026. Automatisierte Live-Abnahme in FIT-Connect TEST bestanden.
Dies ist der Nachweis für den genannten Kandidaten, keine Freigabe eines später
veränderten Main-Pakets oder eine vollständige Sicherheits-/Barrierefreiheitszertifizierung.

## Geprüfter Kandidat

| Nachweis | Stand |
| --- | --- |
| [Windows-Validierung 41226794001](https://github.com/FBForge/fbforge-connect/actions/runs/41226794001) | Produkt-Commit `fc050678d084b0a259b902e445cca6502fa940f7` |
| [Vollständiger Live-Lauf 41233271432](https://github.com/FBForge/fbforge-connect/actions/runs/41233271432) | Genau dessen installierter Windows-Kandidat, Treiber `0bb2336` |
| [Scanner-Abbruchprobe 41234366430](https://github.com/FBForge/fbforge-connect/actions/runs/41234366430) | Derselbe Kandidat, Treiber `8c461fe`, ohne TEST-Zugänge oder Schreibzugriffe |
| [Reguläre CI 41233271440](https://github.com/FBForge/fbforge-connect/actions/runs/41233271440) | 276 Java- und 61 Windows-Kernfälle bestanden |

Lokal bestanden zusätzlich 233 Oberflächen- und 317 Skripttests einschließlich
PowerShell ohne übersprungene Fälle. Ubuntu-CI übersprang drei PowerShell-Fälle und
einen lokal zusätzlich geprüften Browserfall. Testzahlen sind keine gemessene Codeabdeckung.

## Umfang

Die installierte App wurde mit echten TEST-Zugängen über WebView2 und native Dialoge
bedient. Die native Grenze wurde nicht ersetzt. Ausschließlich fiktive Inhalte und
eine eigens angelegte Destination wurden verwendet. Schlüssel und Profilsicherungen
blieben im temporären Benutzerbereich und wurden nicht als Artefakte hochgeladen.

- Native JSON-/XML-Nachrichten über v2/v3 mit Anlagen, Antworten und 5-MiB-Fragmentierung,
  signierten Event Logs, Annahme/Ablehnung, Absenderbeschränkung und Schlüsselrotation.
- UI-Anmeldung, API-Wechsel, Inhaltsprüfung, PDF-Vorschau, Antworten, Empfangsentscheidungen,
  lesbare Schemaabweichungen, Sammelannahme und begründete manuelle Ablehnung.
- Bytegenaue Einzel-/Gesamtexporte, Downloads als Vorgabe, Abbruch und native Dialoge.
- Profilbearbeitung, Fokus-Rückgabe, geschützte Sicherung, Überschreibschutz und
  Wiederherstellung des eigenen Testprofils.
- Prozessnachrichten, Eingangsalter und Filter, Favoriten, alle sechs Ablauf-Schritte
  anhand tatsächlicher Nachrichten, Ergebnisexport und bewusstes Zurücksetzen.
- App-Neustart mit geschützten Testpaketen, Ablaufdefinitionen, Vorgängen und
  profilbezogener Speicherpräferenz. Bestätigtes Löschen der Testsammlungen.
- Alle Arbeitsbereiche, Hell/Dunkel/System und Fokus-Rückgabe.
- Offline eingerichteter ClamAV bei echten Nachrichten. Kontrollierte harmlose
  ICAP-Anlagenbefunde über v2/v3 mit gesperrter Datei und exaktem signierten
  Annahmeproblem. Kein EICAR an FIT-Connect übertragen.
- Echter FreshClam-Update bei weiter bedienbarer Versandseite. Separat tatsächlichen
  laufenden Update abgebrochen, Abbruch bestätigt und weiterhin bereiten Scanner geprüft.
- Eigenes Antwortschema, Beispiel und Entwurf exportiert/importiert. Kennung nur am
  eigenen Zustellpunkt registriert und echte passende Antwort geprüft und bestätigt.
- Echte GitHub-Updatesuche mit korrekt gemeldetem fehlendem Release-Feed.

## Zusätzlich gefundene Fehler

| Fehler | Korrektur und Regression |
| --- | --- |
| Aktiver Scanner beim Öffnen als ausgeschaltet angezeigt | Gemeinsamer Monitor behält die Zustandsführung. Drei zuvor fehlgeschlagene Fälle für lokalen Scanner, ICAP und Profilwechsel, anschließend 27 gezielte Fälle grün. Commit `b1b29d3`. |
| Gespeicherte Antwortschemas trotz API-Rücklesung als ungewiss angezeigt | Reihenfolge von Leistungen/Schemakennungen normalisieren, echte Abweichungen und Wiederholungssperren erhalten. 18 Verwaltungstests und echter Schema-Rundlauf bestanden. Commit `fc05067`. |

[Scanner in Hell](images/scanner-state-light.png) und
[Dunkel](images/scanner-state-dark.png): tatsächliche Vue-Komponente mit fiktiven
Daten, keine Aufnahmen der Sitzung mit echten Zugangsdaten.
Der frühere 0.2-Designbericht und erledigte Planungsunterlagen bleiben in Git nachvollziehbar.

## Verbleibende Freigabepunkte

- Authentifizierte STAGE-/PROD-Abnahme mit passenden Zugängen und V-PKI.
- Erstmalige Online-Einrichtung der Scanner-Komponente. Der geprüfte Start war offline.
- Integriertes Update mit neuerem veröffentlichtem signierten Paket.
- Öffentliche 0.3-Anleitung vor dem Release bereitstellen.
- Endgültigen Main-Commit und sein signiertes Veröffentlichungspaket erneut abnehmen.

Die Test-Destination `edf3e725-6614-4dd0-a594-b60e654bc506` wurde deaktiviert.
Früheste serverseitige Löschung: 30. November 2026, 19:24:18 UTC. Überholte Actions-Läufe
wurden nach der Abnahme bereinigt. Die oben verlinkten erfolgreichen Nachweise bleiben erhalten.
