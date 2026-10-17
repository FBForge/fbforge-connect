# Kurzer Test auf dem eigenen Windows-Gerät

Dieser Test kann später erfolgen. Installation/Upgrade, Protokollabläufe und automatisierte Prüfungen werden zuvor in CI geprüft. Diese Checkliste ergänzt die Bedingungen des eigenen Geräts; sie verlangt keinen erneuten vollständigen FIT-Connect-Austausch.

## Ohne Zugangsdaten prüfen

1. Den geprüften dev.8-Kandidaten aus dem verlinkten Actions-Lauf verwenden. Die enthaltene Prüfsummendatei gehört genau zu diesem Installer. Der aktuelle Kandidat ist unsigniert, solange das bestellte Certum-Zertifikat fehlt.
2. Bei der eigenen Windows-Skalierung öffnen und das Fenster verkleinern/vergrößern. Bei Bedarf 125, 150 und 200 Prozent in den Windows-Anzeigeeinstellungen getrennt prüfen. Navigation, Verbindungsdialog, Schließen-Schaltfläche und Statusleiste müssen erreichbar bleiben; lange Inhalte dürfen im Arbeitsbereich scrollen. Keine abgeschnittenen Eingaben oder seitlich verlorenen Bedienelemente.
3. Mit Tab/Shift+Tab durch Kopfzeile und Navigation wechseln. Der Tastaturfokus muss sichtbar sein. „Verbinden“ öffnen, Client-ID und Client-Secret erreichen und den Dialog mit Escape schließen. Der Fokus soll zum Auslöser zurückkehren. Ein Screenreader kann einzelne Tasten zunächst für seinen eigenen Lese-/Eingabemodus verwenden; diesen Modus im Befund angeben.
4. Unter „Prozesse“ den fiktiven Demo-Prozess öffnen. Diagramm einpassen und vergrößern/verkleinern; eine Nachricht mit der Tastatur in der Liste auswählen. Die zugehörigen Kennungen müssen lesbar sein. Dafür ist keine Anmeldung nötig und es wird nichts versendet.
5. Hell-/Dunkeldesign prüfen: Text, Fokus, Warnungen und deaktivierte Bedienelemente sollen erkennbar bleiben. Eine Bedeutung darf nicht allein von einer Farbe abhängen.

## Falls ein Screenreader verwendet wird

Mit der tatsächlich eingesetzten NVDA-/JAWS-/Narrator-Version prüfen, ob Navigation, Überschriften, Dialog, beschriftete Eingaben und Auswahlzustände verständlich angesagt werden. Das Secret-Feld muss als geschützt erkennbar sein. Nicht nur einzelne Beschriftungen, sondern einen zusammenhängenden Ablauf ohne Maus durchführen: Navigation → Verbindungsdialog → zurück → Demo-Modell → Nachrichtenauswahl. Auch die Reihenfolge und Verständlichkeit der hörbaren Ausgabe bewerten.

Der automatische NVDA-Test erfasst erzeugte Sprachsequenzen für ausgewählte Bedienelemente in der installierten Anwendung. Er aktiviert die WebView zunächst einmal mit einem echten Klick im leeren ID-Feld und prüft danach Tab und Escape; dies ist keine vollständige Prüfung eines Ablaufs ohne Maus. Er bestätigt keine allgemeine Unterstützung jedes Screenreaders, keine hörbare Sprachqualität und keine vollständige WCAG-/BITV-Konformität.

## Rückmeldung

Für einen gewöhnlichen Fehler reichen Windows-Version, App-Build/Commit, Skalierung, Fenstergröße, gegebenenfalls Screenreader-Version sowie die betroffene Aktion und das erwartete/tatsächliche Verhalten. Nur fiktive Daten verwenden. Screenshots oder Berichte dürfen keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten enthalten. Sicherheitslücken gemäß [SECURITY.md](SECURITY.md) privat melden.
