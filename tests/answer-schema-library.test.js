import test from 'node:test';
import assert from 'node:assert/strict';
import { channelTemplate, createChannelSchema } from '../frontend/src/channel-schemas.js';
import {
  readAnswerSchema,
  saveAnswerSchema,
  savedAnswerSchemaFile,
} from '../frontend/src/answer-schema-library.js';
import { loadReplySchema } from '../frontend/src/reply-sending.js';
import { withSavedSchemaCatalog } from '../frontend/src/saved-schema-catalog.js';
const id = '11111111-1111-4111-8111-111111111111';
const session = { sessionId: id, apiVersion: 'v3', connected: true, environment: 'TEST' };
const result = createChannelSchema(channelTemplate());
const entry = {
  uri: result.schema.$id,
  title: result.schema.title,
  revision: id,
  schema: result.schema,
  draft: result.draft,
};
const summary = { uri: entry.uri, title: entry.title, revision: entry.revision };
test('schema library validates native identity, accepts native JSON key order and passes optimistic revisions', async () => {
  const sorted = (v) =>
    v && typeof v === 'object'
      ? Array.isArray(v)
        ? v.map(sorted)
        : Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, value]) => [k, sorted(value)]),
          )
      : v;
  const read = await readAnswerSchema(async () => sorted(entry), session, entry.uri);
  assert.deepEqual(read.schema, entry.schema);
  const file = await savedAnswerSchemaFile(async () => entry, session, entry.uri);
  assert.deepEqual(JSON.parse(await file.text()), result.schema);
  let request;
  await saveAnswerSchema(
    async (command, args) => {
      assert.equal(command, 'profile_answer_schemas');
      request = args;
      return [summary];
    },
    session,
    result,
    read,
  );
  assert.equal(request.action.expectedRevision, id);
  assert.notEqual(request.action.entry.revision, id);
  for (const patch of [
    { uri: 'urn:test:foreign' },
    { schema: { ...entry.schema, additionalProperties: true } },
    { revision: '../invalid' },
  ])
    await assert.rejects(
      readAnswerSchema(async () => ({ ...entry, ...patch }), session, entry.uri),
      /schema_library_invalid/,
    );
});
test('reply schemas resolve offline by URI and still pass through native schema loading and staging cleanup', async () => {
  const calls = [],
    contents = new Map();
  const wrap = (data) => ({ apiVersion: session.apiVersion, sessionId: id, environment: 'TEST', data });
  const proof = { proofId: id, destinationId: id, submissionId: id, caseId: id };
  const invoke = async (command, args) => {
    calls.push(command);
    if (command === 'profile_answer_schemas') {
      assert.equal(args.action.uri, entry.uri);
      return entry;
    }
    if (command === 'begin_content') {
      contents.set(id, { totalBytes: args.totalBytes, receivedBytes: 0 });
      return wrap({ contentId: id, ...contents.get(id), complete: false });
    }
    if (command === 'append_content') {
      const item = contents.get(id);
      item.receivedBytes += Buffer.from(args.chunk, 'base64').length;
      return wrap({ contentId: id, ...item, complete: true });
    }
    if (command === 'discard_content') {
      contents.delete(id);
      return wrap({ contentId: id });
    }
    assert.equal(command, 'load_reply_schema');
    assert.deepEqual(JSON.parse(args.schemaDocument), {
      schemaUri: entry.uri,
      mimeType: 'application/json',
      allowExternalSchemas: false,
      schemaContentId: id,
    });
    return wrap({ schemaId: id, schemaUri: entry.uri, totalBytes: 2, byteOffset: 0, chunk: 'e30=' });
  };
  const loaded = await loadReplySchema(invoke, session, proof, {
    schemaUri: entry.uri,
    mimeType: 'application/json',
    allowExternalSchemas: false,
  });
  assert.equal(loaded.document, '{}');
  assert.equal(contents.size, 0);
  assert.equal(calls.at(-1), 'discard_content');
});
test('explicit schema handles take precedence and a broken library cannot authorize external fetching', async () => {
  const selected = [{ uri: entry.uri, contentId: id }];
  const value = await withSavedSchemaCatalog(
    async (command, args) => {
      assert.equal(command, 'profile_answer_schemas');
      assert.equal(args.action.action, 'list');
      return [summary];
    },
    session,
    selected,
    async (catalog) => catalog,
  );
  assert.deepEqual(value, selected);
  await assert.rejects(
    withSavedSchemaCatalog(
      async () => {
        throw Error('vault_unavailable');
      },
      session,
      [],
      () => assert.fail('No verification on a failed library read'),
    ),
    /vault_unavailable/,
  );
});
