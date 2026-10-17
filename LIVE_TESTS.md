# Reale TEST-Abnahme

Die native Abnahme verwendet ausschließlich TEST und fiktive Fachdaten. Sie ist kein Lasttest und ersetzt weder eine manuelle Installation noch die Bedienungsprüfung des Desktop-Clients.

## GitHub Actions

Der Workflow `.github/workflows/live-exchange.yml` wird ausschließlich manuell über „Run workflow“ auf `main` oder `develop` im bestehenden Repository gestartet. Die Eingabe `confirm_test_writes` muss ausdrücklich aktiviert werden. Dieser Lauf führt echte Schreiboperationen gegen TEST aus. Pushes und Pull Requests starten ihn nicht; das gilt auch für die Branch-Bereinigung. Gleichzeitige Läufe sind ausgeschlossen und laufende Schreibvorgänge werden nicht durch neu eingereihte Läufe abgebrochen. Die Repository-Bindung verwendet die stabile ID `1421171092`.

Erforderliche Repository-Secrets: `SENDERID`, `SENDERSECRET`, `SENDERDEST`, `SUBSCRIBERID`, `SUBSCRIBERSECRET`. Der Sender muss senden dürfen, der Subscriber Zustellpunkte verwalten und empfangen. `SENDERDEST` bezeichnet den bestehenden aktiven Typ-C-TEST-Absenderzustellpunkt. Für Replies muss er Metadatenversionen anbieten. Nach authentifiziertem Lesen ergänzt der Test ausschließlich fehlende Versionen `2.0.0`/`3.0.0` über die native Vorschau und einen gezielten PATCH mit anschließendem öffentlichen Rücklesen. Bereits angebotene Versionen bleiben erhalten; Schlüssel und andere Einstellungen werden nicht verändert. Der Senderzugang benötigt hierfür Verwaltungsberechtigung. Ein zweiter aktiver Absender wird nicht angelegt, damit die implizite v2-Absenderzuordnung eindeutig bleibt. Secrets stehen nur dem abschließenden Testschritt zur Verfügung und werden weder in Dateien noch in Artefakte geschrieben. Der Wert von Repository-Secrets kann über GitHub nicht zurückgelesen werden.

Der Ablauf baut die echten isolierten SDK-Adapter und die gebündelte Java-Laufzeit. Ein ausschließlich für CI gebautes Rust-Hilfsprogramm verwendet den produktiven Windows-DPAPI-Tresor, um Schlüsselarchive vor ihrer öffentlichen Registrierung beziehungsweise vor dem Veröffentlichen eines Reply-Kanals verschlüsselt zu sichern. Die Profile enthalten keine echten OAuth-Zugangsdaten. Private Archive werden ausschließlich über Prozess-Pipes übertragen und nicht ausgegeben. Der Test startet den nativen Kern neu und stellt Schlüssel darüber wieder her. Das Hilfsprogramm wird nicht mit der Anwendung verteilt.

Geprüft werden:

- Ein eigener, eindeutig benannter Typ-A-Testzustellpunkt: Schlüsselgenerierung, bestätigte Anlage, authentifizierter Abgleich, Wiederherstellung nach Kernneustart und getrennte Aktivierung; keine öffentliche Routing-Freigabe.
- v2/v3 mit JSON und XML sowie Anlagen: unveränderte entschlüsselte Bytes, Schema- und kryptographische Prüfung, Submission-/Case-Log, Reply nach Senderneustart, Reply-Log und beide Annahmequittierungen.
- Eine nicht komprimierbare fiktive 5-MiB-Anlage im v3-XML-Fall überschreitet die 4-MiB-Fragmentgrenze des SDK; der Empfang muss alle Originalbytes wiederherstellen.
- Schlüsselwechsel nur am eigenen temporären Zustellpunkt, mit vorherigem DPAPI-Checkpoint und erneutem Austausch über den neuen Schlüssel; alte Schlüssel bleiben erhalten.
- Getrennter v3-Fall für die technische Ablehnung von Submission und Reply. Nach beiden Annahmen beziehungsweise Ablehnungen müssen die entsprechenden signierten Ereignisse im erneut geladenen Log enthalten sein.
- Zusätzlich eine explizit zugeordnete v3-Prozessnachricht und eine angebotene Prozessantwort.

Nur der Hinweis `MALWARE_SCAN_NOT_CONFIGURED` ist bei den bekannten fiktiven Empfangsdaten zulässig. Der Test behauptet keine Virenprüfung. Die separate Eventlog-Suche meldet `CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED`, weil sie selbst keine Fachdaten lädt; deren Vergleich geschieht zuvor im Empfang. Andere Warnungen und jede fehlgeschlagene Signatur-/Zuordnungsprüfung stoppen die Abnahme. Schreiboperationen werden bei ungewissem Ausgang nicht automatisch wiederholt.

