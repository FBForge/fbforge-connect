import type { NativeInvoke } from '../../contracts.d.ts';
import { listTestLibrary, readTestLibrary, deleteTestLibrary } from '../../test-library.js';
import { listTestFlows, readTestFlow, deleteTestFlow } from '../test-flow-library.js';
import { listScenarios, readScenario, removeScenario } from './storage.ts';
import { scenarioFrom, uuid } from './model.ts';
import type { Scenario } from './types.ts';
export interface TestEntry {
  id: string;
  name: string;
  kind: 'test' | 'pack' | 'flow';
  caseCount: number;
}
// Editable names never identify a converted test. Keep the original until explicit collection deletion.
export async function convertedTestId(kind: 'pack' | 'flow', id: string) {
  if (!uuid(id)) throw Error('scenario_invalid');
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fbforge-test-v1/${kind}/${id}`)),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function listTests(invoke: NativeInvoke): Promise<TestEntry[]> {
  const [tests, packs, flows] = await Promise.all([
    listScenarios(invoke),
    listTestLibrary(invoke),
    listTestFlows(invoke),
  ]);
  const saved = new Set(tests.map((entry) => entry.id));
  const earlier: TestEntry[] = [
    ...packs.map((entry: { id: string; name: string; cases: unknown[] }) => ({
      id: entry.id,
      name: entry.name,
      caseCount: entry.cases.length,
      kind: 'pack' as const,
    })),
    ...flows.map((entry: { id: string; name: string; caseCount: number }) => ({
      ...entry,
      kind: 'flow' as const,
    })),
  ];
  const visible = await Promise.all(
    earlier.map(async (entry) =>
      saved.has(await convertedTestId(entry.kind as 'pack' | 'flow', entry.id)) ? null : entry,
    ),
  );
  return [
    ...tests.map((entry) => ({ ...entry, kind: 'test' as const })),
    ...visible.filter((entry): entry is TestEntry => entry !== null),
  ];
}
export async function readTest(invoke: NativeInvoke, entry: TestEntry): Promise<Scenario> {
  if (entry.kind === 'test') return readScenario(invoke, entry.id);
  const id = await convertedTestId(entry.kind, entry.id);
  if ((await listScenarios(invoke)).some((row) => row.id === id)) return readScenario(invoke, id);
  const original =
    entry.kind === 'flow' ? await readTestFlow(invoke, entry.id) : await readTestLibrary(invoke, entry.id);
  return { ...scenarioFrom(original), id };
}
export async function removeTest(invoke: NativeInvoke, entry: TestEntry) {
  if (entry.kind === 'test') {
    const [packs, flows] = await Promise.all([listTestLibrary(invoke), listTestFlows(invoke)]);
    for (const source of packs)
      if ((await convertedTestId('pack', source.id)) === entry.id) await deleteTestLibrary(invoke, source.id);
    for (const source of flows)
      if ((await convertedTestId('flow', source.id)) === entry.id) await deleteTestFlow(invoke, source.id);
    await removeScenario(invoke, entry.id);
  } else if (entry.kind === 'flow') await deleteTestFlow(invoke, entry.id);
  else await deleteTestLibrary(invoke, entry.id);
}
