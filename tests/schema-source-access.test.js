import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, ref } from 'vue';
import { createSchemaSourceAccess, withSchemaSourceAccess } from '../frontend/src/schema-source-access.js';

test('a grant expires on API or connection changes and is never persisted', () => {
  const scope = effectScope();
  scope.run(() => {
    const session = ref({ sessionId: 'first', apiVersion: 'v3' });
    const access = createSchemaSourceAccess(() => session.value);
    access.allowed.value = true;
    session.value.apiVersion = 'v2';
    assert.equal(access.allowed.value, false);
    access.allowed.value = true;
    session.value.sessionId = 'second';
    assert.equal(access.allowed.value, false);
    access.allowed.value = true;
    session.value = null;
    assert.equal(access.allowed.value, false);
  });
  scope.stop();
});

test('only missing consent asks and only explicit approval repeats a read once', async () => {
  let calls = 0,
    prompts = 0,
    allowed = false;
  const operation = () => {
    calls++;
    if (!allowed) throw new Error('schema_consent_required');
    return 'schema';
  };
  const request = () => {
    prompts++;
    allowed = true;
    return true;
  };
  assert.equal(await withSchemaSourceAccess(operation, request), 'schema');
  assert.equal(calls, 2);
  assert.equal(prompts, 1);
  assert.equal(await withSchemaSourceAccess(operation, request), 'schema');
  assert.equal(prompts, 1);
  await assert.rejects(
    withSchemaSourceAccess(() => {
      throw 'schema_network_error';
    }, request),
    (error) => error === 'schema_network_error',
  );
  assert.equal(prompts, 1);
});

test('cancel, stale context and a second refusal never retry again', async () => {
  let calls = 0,
    prompts = 0;
  const operation = () => {
    calls++;
    throw 'schema_consent_required';
  };
  await assert.rejects(
    withSchemaSourceAccess(operation, () => false),
    /content_cancelled/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    withSchemaSourceAccess(
      operation,
      () => {
        prompts++;
        return true;
      },
      () => false,
    ),
    /content_cancelled/,
  );
  assert.equal(prompts, 0);
  let current = true;
  await assert.rejects(
    withSchemaSourceAccess(
      operation,
      () => {
        current = false;
        return true;
      },
      () => current,
    ),
    /content_cancelled/,
  );
  assert.equal(calls, 3);
  await assert.rejects(
    withSchemaSourceAccess(operation, () => true),
    (error) => error === 'schema_consent_required',
  );
  assert.equal(calls, 5);
});
