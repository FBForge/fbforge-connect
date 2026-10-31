import test from 'node:test';
import assert from 'node:assert/strict';
import { generalWarnings } from '../frontend/src/receive/presentation.ts';
test('scanner summary deduplication preserves schema, blocked-attachment and unknown warnings', () => {
  const warnings = [
    'MALWARE_SCAN_NOT_CONFIGURED',
    'MALWARE_SCAN_PASSED',
    'DATA_SCHEMA_INVALID',
    'MALWARE_ATTACHMENT_BLOCKED',
    'FUTURE_WARNING',
  ];
  assert.deepEqual(generalWarnings(warnings), [
    'DATA_SCHEMA_INVALID',
    'MALWARE_ATTACHMENT_BLOCKED',
    'FUTURE_WARNING',
  ]);
  assert.equal(warnings.length, 5);
});
