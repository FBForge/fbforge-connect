import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

// JaCoCo places aggregate counters after the groups. Read the last counter of
// each kind and verify the expected groups, so an empty aggregate cannot pass.
export function engineCoverage(xml) {
  const groups = [...xml.matchAll(/<group name="([^"]+)"/g)].map((match) => match[1]);
  const expected = ['contract', 'adapter-support', 'adapter-v2', 'adapter-v3', 'engine-host'];
  if (expected.some((name) => !groups.includes(name))) throw new Error('engine_coverage_modules_missing');
  const counters = {};
  for (const [, type, missed, covered] of xml.matchAll(
    /<counter type="([A-Z]+)" missed="(\d+)" covered="(\d+)"\s*\/>/g,
  )) {
    const total = Number(missed) + Number(covered);
    counters[type] = { total, covered: Number(covered), pct: total ? (Number(covered) / total) * 100 : 0 };
  }
  if (!counters.LINE?.total || !counters.CLASS?.covered) throw new Error('engine_coverage_empty');
  return counters;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/coverage-engine.mjs')) {
  await rm('coverage/engine/scope.json', { force: true });
  const directory = 'engine/coverage/target/site/jacoco-aggregate';
  const summary = engineCoverage(await readFile(join(directory, 'jacoco.xml'), 'utf8'));
  await mkdir('coverage/engine', { recursive: true });
  await writeFile(
    'coverage/engine/scope.json',
    JSON.stringify(
      {
        scope: 'Java · all five owned modules, isolated adapter classloaders included',
        excludes: ['third-party SDK and dependency source', 'test source'],
        summary,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Java lines: ${summary.LINE.pct.toFixed(2)}% (${summary.LINE.covered}/${summary.LINE.total})`);
}
