import test from 'node:test';
import assert from 'node:assert/strict';
import { caseGroups, filterCaseGroups, defaultCaseMessage } from '../frontend/src/case-groups.js';
const record = (id, overrides = {}) => ({
  recordId: id,
  caseId: 'case-a',
  title: 'Antrag',
  kind: 'submission',
  direction: 'received',
  status: 'accepted',
  available: true,
  createdAt: '2026-10-20T10:00:00Z',
  ...overrides,
});
test('case grouping retains every original message and chronological order across time zones', () => {
  const records = [
    record('reply', { kind: 'reply', title: 'Antwort', createdAt: '2026-10-20T14:00:00+02:00' }),
    record('initial'),
    record('other', { caseId: 'case-b', createdAt: '2026-10-20T11:00:00Z' }),
  ];
  const before = JSON.stringify(records);
  const groups = caseGroups(records);
  assert.equal(JSON.stringify(records), before);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Antrag');
  assert.deepEqual(
    groups[0].messages.map((r) => r.recordId),
    ['initial', 'reply'],
  );
  assert.equal(defaultCaseMessage(groups[0]).recordId, 'initial');
});
test('search and direction select complete groups and exact message IDs choose the matching content', () => {
  const groups = caseGroups([
    record('initial', { submissionId: 'submission-a' }),
    record('reply', {
      kind: 'reply',
      direction: 'sent',
      replyId: 'reply-a',
      submissionId: 'submission-a',
      title: 'Bescheid',
      createdAt: '2026-10-20T11:00:00Z',
    }),
  ]);
  const result = filterCaseGroups(groups, 'reply-a', 'sent');
  assert.equal(result.length, 1);
  assert.equal(result[0].messages.length, 2);
  assert.equal(defaultCaseMessage(result[0], 'REPLY-A').recordId, 'reply');
  assert.equal(defaultCaseMessage(result[0], 'submission-a').recordId, 'initial');
  assert.equal(filterCaseGroups(groups, 'reply-a', 'received').length, 0);
});
test('missing case IDs stay independent and failed or unavailable messages remain visible', () => {
  const groups = caseGroups([
    record('one', { caseId: null, status: 'uncertain' }),
    record('two', { caseId: null, status: 'failed' }),
    record('gone', { available: false }),
    record('reply', { kind: 'reply' }),
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups.find((g) => g.caseId === 'case-a').attention.length, 1);
  assert.equal(defaultCaseMessage(groups.find((g) => g.caseId === 'case-a')).recordId, 'reply');
  assert.equal(
    caseGroups([record('gone', { available: false })]).flatMap((g) => defaultCaseMessage(g) || []).length,
    0,
  );
  assert.equal(caseGroups([record('reply', { kind: 'reply' })])[0].title, 'Vorgang');
});
