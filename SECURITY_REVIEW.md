# Sicherheits- und Technikprüfung für Alpha 1

Stand: 16. Oktober 2026. Entwicklungsprüfung, keine BSI-Zertifizierung oder Erklärung vollständiger Konformität. Die Anwendung unterstützt ausschließlich FIT-Connect TEST und fiktive Daten. Die Freigabe durch eine Behörde erfordert deren Schutzbedarfsfeststellung und Betriebsbedingungen.

## Technikentscheidung

Vue 3, Vite 8 und Tauri 2 sind eine passende Grundlage für die Windows-Oberfläche. Rust hält Dateizugriff, Profilverschlüsselung und native Befehle außerhalb des Renderers. Java 25 ist die gebündelte LTS-Laufzeit für die tatsächlichen FIT-Connect-SDKs. Die zwei SDK-Generationen laufen in getrennten Adaptern mit einem gemeinsamen, begrenzten Protokoll. Ein Frameworkwechsel hätte gegenwärtig keinen belegten Nutzen.

Abhängigkeiten und Rust-Toolchain sind festgelegt; Node 24 wird in CI verwendet. Der v3-Adapter verwendet weiterhin eine festgelegte SDK-Vorabversion. Deren interne OAuth-Schnittstelle bleibt auf diesen Adapter begrenzt. Vor Alpha-Freigabe muss die verfügbare stabile SDK-Version erneut bewertet werden; ein Versionswechsel benötigt die vollständigen Austauschtests.

Die JavaScript-Abhängigkeitsprüfung über `npm audit --json` meldete am Prüftag keine bekannten Schwachstellen im gesperrten Baum, einschließlich Entwicklungsabhängigkeiten. Das ist kein Nachweis für Java-, Rust-, WebView2- oder unbekannte Schwachstellen. Diese Komponenten brauchen eine gesonderte Prüfung und einen dokumentierten Aktualisierungsprozess.

## BSI-Bezug und Grenzen

Als Prüfraster dienen die offiziellen BSI-Veröffentlichungen [TR-02102-1](https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr02102/tr02102_node.html) für kryptographische Verfahren, TR-02102-2 für TLS sowie die IT-Grundschutz-Bausteine CON.8 Software-Entwicklung, APP.6 Allgemeine Software und OPS.1.1.6 Software-Tests und -Freigaben. Die Dokumente und ihre jeweils geltende Ausgabe müssen für eine formale Bewertung vollständig herangezogen werden. Die vollständigen aktuellen TR-PDFs waren aus dieser Prüfumgebung nicht zuverlässig abrufbar. Aus Suchauszügen wird keine Konformität abgeleitet.

| Bereich | Im Code vorhanden / geprüft | Vor Freigabe noch nachzuweisen |
| --- | --- | --- |
| Vertrauensgrenzen | Renderer ohne allgemeine HTTP-, Shell- oder Dateischnittstelle; feste TEST-Ziele; eigene Tauri-Berechtigungen; validierte und begrenzte DTOs | Vollständige Berechtigungsprüfung bei jeder neuen Funktion; Review des finalen Bundles |
| Kryptographie | SDK-Verschlüsselung und Signaturprüfung, RSA-4096-Testschlüssel, RSA-OAEP-256/PS512; getrennte Schlüsselzwecke; authentifizierte Prüfung öffentlicher Registrierungen | Algorithmen, Parameter und Verwendungszeiträume gegen die vollständige aktuelle TR und FIT-Connect-Spezifikation abgleichen. Testzertifikate sind keine behördliche PKI. Die Selbstsignatur der Testzertifikate verwendet derzeit SHA512withRSA. |
| TLS | HTTPS, normale Zertifikats-/Hostnamenprüfung, keine Weiterleitungen bei geschützten API-Aufrufen; keine Abschaltung der Prüfung | Tatsächlich verhandelte Protokolle, Cipher Suites und Signaturalgorithmen auf den unterstützten Windows-Systemen prüfen; Systemvertrauen/Behördenproxy dokumentieren |
| Secrets / Schlüssel | Optionaler benutzergebundener Windows-DPAPI-Speicher; atomarer verschlüsselter Ersatz; kein Klartext-Fallback; private Archive nicht an den Renderer; Tokens nicht gespeichert | Reale Windows-Neustart-/Backup-Abnahme. DPAPI schützt nicht vor Schadsoftware mit den Rechten desselben angemeldeten Benutzers. Sicherung ist an dessen Windows-Schlüssel gebunden. |
| Ungewisse Schreibausgänge | Bestätigung, feste Zielbindung, gesichertes Schreibvorhaben vor Schlüsselnutzung; keine automatische Wiederholung ungewisser Sendungen/Anlagen/Rotationen | Verhalten bei echter Netzunterbrechung und Prozessabbruch mit den Live-Diensten abnehmen |
| Fremde Inhalte | XML ohne DTD/externe Entitäten; begrenzte Schema-/ZIP-Verarbeitung; ausdrückliche Freigabe externer Schemaquellen; BPMN-Parsergrenzen und Worker-Zeitlimit | Repräsentative FIM-/XÖV-Schemata und zusätzliche adversariale Fixtures prüfen; externe Schemaquellen bleiben ein eigener Vertrauensbereich |
| Oberfläche | Lokale Assets, CSP ohne externe Skripte/Frames, kein `v-html`, keine Ausführung fremder BPMN-Prozesse | WebView2-Aktualisierung und finale CSP prüfen. Inline-Stile werden für Komponenten/Diagramme weiterhin erlaubt. |
| Lieferkette | Lockfiles, festgelegte Actions-Commit-IDs, lesende Workflow-Berechtigungen, keine Live-Secrets in PR-Schritten | Java-/Rust-Advisories, vollständiges SBOM/Lizenzinventar und Release-Provenienz; Zuständigkeit für Sicherheitsupdates |
| Verteilung | Installerbau und automatisierte Windows-Prüfungen | Windows-Installation/Upgrade, Authenticode-Signierung bzw. ausdrücklich dokumentierte unsignierte Alpha-Verteilung. Der aktuelle Build ist unsigniert. |

