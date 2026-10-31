import { invoke, isTauri } from '@tauri-apps/api/core';
import { shallowRef } from 'vue';
import { errorMessage } from './diagnostics.js';
export const localSave = shallowRef({ pending: false, message: '', error: false });
/** Use the OS save dialog in WebView2, not unsupported browser blob downloads. */
export async function saveLocalFile(bytes, filename, mimeType = 'application/octet-stream') {
  if (localSave.value.pending) return false;
  localSave.value = { pending: true, message: 'Speicherort auswählen …', error: false };
  try {
    if (isTauri()) {
      const encoded = new TextEncoder().encode(filename);
      const path = await invoke('save_local_file', bytes, {
        headers: { 'x-fbforge-file-name': btoa(String.fromCharCode(...encoded)) },
      });
      if (path === null) {
        localSave.value = { pending: false, message: 'Speichern abgebrochen.', error: false };
        return false;
      }
      if (typeof path !== 'string' || !path) throw new Error('export_failed');
      localSave.value = { pending: false, message: `Datei gespeichert: ${path}`, error: false };
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename.split(/[\\/]/).pop() || 'Datei';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      localSave.value = { pending: false, message: 'Datei an den Browser-Download übergeben.', error: false };
    }
    return true;
  } catch (cause) {
    localSave.value = { pending: false, message: errorMessage(cause), error: true };
    return false;
  }
}
export function downloadLocal(text, filename, mimeType = 'application/json') {
  return saveLocalFile(new TextEncoder().encode(text), filename, mimeType);
}
