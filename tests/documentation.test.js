import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { documentationUrl, documentationTopics } from '../frontend/src/documentation.js';
import { helpTopics } from '../docs/guide/topics.js';
import { serviceLabel } from '../frontend/src/service-label.js';

test('documentation uses fixed versioned chapters without message or credential context', async () => {
  assert.deepEqual(
    documentationTopics.map((topic) => topic.id).sort(),
    helpTopics.map((topic) => topic.id).sort(),
  );
  for (const topic of documentationTopics)
    assert.equal(new URL(documentationUrl(topic.id)).origin, 'https://fbforge.de');
  for (const topic of ['__proto__', '../secret', 'start?token=secret', 'https://example.org'])
    assert.throws(() => documentationUrl(topic), /invalid_input/);
  const native = await readFile(new URL('../desktop/src/documentation_links.rs', import.meta.url), 'utf8');
  for (const { id } of documentationTopics) assert.ok(native.includes(`"${id}"`));
});

test('web guide exports complete chapters with escaped executable examples', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'connect-guide-'));
  try {
    const destination = join(temp, 'guide');
    await promisify(execFile)(process.execPath, ['scripts/export-guide.mjs', destination]);
    for (const topic of helpTopics) {
      const html = await readFile(join(destination, `${topic.id}.html`), 'utf8');
      assert.ok(html.includes(`https://fbforge.de/connect/hilfe/0.2/${topic.id}`));
      assert.ok(html.includes('Vorschau für Version 0.2.0'));
      assert.ok(html.includes(`images/${topic.image}.png`));
      assert.ok(!html.includes('<bpmn:definitions'), 'XML examples must remain escaped text');
      assert.ok(!html.includes('client_secret='));
    }
    const builtHelp = await readFile(new URL('../frontend/src/ApplicationHelp.vue', import.meta.url), 'utf8');
    assert.ok(!builtHelp.includes('topics.js'));
    assert.ok(!builtHelp.includes('screenshots'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('LeiKa labels preserve supplied names and never invent an administrative service title', () => {
  const id = 'urn:de:fim:leika:leistung:99003002022000';
  assert.equal(serviceLabel(id, 'Fiktive Leistung').option, 'Fiktive Leistung · 99003002022000');
  assert.equal(serviceLabel(id, id).hasName, false);
  assert.equal(serviceLabel(id).title, 'Leistung 99003002022000');
  assert.equal(serviceLabel('urn:test:service', 'Testleistung').identifier, 'urn:test:service');
  assert.equal(serviceLabel(null).title, 'Leistung nicht angegeben');
});
