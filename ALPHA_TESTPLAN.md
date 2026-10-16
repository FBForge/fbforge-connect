# Alpha-Testplan · 0.1.0-dev.3

Entwicklungszweig: `develop`. Dies ist ein Entwicklungsstand für die erste ausführbare Alpha. Eine erfolgreiche Simulation ersetzt keinen Live-Test gegen TEST.

## Korrigierte und automatisiert geprüfte Fälle

| Fall | Prüfung |
| --- | --- |
| V3-Client darf senden, aber keine Vorgänge auflisten | Versand erfolgt ohne den zusätzlichen `GET /v3/cases` des SDK-Clientaufbaus. Absenderberechtigung, Empfängerschlüssel, Bestätigung und serverseitige Schreibberechtigungen bleiben geprüft. |
| Event Log mit Aussteller `https://submission-api-testing.fit-connect.fitko.dev` | Beide Adapter akzeptieren diese offizielle TEST-Adresse zusätzlich zur Gateway-Adresse. Die SDKs prüfen weiterhin Signaturen, Schema und Vorgangszuordnung. Unbekannte und Produktions-Aussteller werden abgelehnt. |
| Empfang und Entschlüsselung | SDK-generierte Einreichungen mit Fachdaten und fragmentierten Anlagen werden von v2 und v3 wieder empfangen und bytegenau verglichen. Metadaten 2.0.0 ermöglichen alle vier Sender-/Empfänger-Kombinationen. |
| Öffentliche TEST-Signaturschlüssel ohne `x5c` und `use` | Beide SDKs prüfen die Signaturen anhand der über den festen TEST-Endpunkt geladenen Schlüssel. Private Zustellpunktschlüssel behalten ihre eigene Testzertifikatsprüfung. |
| Fehler beim Abruf von Ereignissen oder Signaturschlüsseln | Der erste konkrete Fehler bleibt erhalten, auch wenn das SDK ihn abfängt und weitere Zugriffe versucht. Es entsteht kein Empfangsnachweis. |
| Fehlerbericht aus der Oberfläche | Empfang und Event Log zeigen API-Version und einen freigegebenen Fehlercode; ungeprüfte SDK-Meldungen werden nicht ausgegeben. |

## Lokale und Windows-Prüfung

Unter Windows mit JDK 25 und den Voraussetzungen aus der README:

```powershell
.\scripts\verify-windows.cmd
npm run desktop:build -- -- --locked
```

Der Workflow **Alpha Windows validation** läuft bei Pushes auf `develop` und `main` sowie bei Pull Requests. Nach erfolgreichem Lauf steht das unsignierte Installationspaket als Actions-Artefakt `windows-alpha-unsigned-setup` bereit. Ein Installer ist noch keine freigegebene Alpha; die folgende Live-Abnahme bleibt erforderlich.

## Live-Abnahme auf TEST

Nur fiktive Fachdaten und Testschlüssel verwenden. Zugangsdaten und private Schlüssel lokal in der Anwendung eingeben.

1. Den Windows-Installer auf einem frischen System installieren. Die Anwendung muss ohne separat installiertes Java, Node.js und Rust starten.
2. V2-Sitzung öffnen, den Test-Empfänger wählen und eine kleine JSON-Einreichung mit Textanlage senden. Einreichungs- und Vorgangs-ID festhalten. Der bereits erfolgreiche V2-Versand muss weiterhin funktionieren.
3. V3-Sitzung öffnen, einen berechtigten Absenderzustellpunkt wählen und denselben Fall senden. Anschließend eine Prozessnachricht mit passender registrierter Nachricht und Vorgangszuordnung prüfen. Kein Versuch darf einen Zugriff auf die allgemeine Vorgangsliste benötigen.
4. Als Empfänger beide Einreichungen jeweils über v2 und v3 auflisten und öffnen. Den passenden privaten Testschlüssel laden, Inhalte entschlüsseln und technisch prüfen. Fachdaten und Anlagen müssen mit den gesendeten Dateien übereinstimmen. Metadaten 3.x ausschließlich über v3 prüfen.
5. Für jede vollständig übermittelte Einreichung den Event Log öffnen. Ohne private Schlüssel müssen die Ereignisse erscheinen und ihre JSON-Daten lesbar sein. Nach einer manuell bestätigten Annahme oder Ablehnung den aktualisierten Log erneut prüfen.
6. Einen zweiten Fall mit XML/XSD und eine fragmentierte Anlage über 4 MiB prüfen. Der XRepository-Abruf, die Schema-Prüfung und der Download müssen funktionieren.
7. Mit fehlender Leseberechtigung und falschem Entschlüsselungsschlüssel prüfen: verständlicher Fehler, kein vollständiges Prüfergebnis und keine automatische Annahme/Ablehnung. Bei ungewissem Versand keinen automatischen Neuversand auslösen.

