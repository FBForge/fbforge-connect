// Export the bundled guide for GitHub Wiki without a second set of help texts.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpTopics } from '../frontend/src/help/topics.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2];
if (!output || process.argv.length !== 3) {
  throw new Error('Aufruf: node scripts/export-wiki.mjs <neues-Ausgabeverzeichnis>');
}
const directory = resolve(output);
const slug = (title) =>
  title
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replaceAll(/[^A-Za-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
const pageNames = helpTopics.map((topic) => slug(topic.title));
if (new Set(pageNames).size !== helpTopics.length) throw new Error('Doppelte Wiki-Seitennamen.');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const repository = 'https://github.com/FBForge/fbforge-connect';
const imageRoot = 'https://raw.githubusercontent.com/wiki/FBForge/fbforge-connect/images';
const navigation = helpTopics.map((topic, index) => `- [${topic.title}](${pageNames[index]})`);

// Deliberately require a new directory: never overwrite an existing wiki checkout.
await mkdir(dirname(directory), { recursive: true });
await mkdir(directory);
await mkdir(join(directory, 'images'));
const save = (filename, lines) => writeFile(join(directory, filename), lines.join('\n') + '\n');
await save('Home.md', [
  '# FBForge Connect · Anleitung',
  '',
  'Anleitung für FIT-Connect TEST. Verwenden Sie eigene Testzugänge und fiktive Daten. Kein offizielles Produkt der FITKO.',
  '',
  `Stand ${version}. Die Hilfe ist auch in der Anwendung verfügbar. Bilder lassen sich durch Anklicken vergrößern.`,
  '',
  '## Einstieg',
  '',
  `1. Laden Sie das Windows-Paket über die [Projektseite](${repository}#installation).`,
  '2. Beginnen Sie mit dem [Schnellstart](Schnellstart) und [Verbinden und Profile](Verbinden-und-Profile).',
  '3. Testen Sie anschließend [Versand](Einreichung-senden), [Empfang](Antrag-empfangen-und-pruefen) und gegebenenfalls [Antworten](Antworten-testen).',
  '',
  '## Alle Hilfethemen',
  '',
  ...navigation,
  '',
  '## Rückfragen und Sicherheit',
  '',
  `Fehler bitte als [Issue](${repository}/issues) mit Version, API und Reproduktionsschritten melden. Keine Zugangsdaten, privaten Schlüssel oder echten Antragsdaten veröffentlichen.`,
  '',
  `Sicherheitslücken bitte [privat melden](${repository}/blob/main/SECURITY.md). Lizenz: [EUPL-1.2](${repository}/blob/main/LICENSE).`,
]);
await save('_Sidebar.md', ['[**FBForge Connect · Anleitung**](Home)', '', ...navigation]);
await save('_Footer.md', [`[Startseite](Home) · [Projekt](${repository}) · ${version}`]);
for (const [index, topic] of helpTopics.entries()) {
  if (!/^[a-z0-9-]+$/.test(topic.image)) throw new Error('Ungültiger Bildname.');
  const image = `${imageRoot}/${topic.image}.png`;
  const alt = topic.caption.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
  await save(`${pageNames[index]}.md`, [
    `# ${topic.title}`,
    '',
    '[Alle Hilfethemen](Home)',
    '',
    topic.intro,
    '',
    `[![${alt}](${image})](${image})`,
    '',
    topic.caption,
    '',
    '## Schritt für Schritt',
    '',
    ...topic.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`),
    '',
    ...(topic.examples?.length
      ? [
          '## Beispiele',
          '',
          ...topic.examples.flatMap((example) => [
            `### ${example.title}`,
            '',
            ...(example.note ? [example.note, ''] : []),
            '```' + example.language,
            example.content,
            '```',
            '',
          ]),
        ]
      : []),
    '## Gut zu wissen',
    '',
    ...topic.notes.map((note) => `- ${note}`),
    '',
    ...(index + 1 < helpTopics.length
      ? [`[Weiter: ${helpTopics[index + 1].title}](${pageNames[index + 1]})`, '']
      : []),
    `Stand ${version}.`,
  ]);
}
const imageNames = new Set(helpTopics.map((topic) => topic.image));
for (const image of imageNames) {
  await copyFile(
    join(root, 'frontend/src/help/screenshots', `${image}.png`),
    join(directory, 'images', `${image}.png`),
  );
}
console.log(`${helpTopics.length} Hilfethemen und ${imageNames.size} Abbildungen exportiert: ${directory}`);

// Preserve links to the former topic title.
await save('Eigene-Zustellpunkte-verwalten.md', [
  '# Eigene Destinations verwalten',
  '',
  'Die Anleitung finden Sie unter [Eigene Destinations verwalten](Eigene-Destinations-verwalten).',
]);
