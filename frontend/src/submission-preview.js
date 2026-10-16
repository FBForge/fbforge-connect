import * as viewer from './json-viewer.js';
import { structuredFormat } from './structured-data.js';

  const MAX_TEXT_BYTES = 2 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 16000000;
  const objectUrls = new Map();
  const blockedExtension = /\.(?:html?|xhtml|svgz?|js|mjs|pdf|docx?|xlsx?|pptx?|od[tps])$/i;
  const blockedMime = /(?:html|svg|javascript|pdf|officedocument|msword|ms-excel|ms-powerpoint|opendocument)/i;

  function imageInfo(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
      if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;
      return { mimeType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 1 < bytes.length) {
      if (bytes[offset++] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9 || marker === 0x00) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8 || bytes[offset + 2] !== 8) return null;
        return { mimeType: 'image/jpeg', height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += length;
    }
    return null;
  }

  function validDimensions(width, height) {
    return width > 0 && height > 0 && width <= 16384 && height <= 16384 && width * height <= MAX_IMAGE_PIXELS;
  }

  function shallowJson(text) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (const character of text) {
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === '{' || character === '[') {
        if (++depth > 16) return false;
      } else if (character === '}' || character === ']') depth--;
    }
    return true;
  }

  function jsonNodes(text) {
    return viewer.nodes(text);
  }

  // Decode only bounded PNG/JPEG input. Re-encoding strips metadata and trailing active content.
  async function createPreview(input, { filename = 'Datei', mimeType = '' } = {}, runtime = globalThis) {
    const originalName = String(filename).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '') || 'Datei';
    filename = originalName.slice(0, 180);
    mimeType = String(mimeType).split(';')[0].trim().toLowerCase();
    const unavailable = notice => ({ kind: 'unavailable', filename, notice });
    if (blockedExtension.test(originalName) || blockedMime.test(mimeType)) {
      return unavailable('Dieses Dateiformat wird ausschließlich als Download angeboten.');
    }
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input)
      : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
    if (!bytes) return unavailable('Die Datei kann nicht angezeigt werden.');
    if (bytes.byteLength > MAX_IMAGE_BYTES) return unavailable('Für die Vorschau ist diese Datei zu groß. Bilder sind auf 8 MiB und Textdateien auf 2 MiB begrenzt.');
    const image = imageInfo(bytes);
    if (image) {
      if (!validDimensions(image.width, image.height)) return unavailable('Das Bild überschreitet die zulässigen Abmessungen von 16 Megapixeln.');
      if (typeof runtime.createImageBitmap !== 'function' || typeof runtime.URL?.createObjectURL !== 'function') {
        return unavailable('Dieser Browser unterstützt die sichere Bildvorschau nicht.');
      }
      let bitmap;
      let canvas;
      try {
        bitmap = await runtime.createImageBitmap(new Blob([bytes], { type: image.mimeType }), { imageOrientation: 'none' });
        if (bitmap.width !== image.width || bitmap.height !== image.height || !validDimensions(bitmap.width, bitmap.height)) {
          return unavailable('Die Bildabmessungen konnten nicht zuverlässig geprüft werden.');
        }
        canvas = typeof runtime.OffscreenCanvas === 'function'
          ? new runtime.OffscreenCanvas(bitmap.width, bitmap.height) : runtime.document?.createElement('canvas');
        if (!canvas) return unavailable('Dieser Browser unterstützt die sichere Bildvorschau nicht.');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) return unavailable('Die Bildvorschau konnte nicht erstellt werden.');
        context.drawImage(bitmap, 0, 0);
        const blob = typeof canvas.convertToBlob === 'function'
          ? await canvas.convertToBlob({ type: 'image/png' })
          : await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob || blob.type !== 'image/png' || blob.size > MAX_IMAGE_BYTES) return unavailable('Das aufbereitete Bild ist für die Vorschau zu groß.');
        const url = runtime.URL.createObjectURL(blob);
        objectUrls.set(url, runtime.URL);
        return { kind: 'image', filename, url, notice: 'Lokale PNG-Vorschau. Das Original wurde nicht verändert.' };
      } catch {
        return unavailable('Das Bild konnte nicht sicher angezeigt werden. Der Download bleibt verfügbar.');
      } finally {
        bitmap?.close();
        if (canvas) { canvas.width = 0; canvas.height = 0; }
      }
    }
    const isText = /\.(?:json|xml|txt|csv|log)$/i.test(originalName)
      || /^(?:text\/(?:plain|csv)|application\/(?:json|xml|[a-z0-9.+-]+\+json|[a-z0-9.+-]+\+xml))$/.test(mimeType);
    if (!isText) return unavailable('Für dieses Dateiformat ist keine Vorschau verfügbar.');
    if (bytes.byteLength > MAX_TEXT_BYTES) return unavailable('Textvorschauen sind auf 2 MiB begrenzt.');
    try {
      let text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const rawText = text;
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return unavailable('Binäre Inhalte werden ausschließlich als Download angeboten.');
      // Deep or large JSON stays literal to bound formatting work and indentation growth.
      if ((/\.json$/i.test(originalName) || /json$/.test(mimeType)) && bytes.byteLength <= 256 * 1024 && shallowJson(text)) {
        try {
          const formatted = viewer.prettyPrint(text);
          if (new TextEncoder().encode(formatted).byteLength <= MAX_TEXT_BYTES) text = formatted;
        } catch { /* Invalid or excessively nested JSON remains inert plain text. */ }
      }
      return { kind: 'text', filename, text, rawText, format: structuredFormat({ filename: originalName, mimeType }), notice: 'Lokale Vorschau. Inhalte werden nicht ausgeführt und Verweise nicht geladen.' };
    } catch {
      return unavailable('Die Datei enthält keinen gültigen UTF-8-Text.');
    }
  }

  function disposePreview(preview) {
    const owner = objectUrls.get(preview?.url);
    if (owner) {
      owner.revokeObjectURL(preview.url);
      objectUrls.delete(preview.url);
    }
  }

export { createPreview, disposePreview, jsonNodes };
