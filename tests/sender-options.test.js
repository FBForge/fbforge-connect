import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationOptions, loadSendDestination, loadSendSchema } from '../frontend/src/sender-options.js';
import { jsonExample } from '../frontend/src/schema-examples.js';
import { generateExample } from '../frontend/src/generate-example.js';

const id = '00000000-0000-4000-8000-000000000001';
const destination = '00000000-0000-4000-8000-000000000002';
const schemaId = '00000000-0000-4000-8000-000000000003';
const session = { sessionId: id, apiVersion: 'v3', environment: 'TEST', connected: true };
const envelope = (data) => ({ apiVersion: 'v3', sessionId: id, environment: 'TEST', data });
const uri = 'https://example.invalid/application.schema.json';
const schema = { schemaUri: uri, mimeType: 'application/json' };

test('sender offers only services, schema pairs and process messages actually advertised by the recipient', async () => {
  const document = {
    destinationId: destination,
    publicServices: [
      {
        identifier: 'urn:test:service',
        name: 'Testleistung',
        regions: ['DE000000000000'],
        submissionSchemas: [schema],
        replyChannels: { fitConnect: { processStandards: ['urn:test:reply'] } },
      },
    ],
    processMessages: [{ processModelId: 'urn:test:model', messageId: 'request', schemas: [schema] }],
  };
  const result = await loadSendDestination(
    async (command, args) => {
      assert.equal(command, 'load_send_destination');
      assert.equal(args.destinationId, destination);
      return envelope({ destinationId: destination, detailsJson: JSON.stringify(document) });
    },
    session,
    destination,
  );
  assert.equal(result.services[0].name, 'Testleistung');
  assert.deepEqual(result.services[0].schemas, [schema]);
  assert.equal(result.services[0].replySchemas[0].schemaUri, 'urn:test:reply');
  assert.equal(result.processes[0].messageId, 'request');
  assert.deepEqual(destinationOptions({}).services, []);
});

test('schema paging keeps exact native identity, byte offsets and original UTF-8 across chunks', async () => {
  const original = JSON.stringify({ title: 'ä'.repeat(9000), type: 'object' }),
    bytes = new TextEncoder().encode(original);
  const calls = [];
  const result = await loadSendSchema(
    async (command, args) => {
      calls.push(command);
      const offset = args.byteOffset || 0;
      if (offset) assert.equal(args.contentId, schemaId);
      return envelope({
        schemaId,
        schemaUri: uri,
        totalBytes: bytes.length,
        byteOffset: offset,
        chunk: btoa(String.fromCharCode(...bytes.slice(offset, offset + 12 * 1024))),
      });
    },
    session,
    destination,
    { serviceIdentifier: 'urn:test:service', schemaUri: uri, processModelId: '', messageId: '' },
  );
  assert.equal(result, original);
  assert.deepEqual(calls, ['load_send_schema', 'read_send_schema']);
});

test('foreign or malformed schema pages never become generator input', async () => {
  const page = { schemaId, schemaUri: uri, totalBytes: 2, byteOffset: 0, chunk: 'e30=' };
  for (const patch of [
    { schemaUri: 'file:///secret' },
    { byteOffset: 1 },
    { totalBytes: 3 },
    { totalBytes: 24 * 1024 * 1024 + 1 },
    { chunk: 'e30=\n' },
    { schemaId: '../file' },
  ]) {
    await assert.rejects(
      loadSendSchema(async () => envelope({ ...page, ...patch }), session, destination, { schemaUri: uri }),
      /engine_protocol_error/,
    );
  }
});

test('schema generator creates fictional names and birth dates and respects required enum and local references', () => {
  const result = JSON.parse(
    jsonExample({
      type: 'object',
      required: ['vorname', 'nachname', 'geburtsdatum', 'status', 'adresse'],
      properties: {
        vorname: { type: 'string' },
        nachname: { type: 'string' },
        geburtsdatum: { type: 'string', format: 'date' },
        status: { enum: ['neu', 'erhalten'] },
        adresse: { $ref: '#/$defs/address' },
      },
      $defs: {
        address: { type: 'object', properties: { postleitzahl: { type: 'string', pattern: '^[0-9]{5}$' } } },
      },
    }),
  );
  assert.equal(result.vorname, 'Erika');
  assert.equal(result.nachname, 'Mustermann');
  assert.equal(result.geburtsdatum, '1985-04-12');
  assert.equal(result.status, 'neu');
  assert.match(result.adresse.postleitzahl, /^[0-9]{5}$/);
});

