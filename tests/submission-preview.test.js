import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreview, disposePreview, jsonNodes } from '../frontend/src/submission-preview.js';

const utf8 = (value) => new TextEncoder().encode(value);
test('JSON tree is inert, parent-addressed and bounded before rendering', () => {
  const nodes = jsonNodes('{"__proto__":{"value":"<script>"},"items":[null,true,3]}');
  assert.equal(nodes[0].label, 'JSON');
  assert.equal(nodes[1].label, '__proto__');
  assert.equal(nodes[2].value, '"<script>"');
  assert.equal(nodes[2].parent, 1);
  assert.equal(nodes[4].label, '[0]');
  assert.equal(nodes[4].value, 'null');
  for (const text of [
    'not JSON',
    '['.repeat(17) + '0' + ']'.repeat(17),
    JSON.stringify(Array(2000).fill(0)),
    JSON.stringify('x'.repeat(256 * 1024)),
  ])
    assert.equal(jsonNodes(text), null);
});
function png(width = 2, height = 3) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test('JSON is formatted while XML and markup remain literal inert text', async () => {
  const json = await createPreview(utf8('{"value":"<img src=x onerror=alert(1)>"}'), {
    filename: 'metadata.json',
  });
  assert.equal(json.kind, 'text');
  assert.equal(json.text, '{\n  "value": "<img src=x onerror=alert(1)>"\n}');
  assert.equal(json.rawText, '{"value":"<img src=x onerror=alert(1)>"}');
  const xml = '<!DOCTYPE doc [<!ENTITY e SYSTEM "https://invalid.test/private">]><doc>&e;</doc>';
  assert.equal((await createPreview(utf8(xml), { filename: 'data.xml' })).text, xml);
  assert.equal(
    (await createPreview(utf8('<script>alert(1)</script>'), { filename: 'plain.txt' })).kind,
    'text',
  );
});

test('active formats, PDF and office files remain download-only even with a text MIME', async () => {
  for (const filename of [
    'test.html',
    'test.svg',
    'test.svgz',
    'test.pdf',
    'test.docx',
    'test.xlsx',
    'test.js',
  ]) {
    assert.equal(
      (await createPreview(utf8('<b>test</b>'), { filename, mimeType: 'text/plain' })).kind,
      'unavailable',
    );
    assert.equal(
      (
        await createPreview(utf8('<b>test</b>'), {
          filename: 'a'.repeat(200) + filename,
          mimeType: 'text/plain',
        })
      ).kind,
      'unavailable',
    );
  }
  assert.equal(
    (await createPreview(utf8('<svg/>'), { filename: 'image.xml', mimeType: 'image/svg+xml' })).kind,
    'unavailable',
  );
  assert.equal((await createPreview(utf8('arbitrary'), { filename: 'data.exe' })).kind, 'unavailable');
});

test('text size, invalid UTF-8 and binary control characters fail closed', async () => {
  assert.equal(
    (await createPreview(new Uint8Array(2 * 1024 * 1024 + 1), { filename: 'large.txt' })).kind,
    'unavailable',
  );
  assert.equal((await createPreview(Uint8Array.of(0xff), { filename: 'bad.txt' })).kind, 'unavailable');
  assert.equal((await createPreview(utf8('abc\u0000def'), { filename: 'binary.txt' })).kind, 'unavailable');
  const deepJson = '['.repeat(100) + '0' + ']'.repeat(100);
  assert.equal((await createPreview(utf8(deepJson), { filename: 'nested.json' })).text, deepJson);
});

test('image size and header dimensions are rejected before decoding', async () => {
  let calls = 0;
  const runtime = {
    createImageBitmap() {
      calls++;
    },
    URL: { createObjectURL() {} },
  };
  for (const bytes of [png(10000, 10000), png(0, 1), png(16385, 1), new Uint8Array(8 * 1024 * 1024 + 1)]) {
    assert.equal((await createPreview(bytes, { filename: 'image.png' }, runtime)).kind, 'unavailable');
  }
  assert.equal(calls, 0);
  assert.equal(
    (
      await createPreview(
        Uint8Array.of(0xff, 0xd8, 0xff, 0xc0, 0, 20),
        { filename: 'truncated.jpg' },
        runtime,
      )
    ).kind,
    'unavailable',
  );
});

function imageRuntime({ width = 2, height = 3, fail = false } = {}) {
  const state = { closed: 0, revoked: [], encoded: null, canvas: null };
  const runtime = {
    createImageBitmap: async () => ({
      width,
      height,
      close() {
        state.closed++;
      },
    }),
    OffscreenCanvas: class {
      constructor() {
        state.canvas = this;
      }
      getContext() {
        return { drawImage() {} };
      }
      async convertToBlob(options) {
        assert.equal(options.type, 'image/png');
        if (fail) throw new Error('decoder details');
        return new Blob(['canonical encoded pixels'], { type: 'image/png' });
      }
    },
    URL: {
      createObjectURL(blob) {
        state.encoded = blob;
        return 'blob:local-preview';
      },
      revokeObjectURL(url) {
        state.revoked.push(url);
      },
    },
  };
  return { state, runtime };
}

test('raster preview uses only re-encoded PNG and releases bitmap/canvas/object URL', async () => {
  const { state, runtime } = imageRuntime();
  const result = await createPreview(png(), { filename: '../image.png' }, runtime);
  assert.equal(result.kind, 'image');
  assert.equal(result.filename, 'image.png');
  assert.equal(await state.encoded.text(), 'canonical encoded pixels');
  assert.equal(state.closed, 1);
  assert.equal(state.canvas.width, 0);
  disposePreview(result);
  disposePreview(result);
  assert.deepEqual(state.revoked, ['blob:local-preview']);
});

test('mismatched decoded dimensions and conversion errors release resources without image URL', async () => {
  for (const options of [{ width: 4 }, { fail: true }]) {
    const { state, runtime } = imageRuntime(options);
    assert.equal((await createPreview(png(), { filename: 'test.png' }, runtime)).kind, 'unavailable');
    assert.equal(state.closed, 1);
    assert.equal(state.encoded, null);
  }
});

test('JPEG frame dimensions are checked and canonicalized too', async () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xc0, 0, 8, 8, 0, 3, 0, 2, 1);
  const { runtime } = imageRuntime();
  const result = await createPreview(jpeg, { filename: 'test.jpg', mimeType: 'image/jpeg' }, runtime);
  assert.equal(result.kind, 'image');
  disposePreview(result);
});
