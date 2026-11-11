import test from 'node:test';
import assert from 'node:assert/strict';
import original from '../frontend/src/examples/integration.fctest.json' with { type: 'json' };
import { scenarioFrom } from '../frontend/src/integration/scenarios/model.ts';
import { messageFields } from '../frontend/src/integration/scenarios/fields.ts';
import { checkMessage } from '../frontend/src/integration/scenarios/expectations.ts';
import { resultExport } from '../frontend/src/integration/scenarios/report.ts';
const setup = (data, mimeType = 'application/json') => {
  const s = scenarioFrom(original),
    item = s.pack.cases[0];
  s.comparison = 'field-exceptions';
  item.request.data = data;
  item.request.mimeType = mimeType;
  return {
    s,
    item,
    check: (actual) => checkMessage(actual, item.request, s, item.id, 'request', item.request),
  };
};
function dateRule(s, item, path) {
  s.rules.push({
    id: crypto.randomUUID(),
    caseId: item.id,
    scope: 'request',
    path,
    operator: 'date',
    value: '',
  });
}
test('field conditions permit only proven scalar differences while comparing all remaining JSON', () => {
  const { s, item, check } = setup('{"date":"2026-01-01","n":9007199254740993,"list":[1,2],"empty":{}}');
  dateRule(s, item, '/date');
  assert.deepEqual(check('{"date":"2026-02-01","n":9007199254740993,"list":[1,2],"empty":{}}'), []);
  for (const change of ['"n":9007199254740992', '"list":[2,1]', '"empty":[]', '"extra":1,"empty":{}']) {
    const actual = item.request.data.replace(
      change.startsWith('"n"')
        ? '"n":9007199254740993'
        : change.startsWith('"list"')
          ? '"list":[1,2]'
          : '"empty":{}',
      change,
    );
    assert.ok(check(actual).length, change);
  }
  assert.ok(check(item.request.data.replace('2026-01-01', 'invalid-date')).length);
  assert.ok(check('{"n":9007199254740993,"list":[1,2],"empty":{}}').length);
  assert.ok(check('{"date":"2026-01-01","date":"2026-01-02"}').length);
});
test('escaped JSON pointers mask only their precise leaf', () => {
  const { s, item, check } = setup('{"a/b":{"~d":"2026-01-01"},"other":1}');
  dateRule(s, item, '/a~1b/~0d');
  assert.deepEqual(check('{"a/b":{"~d":"2026-04-01"},"other":1}'), []);
  assert.ok(check('{"a/b":{},"other":1}').length);
});
test('XML field conditions retain namespaces, mixed text and element order', () => {
  const { s, item, check } = setup(
    '<r xmlns="urn:test"><date>2026-01-01</date><x>before<b/>after</x></r>',
    'application/xml',
  );
  dateRule(
    s,
    item,
    messageFields(item.request.data, item.request.mimeType).find((f) => f.label === 'date').path,
  );
  assert.deepEqual(
    check('<p:r xmlns:p="urn:test"><p:date>2026-02-01</p:date><p:x>before<p:b/>after</p:x></p:r>'),
    [],
  );
  assert.ok(check('<r xmlns="urn:test"><date>2026-02-01</date><x>after<b/>before</x></r>').length);
  assert.ok(check('<r xmlns="urn:other"><date>2026-02-01</date><x>before<b/>after</x></r>').length);
});
test('result exports declare comparison scope and disclose rule values only by explicit choice', () => {
  const { s, item } = setup('{"id":"private-value"}');
  s.rules.push({
    id: crypto.randomUUID(),
    caseId: item.id,
    scope: 'request',
    path: '/id',
    operator: 'equals',
    value: 'private-value',
  });
  const run = { definition: s, assignment: { apiVersion: 'v3' }, attempts: [] };
  const safe = resultExport(run);
  assert.equal(safe.checkScope.comparison, 'field-exceptions');
  assert.equal(safe.checkScope.rules[0].path, '/id');
  assert.ok(!JSON.stringify(safe).includes('private-value'));
  assert.equal(resultExport(run, true).checkScope.rules[0].value, 'private-value');
});
