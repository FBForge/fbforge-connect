# Drittanbieter-Komponenten

Die Anwendung enthält getrennt lizenzierte Komponenten. Die EUPL-Lizenz des Projekts ersetzt deren Lizenzen nicht. Exakte Versionen und transitive Abhängigkeiten stehen in `package-lock.json`, `desktop/Cargo.lock` und den Maven-POMs.

Die Lizenztexte der Frontend-Abhängigkeiten und PDF-Schriftarten stehen in `licenses/frontend.txt` und in der Infoansicht der Anwendung.

| Komponente | Verwendung | Lizenz |
| --- | --- | --- |
| FIT-Connect Java SDK 3.5.2 / 4.0.0-rc.2 und REST-Modelle | FIT-Connect-Protokoll und Kryptografie | Apache-2.0 |
| Tauri 2 und offizielle Plugins für Einzelinstanz/Dateidialoge | Windows-Desktop, IPC und native Dialoge | MIT oder Apache-2.0 |
| Tauri-CLI 2.12.3 NSIS-Installervorlage | Zwei dokumentierte Anpassungen für die kompatible Produktumbenennung | MIT oder Apache-2.0. Copyright (c) 2017 - Present Tauri Apps Contributors. Siehe `licenses/tauri-MIT.txt` und `desktop/installer/upstream.json` |
| PDF.js 6.4.299 | Lokale PDF-Darstellung mit Standardfonts | Apache-2.0. Copyright Mozilla Foundation. Siehe `licenses/pdfjs-NOTICE.txt` |
| Vue 3 | Bedienoberfläche | MIT |
| bpmn-js 18.31.0 | Lokale BPMN-Ansicht | bpmn.io-Lizenz, siehe unten |
| bpmn-moddle 10.3.1 | BPMN-Referenzen und XML-Modell | MIT |
| Bouncy Castle | Selbstsignierte TEST-Zertifikate, über bestehende SDK-Abhängigkeit | MIT |

**bpmn-js:** Copyright (c) 2014-present Camunda Services GmbH. Die Lizenz verlangt das sichtbare, unveränderte bpmn.io-Wasserzeichen in gerenderten Diagrammen. Es bleibt in der Anwendung erhalten. Der vollständige Text liegt unter `licenses/bpmn-js.txt` und ist in der Infoansicht zugänglich.

Für Apache-2.0 liegt der vollständige Lizenztext unter `licenses/Apache-2.0.txt`. Lizenz- und Copyright-Hinweise der Java-Adapter bleiben bei der Paketierung in den Artefakten erhalten.
