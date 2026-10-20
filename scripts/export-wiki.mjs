// Keep the released 0.1 chapters intact. New documentation lives on the website.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { documentationTopics, documentationRoot } from '../frontend/src/documentation.js';
if (!process.argv[2] || process.argv.length !== 3)
  throw new Error('Aufruf: node scripts/export-wiki.mjs <neues-Ausgabeverzeichnis>');
const directory = resolve(process.argv[2]);
await mkdir(directory);
await writeFile(
  join(directory, 'Home.md'),
  '# FBForge Connect · Anleitung\n\n[Anleitungen und Versionen auf der Website](https://fbforge.de/connect/hilfe)\n\nDie bisherigen Wiki-Kapitel beschreiben Version 0.1 und bleiben verfügbar.\n\n- [Schnellstart für 0.1](Schnellstart)\n- [Anleitung für 0.2](Version-0.2)\n',
);
await writeFile(
  join(directory, 'Version-0.2.md'),
  [
    '# Anleitung für 0.2',
    '',
    'Die Anleitung wird zentral auf der Website gepflegt. Diese Version befindet sich noch in Entwicklung.',
    '',
    ...documentationTopics.map((topic) => `- [${topic.title}](${documentationRoot}/${topic.id})`),
    '',
  ].join('\n'),
);
console.log('Wiki-Einstiegsseiten exportiert. Vorhandene 0.1-Kapitel bleiben unverändert.');
