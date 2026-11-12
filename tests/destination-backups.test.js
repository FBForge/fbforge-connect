import test from 'node:test';
import assert from 'node:assert/strict';
import { backupSummary, destinationBackups, backupChanges } from '../frontend/src/destination-backups.js';
import { validDestinationExtras, withoutCallbackSecret } from '../frontend/src/destination-extras.js';
import { observeInvoke, createDiagnosticLog, buildSupportReport } from '../frontend/src/support-report.js';
const id = '11111111-1111-4111-8111-111111111111';
const session = { apiVersion: 'v3', sessionId: id, environment: 'TEST', connected: true };
const summary = () => ({
  id,
  name: 'Synthetic backup',
  environment: 'TEST',
  sourceDestinationId: id,
  capturedAt: 1,
  destinationName: 'Synthetic',
  type: 'A',
  registeredKeyCount: 2,
  callbackSecretMissing: false,
});
test('public backup responses never accept private material or unknown fields', async () => {
  assert.equal(backupSummary(summary()).registeredKeyCount, 2);
  for (const change of [
    { privateJwk: 'not-public' },
    { complete: true },
    { privateKeyCount: 3 },
    { environment: 'OTHER' },
  ])
    assert.throws(() => backupSummary({ ...summary(), ...change }));
  await assert.rejects(
    destinationBackups(
      async () => ({ summary: summary(), configuration: { privateJwk: 'never' } }),
      session,
      { action: 'inspect', id },
    ),
    /engine_protocol_error/,
  );
  const value = await destinationBackups(async () => ({ items: [summary()] }), session, { action: 'list' });
  assert.equal(value[0].registeredKeyCount, 2);
  await assert.rejects(
    destinationBackups(
      async () => assert.fail('v2 must not invoke'),
      { ...session, apiVersion: 'v2' },
      { action: 'list' },
    ),
    /session_missing/,
  );
});
test('applying a backup carries all editable offers while excluding identity and activation', () => {
  const config = {
    name: 'Synthetic',
    type: 'C',
    contactInformation: {
      legalName: 'Synthetic',
      email: 'test@example.invalid',
      phone: '123',
      address: 'Test',
    },
    metadataVersions: ['3.0.0'],
    publicServices: [],
    processMessages: [],
    senderAccessRestricted: { enabled: true, allowedSenderDestinations: [id] },
    publicForRouting: true,
  };
  const changes = backupChanges(config);
  assert.equal(Object.hasOwn(changes, 'type'), false);
  assert.equal(Object.hasOwn(changes, 'status'), false);
  assert.equal(Object.hasOwn(changes, 'publicServices'), false);
  assert.deepEqual(changes.senderAccessRestricted, config.senderAccessRestricted);
  changes.contactInformation.legalName = 'Edited';
  assert.equal(config.contactInformation.legalName, 'Synthetic');
});
test('optional fields validate HTTPS and restrictions and redact write-only callback secrets', () => {
  const secret = 'synthetic-callback-secret-of-sufficient-length';
  const fields = {
    callback: { url: 'https://example.invalid/callback', secret },
    senderAccessRestricted: { enabled: true, allowedSenders: [], allowedSenderDestinations: [id] },
    publicForRouting: true,
  };
  assert.equal(validDestinationExtras(fields), true);
  assert.equal(JSON.stringify(withoutCallbackSecret(fields)).includes(secret), false);
  for (const bad of [
    { callback: { url: 'http://example.invalid' } },
    { callback: { url: 'https://user:secret@example.invalid' } },
    { callback: { url: 'https://example.invalid', secret: 'short' } },
    { senderAccessRestricted: { enabled: true, allowedSenderDestinations: ['foreign'] } },
    { publicForRouting: 'true' },
  ])
    assert.equal(validDestinationExtras(bad), false);
});
test('diagnostics record backup failures without passwords or key material', async () => {
  const log = createDiagnosticLog();
  const invoke = observeInvoke(async () => {
    throw 'backup_invalid';
  }, log.record);
  await assert.rejects(
    destinationBackups(invoke, session, { action: 'import', password: 'synthetic-private-password' }),
    (error) => error === 'backup_invalid',
  );
  const report = buildSupportReport({ version: '0.4.0', selectedApi: 'v3', entries: log.snapshot() });
  assert.equal(report.operations[0].code, 'backup_invalid');
  assert.equal(JSON.stringify(report).includes('synthetic-private-password'), false);
});
