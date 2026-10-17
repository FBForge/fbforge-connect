# Abschließender Alpha-Test unter Windows

Die automatisierten Protokoll-, Installations- und ausgewählten NVDA-Prüfungen sind bestanden. Diese Abnahme ergänzt sie um die tatsächliche Bedienung auf einem Windows-Gerät. Ausschließlich eigene TEST-Zugänge und fiktive Daten verwenden.

## Vorbereitung

Den [geprüften dev.8-Kandidaten](https://github.com/FBForge/fbforge-connect/actions/runs/39046768207/artifacts/12106497088) herunterladen und die enthaltene Prüfsumme vergleichen. Der Installer ist unsigniert. Für den Austausch werden ein Onlinedienstzugang und ein Fachverfahrenszugang mit den erforderlichen TEST-Berechtigungen benötigt. Der Ablauf ist in [BEDIENUNG.md](BEDIENUNG.md) erklärt.

## Prüfliste

| Schritt | Erwartetes Ergebnis |
| --- | --- |
| Installieren und starten; bei vorhandener Dev-Installation vorher eine geschützte Sicherung exportieren und darüber installieren. „Komponenten prüfen“ aufrufen. | Ein Programmeintrag, korrekter Name und beide SDKs bereit. Vorhandene Profile bleiben erhalten. Kein separat installiertes Java erforderlich. |
| Mit dem Fachverfahrenszugang einen eigenen v3-Testzustellpunkt samt Testschlüsseln anlegen, geschützt speichern, Registrierung prüfen und separat aktivieren. | Verständliche Vorschau und Bestätigung; der eigene Punkt und die zugehörigen Schlüssel sind eindeutig erkennbar. Keine Routing-Freigabe erforderlich. |
| Eine Einreichung mit JSON-Fachdaten und einer kleinen Anlage senden, empfangen, prüfen und bestätigt annehmen; darauf antworten und das Reply auf Senderseite empfangen. Für v2 und v3 wiederholen; dabei auch XML verwenden. | Fachdaten und Anlage stimmen überein. Formular-/Quellansicht, Prüfungen, Reply und Quittierung funktionieren. Versand und Annahme erfolgen jeweils erst nach Bestätigung. |
| Die Case-, Submission- und Reply-ID des Vorgangs in der Ereignissuche mit dem passenden ID-Typ öffnen. | Die Ereignisse passen zum Vorgang und die Signaturprüfung ist erfolgreich. Ein nötiger zusätzlicher Kontext wird verständlich angefordert. |
| Vor einem noch ausstehenden Reply beide Profile geschützt speichern, die Anwendung vollständig schließen, neu starten und das Reply abrufen. | Erneute Verbindung und Entschlüsselung mit den gespeicherten Schlüsseln funktionieren. Secrets müssen nicht erneut eingegeben werden. |
| Unter „Prozesse“ das Demo-Modell öffnen; eine BPMN-Datei per Drag-and-drop und per Dateiauswahl laden, eine Nachricht anklicken und per Tastatur auswählen. Mit verbundener v3-Sitzung passende Prozess-Empfänger suchen. | Zugeordnete Kennungen erscheinen nachvollziehbar; die Suche liefert Treffer oder eine verständliche leere Ergebnisliste. Die Übernahme in einen Entwurf sendet nichts. Die echte Prozesskommunikation ist zusätzlich automatisiert live geprüft. |
| Fenster verkleinern, Hell/Dunkel wechseln und die Windows-Skalierung bei 125, 150 und 200 Prozent prüfen. Mit Tab/Shift+Tab und Escape durch Navigation, Verbindungsdialog und BPMN-Auswahl gehen. | Keine verlorenen Bedienelemente, sichtbarer Fokus, beschriftete Eingaben und verständliche Statusanzeigen; nach dem Schließen kehrt der Fokus zurück. |

Beim letzten Schritt mit einem verfügbaren Screenreader zusätzlich einen zusammenhängenden Ablauf ab App-Start ohne Maus ausführen und die hörbare Ausgabe bewerten. Das Secret-Feld muss geschützt angesagt werden. Der automatische NVDA-Test prüft ausgewählte Sprachsequenzen nach einmaliger WebView-Aktivierung per Klick; er ersetzt diesen vollständigen Ablauf nicht.

Einen eigens angelegten Testzustellpunkt nach Abschluss wieder deaktivieren. Die serverseitige Aufbewahrungsfrist beachten; keine vorhandenen fremden oder dauerhaft benötigten Zustellpunkte verändern.

## Ergebnis und Freigabe

Je Schritt „bestanden“ oder eine kurze Reproduktion festhalten: App-Version/Commit, Windows-Version, Skalierung und gegebenenfalls Screenreader-Version sowie erwartetes und tatsächliches Verhalten. Keine Secrets, privaten Schlüssel oder echten Antragsdaten in Screenshots oder Issues übernehmen. Sicherheitsprobleme gemäß [SECURITY.md](SECURITY.md) privat melden.

Die Bedienungsabnahme ist bestanden, wenn alle Schritte funktionieren und kein Fehler den Austausch, Schlüsselerhalt oder die Bedienung blockiert. Die Veröffentlichung folgt erst nach den verbleibenden Paket-, Signierungs- und Lizenzprüfungen aus [ALPHA1_PROGRESS.md](ALPHA1_PROGRESS.md). Wird das Paket danach geändert oder signiert, sind Installation/Upgrade und die betroffenen Abläufe am endgültigen Paket erneut zu prüfen.