test('recursive, unresolved and impossible example schemas fail explicitly', () => {
  for (const schema of [
    { $ref: '#' },
    { $ref: 'https://example.invalid/external' },
    false,
    { type: 'array', minItems: 101, items: { type: 'string' } },
  ])
    assert.throws(() => jsonExample(schema));
});

test('schema type names cannot invoke inherited object methods or accept their results', () => {
  for (const type of [
    '__proto__',
    'constructor',
    'toString',
    'valueOf',
    'hasOwnProperty',
    '__defineSetter__',
    'unknown',
  ]) {
    for (const declared of [type, [type, 'null']]) {
      assert.throws(() => jsonExample({ type: declared, enum: ['fictional'] }), {
        name: 'Error',
        message: 'Kein erlaubter Auswahlwert erfüllt die Feldvorgaben.',
      });
    }
  }
  for (const [type, value] of [
    ['object', { fictional: true }],
    ['array', [1]],
    ['integer', 1],
    ['number', 1.5],
    ['boolean', false],
    ['null', null],
    ['string', 'fictional'],
    [['null', 'string'], 'fictional'],
  ]) {
    assert.deepEqual(JSON.parse(jsonExample({ type, enum: [value] })), value);
  }
});

test('fictional data also follows the loaded external schema graph', () => {
  const bundle = {
    schemaPackage: 1,
    schemaUri: 'https://example.invalid/root.json',
    documents: {
      'https://example.invalid/root.json': { $ref: 'person.json#/$defs/person' },
      'https://example.invalid/person.json': {
        $defs: { person: { type: 'object', properties: { vorname: { type: 'string' } } } },
      },
    },
  };
  assert.deepEqual(JSON.parse(jsonExample(bundle)), { vorname: 'Erika' });
});

test('JSON generation delegates untrusted constraints to a worker and always terminates it', async (t) => {
  let terminated = 0,
    input;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Worker', original);
    else delete globalThis.Worker;
  });
  globalThis.Worker = class {
    postMessage(source) {
      input = source;
      queueMicrotask(() => this.onmessage({ data: { output: '{"vorname":"Erika"}' } }));
    }
    terminate() {
      terminated++;
    }
  };
  const source = '{"type":"object","properties":{"vorname":{"type":"string"}}}';
  assert.equal(await generateExample(source, 'application/json', uri), '{"vorname":"Erika"}');
  assert.equal(input, source);
  assert.equal(terminated, 1);
});

test('API error bodies are unavailable schemas, including selected roots and external references', async () => {
  const unavailable = { result: 'error', error: { msg: 'Not Found', code: 404 } };
  for (const body of [
    unavailable,
    { error: { message: 'Not Found', code: 404 } },
    { type: 'about:blank', title: 'Not Found', status: 404 },
  ]) {
    assert.throws(() => jsonExample(body), /schema_unavailable/);
    await assert.rejects(
      generateExample(JSON.stringify(body), 'application/json', uri),
      /schema_unavailable/,
    );
    await assert.rejects(generateExample(JSON.stringify(body), 'application/xml', uri), /schema_unavailable/);
    assert.throws(
      () => jsonExample({ schemaPackage: 1, schemaUri: uri, documents: { [uri]: body } }),
      /schema_unavailable/,
    );
    assert.throws(
      () =>
        jsonExample({
          schemaPackage: 1,
          schemaUri: uri,
          documents: { [uri]: { $ref: 'error.json', minLength: 1 }, [new URL('error.json', uri).href]: body },
        }),
      /schema_unavailable/,
    );
  }
  assert.doesNotThrow(() => jsonExample(true));
  assert.doesNotThrow(() => jsonExample({}));
  assert.doesNotThrow(() =>
    jsonExample({ type: 'object', properties: { error: { type: 'string' }, result: { type: 'string' } } }),
  );
  assert.equal(JSON.parse(jsonExample({ const: unavailable })).result, 'error');
});
