// Wiki and website share one maintained guide. Released 0.1 chapters stay intact.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { helpTopics } from '../docs/guide/topics.js';
import { documentationTopics } from '../frontend/src/documentation.js';
if (!process.argv[2] || process.argv.length !== 3)
  throw new Error('Aufruf: node scripts/export-wiki.mjs <neues-Ausgabeverzeichnis>');
const directory = resolve(process.argv[2]);
await mkdir(directory);
await mkdir(join(directory, 'images', '0.2'), { recursive: true });
if (
  helpTopics.length !== documentationTopics.length ||
  helpTopics.some(
    (topic) => !documentationTopics.some((item) => item.id === topic.id && item.title === topic.title),
  )
)
  throw new Error('Hilfethemen und Anwendung stimmen nicht überein.');
const chapters = helpTopics.map((topic) => `- [${topic.title}](0.2-${topic.id})`);
await writeFile(
  join(directory, 'Home.md'),
  '# FBForge Connect · Anleitung\n\n- [Version 0.1](Version-0.1)\n- [Version 0.2 mit aktuellen Bildern und Beispielen](Version-0.2)\n\n[Projektseite](https://fbforge.de/connect)\n',
);
await writeFile(
  join(directory, 'Version-0.2.md'),
  [
    '# Anleitung für 0.2',
    '',
    'Anleitung für Version 0.2.0. Die veröffentlichte Version 0.1 hat eine [eigene Anleitung](Version-0.1).',
    '',
    ...chapters,
    '',
  ].join('\n'),
);
await writeFile(
  join(directory, '_Footer.md'),
  '[Startseite](Home) · [Projekt](https://github.com/FBForge/fbforge-connect)\n',
);
await writeFile(
  join(directory, '_Sidebar.md'),
  [
    '[**FBForge Connect · Anleitung**](Home)',
    '',
    '**0.2**',
    '',
    ...chapters,
    '',
    '[Anleitung für 0.1](Version-0.1)',
    '',
  ].join('\n'),
);
const images = new Set();
for (const topic of helpTopics) {
  const pictures = [{ image: topic.image, caption: topic.caption }, ...(topic.illustrations || [])];
  if (!/^[a-z-]+$/.test(topic.id) || pictures.some((picture) => !/^[a-z-]+$/.test(picture.image)))
    throw new Error('Ungültiger Kapitel- oder Bildname.');
  const next = helpTopics[helpTopics.indexOf(topic) + 1];
  const markdown = [
    `# ${topic.title}`,
    '',
    'Anleitung für Version 0.2.0.',
    '',
    topic.intro,
    '',
    '## Schritt für Schritt',
    '',
    ...topic.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    ...pictures.flatMap(({ image, caption }) => {
      images.add(image);
      const url = `https://raw.githubusercontent.com/wiki/FBForge/fbforge-connect/images/0.2/${image}.png`;
      return [`[![${caption}](${url})](${url})`, '', caption, ''];
    }),
    ...(topic.examples || []).flatMap((example) => [
      `## ${example.title}`,
      '',
      ...(example.note ? [example.note, ''] : []),
      '```' + (example.language || ''),
      example.content,
      '```',
      '',
    ]),
    '## Gut zu wissen',
    '',
    ...topic.notes.map((note) => `- ${note}`),
    '',
    ...(next ? [`[Weiter: ${next.title}](0.2-${next.id})`, ''] : []),
    '[Alle Themen](Version-0.2)',
    '',
  ].join('\n');
  await writeFile(join(directory, `0.2-${topic.id}.md`), markdown);
}
for (const name of images)
  await copyFile(
    new URL(`../docs/guide/images/${name}.png`, import.meta.url),
    join(directory, 'images', '0.2', `${name}.png`),
  );
console.log(
  `${helpTopics.length} Wiki-Kapitel und ${images.size} Bilder exportiert. Vorhandene 0.1-Kapitel bleiben unverändert.`,
);
