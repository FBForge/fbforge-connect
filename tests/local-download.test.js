import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLocalFile, localSave } from '../frontend/src/local-download.js';
test('native save sends original binary bytes and a UTF-8 name without a renderer-selected path', async () => {
  const before = globalThis.isTauri,
    previous = globalThis.window;
  globalThis.isTauri = true;
  const calls = [];
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (...args) => {
        calls.push(args);
        return 'C:\\Users\\Test\\Downloads\\Anlage.pdf';
      },
    },
  };
  try {
    const bytes = Uint8Array.from([0, 255, 10, 128]);
    assert.equal(await saveLocalFile(bytes, 'Prüfung.pdf'), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'save_local_file');
    assert.equal(calls[0][1], bytes);
    assert.equal(
      new TextDecoder().decode(
        Uint8Array.from(atob(calls[0][2].headers['x-fbforge-file-name']), (c) => c.charCodeAt(0)),
      ),
      'Prüfung.pdf',
    );
    assert.match(localSave.value.message, /Datei gespeichert/);
    assert.equal(localSave.value.error, false);
    window.__TAURI_INTERNALS__.invoke = async () => null;
    assert.equal(await saveLocalFile(bytes, 'x'), false);
    assert.match(localSave.value.message, /abgebrochen/);
    window.__TAURI_INTERNALS__.invoke = async () => {
      throw 'export_failed';
    };
    assert.equal(await saveLocalFile(bytes, 'x'), false);
    assert.equal(localSave.value.error, true);
    assert.match(localSave.value.message, /Schreibrechte/);
    assert.equal(localSave.value.pending, false);
  } finally {
    globalThis.isTauri = before;
    globalThis.window = previous;
  }
});
