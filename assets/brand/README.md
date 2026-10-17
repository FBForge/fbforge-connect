# Projektbildmarke

Die Bildmarke von FBForge Connect steht für Senden und Empfangen. Cyan, ein warmer Akzent und kantige Verbindungselemente greifen die vom Projektinhaber bereitgestellte FBForge-Markenreferenz auf. Die Anwendung verwendet eine eigene, vereinfachte Bildmarke. Der Zusatz lautet „Integrationstests für FIT-Connect“.

`test-client-source.png` ist der hochauflösende, mit einem Bildgenerierungswerkzeug erstellte Entwurf mit transparentem Außenbereich. Die abgeleiteten App- und Installer-Icons wurden mit der gepinnten Tauri-CLI erzeugt:

```sh
npx tauri icon assets/brand/test-client-source.png --output /tmp/fitconnect-brand-icons
```

Verwendet werden `128x128.png` für `frontend/src/assets/test-client.png`, `128x128@2x.png` für `desktop/icons/app.png` und `icon.ico` für `desktop/icons/app.ico`. Das Original bleibt erhalten.

Die editierbare Markenbasis mit Logo-Größen, Farben und Wortmarke liegt in [Figma](https://www.figma.com/design/1hgKANEaO7z8Gcnp0SoHwa). Maßgeblich für die ausgelieferte Anwendung bleiben die versionierten Assets und Designwerte im Repository.