## Live-Prüfungen und Geheimhaltung

Die vom Projektinhaber bereitgestellten TEST-Zugänge werden außerhalb des Repositorys verwendet. Die GitHub-Actions-Secrets heißen `SENDERID`, `SENDERSECRET`, `SENDERDEST`, `SUBSCRIBERID` und `SUBSCRIBERSECRET`. Sie gehören weder in Quelldateien noch in Installer, Screenshots, Fehlertexte oder Artefakte. Secret-Werte können nicht aus GitHub zurückgelesen werden.

`scripts/live-readonly.mjs` prüft auf dem vertrauten Entwicklungsbranch die reale Authentifizierung beider API-Versionen, lesende native Aufrufe und lokale Schlüsselerzeugung. Es sendet keine Anträge und verändert keine Zustellpunkte. Diese bewusst begrenzte CI-Prüfung ersetzt keinen Ende-zu-Ende-Austausch. Lokale Live-Schreibtests sichern private Schlüssel vor der Registrierung außerhalb des Repositorys und wiederholen ungewisse Ergebnisse nicht automatisch.

Beim ersten realen Anlageversuch wurden fehlende API-Pflichtfelder für Kontaktanschrift und Telefon festgestellt. Ein korrigierter Versuch legte den Zustellpunkt an, der genaue Abgleich meldete jedoch eine Abweichung zwischen `cc: null` im SDK und `cc: []` in der Serverantwort. Der vorhandene Zustellpunkt wird lesend abgeglichen; keine doppelte Anlage. Diese Befunde werden als Regressionen abgesichert. Der zuerst gelieferte Senderzugang wurde lokal mit HTTP 401 abgelehnt; ein erfolgreicher Actions-Lauf oder korrigierter Zugang muss das auflösen.

## Wartbarkeit und Bedienbarkeit

Prettier, ESLint, Rustfmt und Spotless prüfen einen einheitlichen Stil. Wiederholbare Browserabläufe ergänzen die SDK-, Protokoll- und DPAPI-Tests. Weitere Priorität haben kleinere UI-Komponenten für Profilverwaltung, ein verständliches Schlüsselinventar und die abschließende Tastatur-, Fokus-, Kontrast- und Vergrößerungsprüfung. Ein automatisierter Browserlauf allein ist kein Barrierefreiheitsnachweis.

Eine Alpha-Freigabe braucht die im Work-Goal genannten erfolgreichen Austausch- und Windows-Abnahmen sowie einen konkreten privaten Meldeweg für Sicherheitslücken. Offene Punkte dürfen nicht durch einen grünen Teiltest oder eine pauschale Aussage „BSI-konform“ verdeckt werden.
