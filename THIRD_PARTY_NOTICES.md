# Drittanbieter-Komponenten

Die Anwendung enthält getrennt lizenzierte Komponenten. Die EUPL-Lizenz des Projekts ersetzt deren Lizenzen nicht. Exakte Versionen und transitive Abhängigkeiten stehen in `package-lock.json`, `desktop/Cargo.lock` und den Maven-POMs.

Die Lizenztexte der Frontend-Abhängigkeiten und PDF-Schriftarten stehen in `licenses/frontend.txt` und in der Infoansicht der Anwendung.

| Komponente                                                    | Verwendung                                                           | Lizenz                                                                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| FIT-Connect Java SDK 3.5.2 / 4.0.0 und REST-Modelle      | FIT-Connect-Protokoll und Kryptografie                               | Apache-2.0                                                                                                                                      |
| Tauri 2 und offizielle Plugins für Einzelinstanz/Dateidialoge/Updater | Windows-Desktop, IPC, Dialoge und signierte Updates | MIT oder Apache-2.0 |
| minisign-verify 0.3.0, reqwest 0.13.5, rustls 0.23.46 | Update-Signaturprüfung und begrenzter HTTPS-Download | MIT (minisign-verify), MIT oder Apache-2.0 (reqwest), Apache-2.0 / ISC / MIT (rustls); siehe Cargo-Metadaten und `licenses/native-updates.txt` |
| Tauri-CLI 2.12.3 NSIS-Installervorlage                        | Zwei dokumentierte Anpassungen für die kompatible Produktumbenennung | MIT oder Apache-2.0. Copyright (c) 2017 - Present Tauri Apps Contributors. Siehe `licenses/tauri-MIT.txt` und `desktop/installer/upstream.json` |
| PDF.js 6.4.299                                                | Lokale PDF-Darstellung mit Standardfonts                             | Apache-2.0. Copyright Mozilla Foundation. Siehe `licenses/pdfjs-NOTICE.txt`                                                                     |
| Vue 3                                                         | Bedienoberfläche                                                     | MIT                                                                                                                                             |
| bpmn-js 18.31.0                                               | Lokale BPMN-Ansicht                                                  | bpmn.io-Lizenz, siehe unten                                                                                                                     |
| bpmn-moddle 10.3.1                                            | BPMN-Referenzen und XML-Modell                                       | MIT                                                                                                                                             |
| Bouncy Castle 1.86                                            | Zertifikate und Kryptografie der SDK-Adapter                         | MIT                                                                                                                                             |

**bpmn-js:** Copyright (c) 2014-present Camunda Services GmbH. Die Lizenz verlangt das sichtbare, unveränderte bpmn.io-Wasserzeichen in gerenderten Diagrammen. Es bleibt in der Anwendung erhalten. Der vollständige Text liegt unter `licenses/bpmn-js.txt` und ist in der Infoansicht zugänglich.

Für Apache-2.0 liegt der vollständige Lizenztext unter `licenses/Apache-2.0.txt`. Lizenz- und Copyright-Hinweise der Java-Adapter bleiben bei der Paketierung in den Artefakten erhalten.

Die Lizenz- und Copyright-Texte der neuen nativen Update-Komponenten einschließlich
ring sind in `licenses/native-updates.txt` und in der Infoansicht enthalten.

## Optionale ClamAV-Komponente (ab 0.3.0)

Das Windows-Setup kann unveränderte offizielle ClamAV-1.5.4-Dateien einschließlich
Bibliotheken und datierter Virendatenbanken enthalten. ClamAV steht unter GPL-2.0;
die mitgelieferten Bibliotheken haben eigene Hinweise. Die Originaldateien
`COPYING.txt` und `COPYING/` begleiten die Komponente. Der Release enthält außerdem
die vollständige Scanner-Distribution mit passendem ClamAV-Quellarchiv,
Originalsignatur, Buildverweisen und sämtlichen mitgelieferten Lizenzhinweisen.
Die EUPL-Lizenz der FBForge-Connect-Anwendung ersetzt diese Lizenzen nicht.
