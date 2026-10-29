import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedLocalScanner, scannerError } from '../frontend/src/local-scanner.js';
import { checkedBlockedAttachments, readScannerReport } from '../frontend/src/scanner-report.js';

const status = () => ({
  installed: true,
  ready: false,
  enabled: true,
  automaticUpdates: false,
  engineVersion: '1.5.4',
  databaseVersion: 28168,
  databaseCreatedAt: 1793255040,
  databaseAgeDays: 0,
  lastUpdate: null,
  updateFailed: false,
  busy: true,
  operation: 'starting',
  error: null,
  downloadedBytes: 0,
  downloadTotalBytes: 225774978,
});
test('scanner state distinguishes installed, enabled and ready without fabricating successful updates', () => {
  const value = checkedLocalScanner(status());
  assert.equal(value.installed, true);
  assert.equal(value.enabled, true);
  assert.equal(value.ready, false);
  assert.equal(value.lastUpdate, null);
  assert.ok(Object.isFrozen(value));
  assert.equal(
    checkedLocalScanner({ ...status(), updateFailed: true, databaseAgeDays: 35 }).databaseAgeDays,
    35,
  );
  for (const patch of [
    { ready: 'yes' },
    { databaseVersion: -1 },
    { operation: 'run-shell' },
    { downloadedBytes: 225774979 },
    { engineVersion: '<script>' },
    { extra: true },
    { error: 'https://private.example/token' },
  ])
    assert.throws(() => checkedLocalScanner({ ...status(), ...patch }), /engine_protocol_error/);
});
test('blocked attachment report preserves identities but cannot introduce a download capability', () => {
  const item = { attachmentId: '44444444-4444-4444-8444-444444444444', fileName: 'Anlage.pdf' };
  const report = readScannerReport(JSON.stringify({ version: 1, blockedAttachments: [item] }));
  assert.deepEqual(report, [item]);
  assert.ok(Object.isFrozen(report[0]));
  for (const items of [
    [item, item],
    [{ ...item, fileName: 'bad\nname' }],
    [{ ...item, contentId: 'download-capability' }],
    [{ ...item, attachmentId: '../other' }],
  ])
    assert.throws(() => checkedBlockedAttachments(items), /engine_protocol_error/);
  assert.throws(() => readScannerReport('{"version":2,"blockedAttachments":[]}'), /engine_protocol_error/);
  assert.match(scannerError('scanner_database_rollback'), /ältere Signaturen/);
  assert.match(scannerError('content_cancelled'), /beibehalten|erhalten/);
  assert.ok(!scannerError('untrusted server message').includes('untrusted'));
});
