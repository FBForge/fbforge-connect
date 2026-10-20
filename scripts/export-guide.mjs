// Build static documentation from one maintained source. No application bundle is required.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { helpTopics } from '../docs/guide/topics.js';
import { documentationTopics, documentationRoot } from '../frontend/src/documentation.js';
const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw new Error('Aufruf: node scripts/export-guide.mjs <neues-Ausgabeverzeichnis>');
const directory = resolve(output);
const source = new URL('../docs/guide/', import.meta.url);
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const base = new URL(documentationRoot).pathname;
if (
  helpTopics.length !== documentationTopics.length ||
  helpTopics.some(
    (topic) => !documentationTopics.some((item) => item.id === topic.id && item.title === topic.title),
  )
)
  throw new Error('Hilfethemen und Anwendung stimmen nicht überein.');
await mkdir(directory, { recursive: false });
await mkdir(join(directory, 'images'));
for (const name of ['guide.css', 'guide.js']) await copyFile(new URL(name, source), join(directory, name));
for (const topic of helpTopics) {
  const pictures = [{ image: topic.image, caption: topic.caption }, ...(topic.illustrations || [])];
  if (!/^[a-z-]+$/.test(topic.id) || pictures.some((picture) => !/^[a-z-]+$/.test(picture.image)))
    throw new Error('Ungültiger Kapitel- oder Bildname.');
  const next = helpTopics[helpTopics.indexOf(topic) + 1];
  const examples = (topic.examples || [])
    .map(
      (example, index) =>
        `<section><h3>${escape(example.title)}</h3>${example.note ? `<p>${escape(example.note)}</p>` : ''}<pre tabindex="0" aria-label="${escape(example.title)}"><code id="example-${index}">${escape(example.content)}</code></pre><button type="button" data-copy="example-${index}">${escape(example.title)} kopieren</button></section>`,
    )
    .join('');
  const figures = pictures
    .map(
      ({ image, caption }) =>
        `<figure><a href="${base}/images/${image}.png"><img src="${base}/images/${image}.png" alt="${escape(caption)}" width="1440" height="1000" loading="lazy"></a><figcaption>${escape(caption)} Bild zum Vergrößern öffnen.</figcaption></figure>`,
    )
    .join('');
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(topic.title)} · FBForge Connect</title><meta name="description" content="${escape(topic.intro)}"><link rel="canonical" href="${documentationRoot}/${topic.id}"><link rel="stylesheet" href="${base}/guide.css"><script src="${base}/guide.js" defer></script></head>
<body><a class="skip" href="#inhalt">Zum Inhalt</a><header><a class="brand" href="/">FBForge</a><a href="/connect">Connect</a><span>Anleitung · 0.2</span></header>
<div class="guide-layout"><nav aria-label="Hilfethemen"><details id="guide-navigation" open><summary>Hilfethemen</summary><label for="guide-search">Thema finden</label><input id="guide-search" type="search" placeholder="Zum Beispiel: Antworten"><ul>${helpTopics.map((item) => `<li><a href="${base}/${item.id}"${item.id === topic.id ? ' aria-current="page"' : ''}>${escape(item.title)}</a></li>`).join('')}</ul><p id="search-result" role="status"></p><a href="https://github.com/FBForge/fbforge-connect/wiki">Anleitung für 0.1</a></details></nav>
<main id="inhalt" tabindex="-1"><p class="edition">Vorschau für Version 0.2.0</p><h1>${escape(topic.title)}</h1><p class="intro">${escape(topic.intro)}</p><h2>Schritt für Schritt</h2><ol>${topic.steps.map((step) => `<li>${escape(step)}</li>`).join('')}</ol>${figures}${examples ? `<h2>Beispiele</h2>${examples}<p id="copy-result" role="status"></p>` : ''}<h2>Gut zu wissen</h2><ul>${topic.notes.map((note) => `<li>${escape(note)}</li>`).join('')}</ul>${next ? `<p class="next"><a href="${base}/${next.id}">Weiter: ${escape(next.title)} →</a></p>` : ''}</main></div><footer><a href="/connect">FBForge Connect</a><a href="https://github.com/FBForge/fbforge-connect">Quellcode</a><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></footer></body></html>\n`;
  await writeFile(join(directory, `${topic.id}.html`), html);
}
for (const image of new Set(
  helpTopics.flatMap((topic) => [
    topic.image,
    ...(topic.illustrations || []).map((picture) => picture.image),
  ]),
))
  await copyFile(new URL(`images/${image}.png`, source), join(directory, 'images', `${image}.png`));
console.log(`${helpTopics.length} Kapitel exportiert: ${directory}`);
