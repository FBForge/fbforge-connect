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
  '**Integrationstests für FIT-Connect.**',
  '',
  'Hier finden Sie die bebilderte Anleitung für Entwickler, Integratoren und Mitarbeitende der öffentlichen Verwaltung. FBForge Connect ist ein unabhängiges Open-Source-Testwerkzeug und kein offizielles Produkt der FITKO.',
  '',
  'Verwenden Sie ausschließlich die TEST-Umgebung und fiktive Daten. Die Anwendung befindet sich in Entwicklung; diese Anleitung ist keine Alpha-Freigabe.',
  '',
  `Die Texte und Abbildungen entsprechen der integrierten Offline-Hilfe von **${version}**. Die Bildausschnitte zeigen fiktive Beispiele. Klicken Sie auf ein Bild, um es vollständig zu öffnen.`,
  '',
  '## Einstieg',
  '',
  `1. Laden Sie den geprüften Entwicklungsbau über die [Projekt-Startseite](${repository}#einstieg).`,
  '2. Beginnen Sie mit dem [Schnellstart](Schnellstart) und [Verbinden und Profile](Verbinden-und-Profile).',
  '3. Testen Sie anschließend [Versand](Einreichung-senden), [Empfang](Antrag-empfangen-und-pruefen) und gegebenenfalls [Antworten](Antworten-testen).',
  '',
  '## Alle Hilfethemen',
  '',
  ...navigation,
  '',
  '## Rückfragen und Sicherheit',
  '',
  `Fehler und Verbesserungsvorschläge können Sie in den [GitHub-Issues](${repository}/issues) melden. Beschreiben Sie Version, API und den betroffenen Ablauf; veröffentlichen Sie keine Secrets, privaten Schlüssel oder echten Antragsdaten.`,
  '',
  `Sicherheitsprobleme bitte über den [privaten Meldeweg](${repository}/blob/main/SECURITY.md) melden. Die [Projektlizenz](${repository}/blob/main/LICENSE) gilt auch für diese Anleitung.`,
]);
await save('_Sidebar.md', ['[**FBForge Connect · Anleitung**](Home)', '', ...navigation]);
await save('_Footer.md', [
  `[Startseite](Home) · [Projekt](${repository}) · Stand ${version} · Die Hilfe ist auch offline in der Anwendung verfügbar.`,
]);
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
    '## Gut zu wissen',
    '',
    ...topic.notes.map((note) => `- ${note}`),
    '',
    ...(index + 1 < helpTopics.length
      ? [`[Weiter: ${helpTopics[index + 1].title}](${pageNames[index + 1]})`, '']
      : []),
    `Stand ${version}. Inhalt und Abbildung stammen aus der integrierten Anwendungshilfe.`,
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
