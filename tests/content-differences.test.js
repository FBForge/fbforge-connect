import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentDifferences } from '../frontend/src/integration/content-differences.js';
test('content differences identify missing, additional and changed values without changing equality rules', () => {
  assert.deepEqual(
    contentDifferences(
      '{"items":[{"status":"wrong"}],"extra":1}',
      '{"items":[{"status":"expected"}],"required":true}',
      'application/json',
    ).map((row) => row.path),
    ['$["items"]["0"]["status"]', '$["required"]', '$["extra"]'],
  );
  assert.deepEqual(contentDifferences('{"b":2,"a":1}', '{"a":1,"b":2}', 'application/json'), []);
  assert.ok(
    contentDifferences('{"n":9007199254740993}', '{"n":9007199254740992}', 'application/json').length,
  );
  assert.equal(
    contentDifferences('{', '{}', 'application/json')[0].actual,
    'JSON konnte nicht gelesen werden',
  );
  assert.equal(contentDifferences('<a>1</a>', '<a>2</a>', 'application/xml')[0].path, '$');
  const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i, i]));
  assert.equal(contentDifferences(JSON.stringify(many), '{}', 'application/json').length, 20);
});
