import test from 'node:test';
import assert from 'node:assert/strict';
import { importKeyFiles } from '../frontend/src/key-files.js';

const file = (name, value) => {
  const bytes = new TextEncoder().encode(value);
  return { name, size: bytes.length, bytes, arrayBuffer: async () => bytes.buffer };
};

test('multiple key files import sequentially, continue after rejection and clear read buffers', async () => {
  const files = [file('decrypt.jwk', 'decrypt'), file('wrong.jwk', 'wrong'), file('sign.pem', 'sign')];
  const calls = []; let pending = false;
  const result = await importKeyFiles(files, async document => {
    assert.equal(pending, false); pending = true;
    await Promise.resolve(); calls.push(document); pending = false;
    if (document === 'wrong') throw new Error('key_rejected');
    return { keys: calls.filter(value => value !== 'wrong') };
  }, () => true);
  assert.deepEqual(calls, ['decrypt', 'wrong', 'sign']);
  assert.equal(result.imported, 2);
  assert.deepEqual(result.state.keys, ['decrypt', 'sign']);
  assert.deepEqual(result.failures, [{ name: 'wrong.jwk', code: 'key_rejected' }]);
  for (const item of files) assert.ok(item.bytes.every(byte => byte === 0));
});

test('key batch rejects oversize and malformed UTF-8 files without importing them', async () => {
  let reads = 0;
  const invalid = new Uint8Array([255]);
  const files = [{ name: 'large', size: 32769, arrayBuffer: () => { reads++; } },
    { name: 'invalid', size: 1, arrayBuffer: async () => invalid.buffer }, file('valid', 'key')];
  const calls = [];
  const result = await importKeyFiles(files, async value => { calls.push(value); return { keys: [value] }; }, () => true);
  assert.equal(reads, 0); assert.deepEqual(calls, ['key']);
  assert.deepEqual(result.failures.map(item => item.code), ['invalid_input', 'file_invalid']);
  assert.equal(invalid[0], 0);
  await assert.rejects(importKeyFiles(Array(17).fill(files[0]), () => assert.fail(), () => true), /invalid_input/);
});

test('session change during a file read stops the batch before native import', async () => {
  let current = true;
  const bytes = new TextEncoder().encode('key');
  const result = await importKeyFiles([{ name: 'key', size: 3, arrayBuffer: async () => {
    current = false; return bytes.buffer;
  } }, file('later', 'later')], () => assert.fail('Stale key reached native import'), () => current);
  assert.equal(result, null); assert.ok(bytes.every(byte => byte === 0));
});

test('a broken native connection stops the remaining batch instead of treating it as a bad file', async () => {
  let calls = 0;
  await assert.rejects(importKeyFiles([file('first', 'one'), file('second', 'two')], async () => {
    calls++; throw new Error('engine_disconnected');
  }, () => true), /engine_disconnected/);
  assert.equal(calls, 1);
});
