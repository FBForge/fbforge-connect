import { readFile } from 'node:fs/promises';
import { scenarioFrom } from '../../frontend/src/integration/scenarios/model.ts';
import { startRun } from '../../frontend/src/integration/scenarios/runs.ts';
export const pack = JSON.parse(
  await readFile(new URL('../../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
);
export const assignment = {
  apiVersion: 'v3',
  senderProfileId: '',
  receiverProfileId: '',
  sourceDestination: '',
  receiverDestination: '',
};
export function scenario() {
  return scenarioFrom(structuredClone(pack));
}
export const runFor = (s) => startRun(s, s.variants[0].id, 'TEST', assignment);
export function withReplies(count = 2) {
  const s = scenario();
  s.pack.cases = s.pack.cases.slice(0, 1);
  s.followups = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    caseId: s.pack.cases[0].id,
    name: `Rückmeldung ${index + 2}`,
    message: {
      ...structuredClone(s.pack.cases[0].reply),
      data: JSON.stringify({ status: `schritt_${index + 2}`, nachricht: 'Fiktive Rückmeldung' }),
    },
  }));
  return s;
}
