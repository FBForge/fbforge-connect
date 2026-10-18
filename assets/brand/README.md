# Bildmarke

Quelle: `test-client-source.png`. Editierbare Vorlage: [Figma](https://www.figma.com/design/1hgKANEaO7z8Gcnp0SoHwa).

Icons mit der im Projekt festgelegten Tauri-CLI erzeugen:

```sh
npx tauri icon assets/brand/test-client-source.png --output /tmp/fitconnect-brand-icons
```

| Ausgabe          | Zieldatei                             |
| ---------------- | ------------------------------------- |
| `128x128.png`    | `frontend/src/assets/test-client.png` |
| `128x128@2x.png` | `desktop/icons/app.png`               |
| `icon.ico`       | `desktop/icons/app.ico`               |
