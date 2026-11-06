import test from 'node:test';
import assert from 'node:assert/strict';
import { contentDifferences } from '../frontend/src/integration/scenarios/content-differences.ts';
import { checkMessage } from '../frontend/src/integration/scenarios/expectations.ts';
import { addAttempt, validateRun } from '../frontend/src/integration/scenarios/runs.ts';
import { resultExport, ticketResult } from '../frontend/src/integration/scenarios/report.ts';
import { detailLimit } from '../frontend/src/integration/scenarios/run-details.ts';
import { fieldSnippet } from '../frontend/src/integration/scenarios/fields.ts';
import { scenario, runFor } from './helpers/scenarios.js';

test('full JSON comparisons explain lossless numbers, scalar types, added and removed fields and containers', () => {
  const expected = '{"id":9007199254740993,"value":"1","gone":true,"empty":{}}';
  const actual = '{"id":9007199254740992,"value":1,"new":false,"empty":[]}';
  const rows = contentDifferences(actual, expected, 'application/json');
  for (const path of ['/id', '/value', '/gone', '/new', '/empty'])
    assert.ok(
      rows.some((d) => d.path === path),
      path,
    );
  assert.match(rows.find((d) => d.path === '/id').expected, /9007199254740993/);
  assert.match(rows.find((d) => d.path === '/value').expected, /text/);
  assert.match(rows.find((d) => d.path === '/value').actual, /number/);
  assert.equal(rows.find((d) => d.path === '/gone').actual, 'Fehlt');
  assert.equal(rows.find((d) => d.path === '/new').expected, 'Nicht vorhanden');
  assert.match(rows.find((d) => d.path === '/empty').actual, /Liste/);
  assert.equal(
    contentDifferences('[1]', '[1,2]', 'application/json').some((d) => d.path === '/1'),
    true,
  );
  assert.ok(contentDifferences('true', 'null', 'application/json').some((d) => d.path === '$'));
});
test('XML differences retain expanded namespaces, attributes, mixed text and child order', () => {
  const expected = '<a:r xmlns:a="urn:x" n="1">Text<a:c>A</a:c>Ende<a:d/></a:r>';
  const actual = '<b:r xmlns:b="urn:x" n="2">Neu<b:d/>Ende<b:c>A</b:c></b:r>';
  const rows = contentDifferences(actual, expected, 'application/xml');
  assert.ok(rows.some((d) => d.path.endsWith('/@%7B%7Dn')));
  assert.ok(rows.some((d) => d.path.endsWith('text()[1]')));
  assert.ok(
    rows.some(
      (d) =>
        d.path.endsWith('/Reihenfolge') && d.expected.includes('{urn:x}c') && d.actual.includes('{urn:x}d'),
    ),
  );
  assert.ok(rows.every((d) => !d.path.includes('a:') && !d.path.includes('b:')));
});
test('detail limits and lexical XML differences never turn a failed full comparison into success', () => {
  const s = scenario(),
    expected = { ...s.pack.cases[0].request, mimeType: 'application/xml', data: '<r a="1"/>' };
  assert.equal(checkMessage('<r a="1"></r>', expected, s, s.pack.cases[0].id, 'request', expected).length, 1);
  s.comparison = 'xml-structure';
  assert.deepEqual(checkMessage('<r a="1"></r>', expected, s, s.pack.cases[0].id, 'request', expected), []);
  assert.equal(contentDifferences('bad', '{}', 'application/json').length, 1);
  const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['field' + i, i]));
  assert.equal(contentDifferences('{}', JSON.stringify(many), 'application/json').length, 21);
  const deep = '['.repeat(70) + '0' + ']'.repeat(70);
  assert.equal(contentDifferences(deep, '{}', 'application/json').length, 1);
  assert.equal(contentDifferences('<!DOCTYPE r><r/>', '<r/>', 'application/xml').length, 1);
  const repeatedNamespace = `<r xmlns:p="urn:${'x'.repeat(1000)}">${'<p:c/>'.repeat(1200)}</r>`;
  assert.equal(
    contentDifferences(repeatedNamespace, '<r/>', 'application/xml')[0].path,
    'Dokumentstruktur oder Schreibweise',
  );
  const oversizedNamespace = `<r xmlns:p="urn:${'x'.repeat(10000)}"><p:c/></r>`;
  assert.equal(
    contentDifferences(oversizedNamespace, '<r/>', 'application/xml')[0].path,
    'Dokumentstruktur oder Schreibweise',
  );
});
test('differences persist after serialization with explicit truncation and a bounded total detail budget', async () => {
  const run = await runFor(scenario());
  const rows = Array.from({ length: 30 }, (_, i) => ({
    path: `/field${i}`,
    expected: 'x'.repeat(600),
    actual: 'y'.repeat(600),
  }));
  addAttempt(run, {
    status: 'failed',
    detail: 'Fiktiver Vergleich',
    recordId: null,
    differences: rows,
    context: { caseId: crypto.randomUUID(), submissionId: crypto.randomUUID(), replyId: null },
  });
  assert.equal(run.attempts[0].differences.length, 20);
  assert.equal(run.attempts[0].differencesOmitted, true);
  assert.equal(run.attempts[0].differences[0].expected.length, 512);
  for (let i = 0; i < 10; i++)
    addAttempt(run, { status: 'failed', detail: 'Erneuter Vergleich', recordId: null, differences: rows });
  const restored = validateRun(JSON.parse(JSON.stringify(run)));
  assert.deepEqual(restored.attempts, run.attempts);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(restored.attempts.map((a) => a.differences))).length <
      detailLimit,
  );
  assert.equal(restored.attempts.at(-1).differencesOmitted, true);
  assert.equal(restored.attempts.at(-1).differences.length, 0);
  for (const edit of [
    (d) => {
      d.attempts[0].differences[0].path = '';
    },
    (d) => {
      d.attempts[0].differences[0].actual = 'x'.repeat(513);
    },
    (d) => {
      d.attempts[0].differences[0].extra = 'forbidden';
    },
    (d) => {
      d.attempts[0].differencesOmitted = 'yes';
    },
    (d) => {
      d.attempts[0].context.caseId = '../outside';
    },
  ]) {
    const value = structuredClone(restored);
    edit(value);
    assert.throws(() => validateRun(value));
  }
});
test('ticket summaries and default result exports omit compared field values while opt-in preserves them', async () => {
  const run = await runFor(scenario());
  addAttempt(run, {
    status: 'failed',
    detail: 'Fachdaten weichen ab',
    recordId: null,
    differences: [{ path: '/secret', expected: 'EXPECTED_PRIVATE', actual: 'ACTUAL_PRIVATE' }],
  });
  const ticket = ticketResult(run),
    normal = JSON.stringify(resultExport(run)),
    detailed = JSON.stringify(resultExport(run, true));
  for (const output of [ticket, normal]) {
    assert.doesNotMatch(output, /EXPECTED_PRIVATE|ACTUAL_PRIVATE/);
    assert.doesNotMatch(output, /base64|clientSecret/);
  }
  assert.match(normal, /\/secret/);
  assert.match(detailed, /EXPECTED_PRIVATE/);
  assert.match(detailed, /ACTUAL_PRIVATE/);
  assert.match(ticket, /1 gespeicherte Abweichungen/);
  assert.match(ticket, /Kein|keine/);
});
test('truncated Unicode details remain valid UTF-8 for native JSON persistence', async () => {
  const run = await runFor(scenario());
  const rows = contentDifferences(
    JSON.stringify({ text: '😀'.repeat(300) }),
    '{"text":"expected"}',
    'application/json',
  );
  rows.push({ path: '😀'.repeat(600), expected: '😀'.repeat(300), actual: 'x\ud800y' });
  addAttempt(run, { status: 'failed', detail: 'Unicode-Vergleich', recordId: null, differences: rows });
  for (const row of run.attempts[0].differences)
    for (const value of Object.values(row)) assert.equal(value.isWellFormed(), true);
  assert.equal(run.attempts[0].differencesOmitted, true);
  assert.deepEqual(validateRun(JSON.parse(JSON.stringify(run))), run);
  assert.equal(fieldSnippet('A😀B', 2), 'A');
  assert.equal(fieldSnippet('A😀B', 3), 'A😀');
  assert.equal(fieldSnippet('', 0), '');
});
