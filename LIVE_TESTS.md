# Reale TEST-Abnahme

Die native Abnahme verwendet ausschließlich TEST und fiktive Fachdaten. Sie ist kein Lasttest und ersetzt weder eine manuelle Installation noch die Bedienungsprüfung des Desktop-Clients.

## GitHub Actions

Der Workflow `.github/workflows/live-exchange.yml` läuft ausschließlich im Repository `FBForge/fit-connect-testclient` auf dem eigens vorgesehenen Branch `alpha1-live-tests`. Ein Push auf diesen Branch oder ein dort manuell gestarteter Lauf führt Schreiboperationen gegen TEST aus. Normale Pull Requests starten diese Abnahme nicht. Gleichzeitige Läufe sind ausgeschlossen; laufende Schreibvorgänge werden nicht durch einen neuen Push abgebrochen.

Erforderliche Repository-Secrets: `SENDERID`, `SENDERSECRET`, `SENDERDEST`, `SUBSCRIBERID`, `SUBSCRIBERSECRET`. Der Sender muss senden dürfen, der Subscriber Zustellpunkte verwalten und empfangen. `SENDERDEST` bezeichnet den bestehenden v3-Absenderzustellpunkt; dieser wird nicht verändert. Secrets stehen nur dem abschließenden Testschritt zur Verfügung und werden weder in Dateien noch in Artefakte geschrieben. Der Wert von Repository-Secrets kann über GitHub nicht zurückgelesen werden.

Der Ablauf baut die echten isolierten SDK-Adapter und die gebündelte Java-Laufzeit. Ein ausschließlich für CI gebautes Rust-Hilfsprogramm verwendet den produktiven Windows-DPAPI-Tresor, um Schlüsselarchive vor ihrer öffentlichen Registrierung beziehungsweise vor dem Veröffentlichen eines Reply-Kanals verschlüsselt zu sichern. Die Profile enthalten keine echten OAuth-Zugangsdaten. Private Archive werden ausschließlich über Prozess-Pipes übertragen und nicht ausgegeben. Der Test startet den nativen Kern neu und stellt Schlüssel darüber wieder her. Das Hilfsprogramm wird nicht mit der Anwendung verteilt.

Geprüft werden:

- Ein eigener, eindeutig benannter Typ-A-Testzustellpunkt: Schlüsselgenerierung, bestätigte Anlage, authentifizierter Abgleich, Wiederherstellung nach Kernneustart und getrennte Aktivierung; keine öffentliche Routing-Freigabe.
- v2/v3 mit JSON und XML sowie Anlagen: unveränderte entschlüsselte Bytes, Schema- und kryptographische Prüfung, Submission-/Case-Log, Reply nach Senderneustart, Reply-Log und beide Annahmequittierungen.
- Eine nicht komprimierbare fiktive 5-MiB-Anlage im v3-XML-Fall überschreitet die 4-MiB-Fragmentgrenze des SDK; der Empfang muss alle Originalbytes wiederherstellen.
- Schlüsselwechsel nur am eigenen temporären Zustellpunkt, mit vorherigem DPAPI-Checkpoint und erneutem Austausch über den neuen Schlüssel; alte Schlüssel bleiben erhalten.
- Zusätzlich eine explizit zugeordnete v3-Prozessnachricht und eine angebotene Prozessantwort.

Nur der Hinweis `MALWARE_SCAN_NOT_CONFIGURED` ist bei den bekannten fiktiven Empfangsdaten zulässig. Der Test behauptet keine Virenprüfung. Die separate Eventlog-Suche meldet `CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED`, weil sie selbst keine Fachdaten lädt; deren Vergleich geschieht zuvor im Empfang. Andere Warnungen und jede fehlgeschlagene Signatur-/Zuordnungsprüfung stoppen die Abnahme. Schreiboperationen werden bei ungewissem Ausgang nicht automatisch wiederholt.

## Aufräumen und Grenzen

Der Test entfernt ausschließlich seinen in diesem Lauf angelegten Zustellpunkt. Vor dem Entfernen werden die bekannte ID, der eindeutige Laufname, der Typ und der Zustand über die authentifizierte Verwaltung erneut geprüft. Ein noch nie aktivierter Entwurf nutzt den normalen Produktablauf. Ein aktivierter CI-Zustellpunkt wird ausdrücklich deaktiviert und anschließend über einen nur im Testskript vorhandenen API-Aufruf entfernt. Diese Funktion ist nicht in der Oberfläche verfügbar. Vorhandene konfigurierte Zustellpunkte werden nicht gelöscht.

Falls eine Anlageantwort verloren geht, erfolgt nur eine begrenzte lesende Suche nach dem eindeutigen Laufnamen und anschließend der native Abgleich mit dem vorhandenen Schlüsselbund. Bei Mehrdeutigkeit oder ungewissem Ergebnis stoppt das Aufräumen. Ein hart abgebrochener Runner kann einen fiktiven Testzustellpunkt hinterlassen; ein solcher Restbestand braucht eine gezielte Prüfung. Es gibt keine pauschale Löschung anhand eines Namenspräfixes.

Es werden keine Artefakte hochgeladen. Geschützte temporäre Checkpoints werden nach dem Test entfernt. Das Log nennt nur Prüfphasen und stabile Fehlercodes. Ein grüner Teilschritt ist keine Alpha-Freigabe; der vollständige Lauf und die übrigen Kriterien aus `ALPHA1_GOAL.md` müssen bestanden sein.