## Aufräumen und Grenzen

Der Test entfernt ausschließlich seinen in diesem Lauf angelegten Zustellpunkt. Vor dem Entfernen werden die bekannte ID, der eindeutige Laufname, der Typ und der Zustand über die authentifizierte Verwaltung erneut geprüft. Ein noch nie aktivierter Entwurf nutzt den normalen Produktablauf. Ein aktivierter CI-Zustellpunkt wird ausdrücklich deaktiviert. Die API erzwingt anschließend eine Aufbewahrungsfrist (im realen Lauf 30 Tage), während der keine Löschung zulässig ist. Der Test prüft den inaktiven Zustand, die fehlende Routing-Freigabe und den serverseitigen Zeitpunkt `canBeDecommissionedAt` authentifiziert und nennt ID sowie Frist im Log. Er meldet diesen Restbestand ausdrücklich und behauptet keine Löschung. Die Frist wird nicht umgangen. Vorhandene konfigurierte Zustellpunkte werden nicht gelöscht.

Falls eine Anlageantwort verloren geht, erfolgt nur eine begrenzte lesende Suche nach dem eindeutigen Laufnamen und anschließend der native Abgleich mit dem vorhandenen Schlüsselbund. Bei Mehrdeutigkeit oder ungewissem Ergebnis stoppt das Aufräumen. Ein hart abgebrochener Runner kann einen fiktiven Testzustellpunkt hinterlassen; ein solcher Restbestand braucht eine gezielte Prüfung. Es gibt keine pauschale Löschung anhand eines Namenspräfixes.

Es werden keine Artefakte hochgeladen. Geschützte temporäre Checkpoints werden nach dem Test entfernt. Das Log nennt nur Prüfphasen und stabile Fehlercodes. Ein grüner Teilschritt ist keine Alpha-Freigabe; der vollständige Lauf und die übrigen Kriterien aus `ALPHA1_GOAL.md` müssen bestanden sein.

## Erfolgreiche Abnahme und erforderliche Restbestände

Lauf [38988235240](https://github.com/FBForge/fbforge-connect/actions/runs/38988235240) auf `9503027` bestand den vollständigen Ablauf einschließlich Rotation und anschließendem Austausch. Beide echten Actions-Clients wurden verwendet. Sieben fiktive Einreichungen prüften v2/v3, JSON/XML, Fragmente, Prozesskommunikation, Replies nach Neustart, Annahmen/Ablehnungen und die zugehörigen signierten Ereignisse.

Die vollständigen Wiederholungen [38990315338](https://github.com/FBForge/fbforge-connect/actions/runs/38990315338) auf `c4783c4` und [38991770845](https://github.com/FBForge/fbforge-connect/actions/runs/38991770845) auf `09888fe` bestanden ebenfalls alle sieben Fälle. Spätere Namens-/Installeränderungen verändern das Austauschprotokoll nicht.

Die folgenden ausschließlich für diese CI-Abnahmen erzeugten Zustellpunkte wurden authentifiziert deaktiviert und sind ohne öffentliche Routing-Freigabe aufbewahrt. Die API verbietet die sofortige Außerbetriebnahme/Löschung vor ihrer Frist:

| Generierter TEST-Zustellpunkt | Frühester serverseitiger Zeitpunkt |
| --- | --- |
| `55662cc0-2623-466b-ac86-fdb193a9e1fe` | 2026-11-16T00:29:38.679Z |
| `eb094983-09ab-4771-acf2-eb8a733d12af` | 2026-11-16T00:36:29.915Z |
| `a73bc879-c0d5-4174-b4c4-84272fd91753` | 2026-11-16T00:49:14.519Z |
| `2569613d-3d95-4332-9406-0bac444a6da3` | 2026-11-16T00:54:45.997Z |
| `773aeb44-560c-4e83-a035-6c5c17d3d299` | 2026-11-16T01:22:10.635Z |
| `83c42935-6139-4f81-872d-01e2e1be378b` | 2026-11-16T01:43:21.390Z |

Vor einer späteren Bereinigung müssen ID, eindeutiger Laufname, Eigentum und aktueller API-Zustand erneut geprüft werden. Es gibt keine pauschale Löschung aller ähnlich benannten Zustellpunkte und keine Umgehung der Frist. Eine noch nicht bestätigte fiktive Nachricht aus einem fehlgeschlagenen Teillauf ist kein erfolgreicher Anwendungsfall. Echte Zugangsdaten und private Schlüssel sind in dieser Liste nicht enthalten.