Für jeden Fall festhalten: Build/Commit, Windows-Version, API-Version, Aktion, Ergebnis und freigegebener Diagnosecode bzw. HTTP-Status aus der Versanddiagnose. Keine Zugangsdaten, privaten Schlüssel oder Einreichungsinhalte in Fehlerberichte kopieren.

## Noch offen

Für diese Überarbeitung stehen keine FIT-Connect-Zugangsdaten oder Fehlermeldungen aus dem vorherigen Live-Test zur Verfügung. Der konkrete bisherige Empfangsfehler ist daher noch nicht live zugeordnet. Die SDK-Roundtrips und die korrigierte Fehlerweitergabe schaffen eine reproduzierbare Grundlage für die erneute Abnahme. Live-Versand, Live-Empfang, Windows-Installation und Signierung müssen vor der Alpha-Freigabe bestätigt werden.

## Zusätzliche Abnahme von dev.3

Die Eventlog-Prüfung deckt nun 300 signierte Ereignisse mit beiden SDKs ab. Schlüssel werden je Prüflauf wiederverwendet und beim nächsten Prüflauf neu geladen. Eine vom SDK angeforderte leere Abschlussseite nach exakt vollen Seiten wird akzeptiert; widersprüchliche Seiten und fremde Einreichungsfilter bleiben abgelehnt.

Die Zustellpunktverwaltung benötigt keinen Quellcode des früheren Portals. Sie verwendet die dokumentierten SDK-/Destination-API-Verträge. Aktueller Umfang: vorhandene eigene Zustellpunkte lesen; über v3 Name, Kontakt, Metadatenversionen und zulässige Aktiv-/Inaktiv-Wechsel ändern. Anlegen, Löschen, Schlüssel- und Leistungsverwaltung bleiben Folgearbeiten.

1. Unter „Zustellpunkte“ eigene Zustellpunkte laden. Die Liste und die Detailansicht müssen zu den angemeldeten Zugangsdaten gehören. Die Detailansicht verwendet die authentifizierte Destination API, nicht die öffentliche Submission API.
2. Einen Zustellpunkt öffnen, den Namen oder einen Kontaktwert ändern und die Vorschau erstellen. Bis zur ausdrücklichen Speicherung darf auf TEST nichts verändert sein.
3. Zwei Zustellpunkte auswählen und die Namensvorlage `{name} – Test` vorbereiten. Vorher/Nachher für beide prüfen und explizit speichern. Nicht angehakte Felder, Schlüssel, Leistungen und Callbacks müssen erhalten bleiben.
4. Eine Vorschau erstellen, denselben Zustellpunkt außerhalb des Clients ändern und dann bestätigen. Die Vorprüfung muss die gesamte Auswahl vor dem ersten PATCH abbrechen. Die Prüfung erfolgt unmittelbar vor den Änderungen; ohne serverseitiges If-Match ist sie keine atomare Transaktion.
5. Bei fehlenden Schreibrechten oder Teilausfällen muss ein Ergebnis je Zustellpunkt erscheinen. Bei verlorener Antwort darf keine automatische Wiederholung stattfinden. „Ergebnis abrufen“ liest nur den lokalen Zustand. „Ansehen“ lädt den aktuellen Serverzustand auch nach ungewissem Ausgang. Für weitere Schreibversuche nach einem ungewissen Ausgang eine neue Sitzung öffnen.
6. Mit v2 darf die Detailansicht funktionieren; die Schreiboberfläche muss ausdrücklich auf die v3-Sitzung verweisen.

Die Tests verwenden synthetische API-Antworten und erzeugen keine Änderungen an echten TEST-Zustellpunkten. Eine fachliche Prüfung der Statuswechsel, Kontaktvalidierung und Schreibberechtigungen auf TEST bleibt erforderlich. Bulk-Edit ist eine Folge einzeln bestätigter Zieländerungen mit einer gemeinsamen Bestätigung, keine serverseitig atomare Transaktion.
