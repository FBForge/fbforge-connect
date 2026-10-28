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
      assert.ok(html.includes('Anleitung für Version 0.2.0'));
      assert.ok(html.includes('<a href="/connect">FBForge Connect</a>'));
      assert.ok(!html.includes('>Connect</a>'));
      for (const picture of [topic, ...(topic.illustrations || [])]) {
        assert.ok(html.includes(`images/${picture.image}.png`));
        assert.ok((await readFile(join(destination, 'images', `${picture.image}.png`))).length > 0);
      }
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

test('wiki guide exports the same steps, examples and images into versioned chapters', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'connect-wiki-'));
  try {
    const destination = join(temp, 'wiki');
    await promisify(execFile)(process.execPath, ['scripts/export-wiki.mjs', destination]);
    const index = await readFile(join(destination, 'Version-0.2.md'), 'utf8');
    const sidebar = await readFile(join(destination, '_Sidebar.md'), 'utf8');
    for (const topic of helpTopics) {
      assert.ok(index.includes(`](0.2-${topic.id})`));
      assert.ok(sidebar.includes(`](0.2-${topic.id})`));
      const markdown = await readFile(join(destination, `0.2-${topic.id}.md`), 'utf8');
      assert.ok(markdown.includes('Anleitung für Version 0.2.0'));
      for (const text of [topic.intro, ...topic.steps, ...topic.notes]) assert.ok(markdown.includes(text));
      for (const example of topic.examples || []) assert.ok(markdown.includes(example.content));
      for (const picture of [topic, ...(topic.illustrations || [])]) {
        assert.ok(markdown.includes(`/images/0.2/${picture.image}.png`));
        assert.deepEqual(
          await readFile(join(destination, 'images', '0.2', `${picture.image}.png`)),
          await readFile(new URL(`../docs/guide/images/${picture.image}.png`, import.meta.url)),
        );
      }
    }
    await assert.rejects(readFile(join(destination, 'Schnellstart.md')), { code: 'ENOENT' });
    await assert.rejects(readFile(join(destination, 'Antworten-testen.md')), { code: 'ENOENT' });
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
