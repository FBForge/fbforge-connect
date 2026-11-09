import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { invoke } from '../../native.ts';
import { deleteTestLibrary, listTestLibrary, readTestLibrary } from '../../test-library.js';
import { deleteTestFlow, listTestFlows, readTestFlow } from '../test-flow-library.js';
import * as storage from './storage.ts';
import { uuid, title } from './model.ts';
import type { useScenarioWorkspace } from './useScenarioWorkspace.ts';

export interface TestEntry {
  id: string;
  name: string;
  kind: 'test' | 'pack' | 'flow';
  caseCount: number;
}
export interface EarlierRun {
  id: string;
  name: string;
  environment: string;
  passed: number;
  total: number;
}

export function useTestCollection(controller: ReturnType<typeof useScenarioWorkspace>) {
  let alive = true,
    refreshAgain = false;
  const earlier = ref<TestEntry[]>([]),
    earlierRuns = ref<EarlierRun[]>([]),
    loading = ref(false),
    error = ref('');
  const entries = computed<TestEntry[]>(() => [
    ...controller.saved.value.map((entry) => ({ ...entry, kind: 'test' as const })),
    ...earlier.value,
  ]);
  async function refresh() {
    if (loading.value) {
      refreshAgain = true;
      return;
    }
    if (!alive) return;
    loading.value = true;
    error.value = '';
    try {
      const [packs, flows, runs] = await Promise.all([
        listTestLibrary(invoke),
        listTestFlows(invoke),
        invoke('test_library', { request: { action: 'run_list' } }),
      ]);
      if (
        !Array.isArray(runs) ||
        runs.length > 32 ||
        runs.some(
          (row) =>
            !row ||
            !uuid(row.id) ||
            !title(row.name) ||
            !['TEST', 'STAGE', 'PROD'].includes(row.environment) ||
            !Number.isInteger(row.passed) ||
            !Number.isInteger(row.total) ||
            row.total < 1 ||
            row.total > 120 ||
            row.passed < 0 ||
            row.passed > row.total,
        )
      )
        throw new Error('engine_protocol_error');
      if (!alive) return;
      earlier.value = [
        ...packs.map((entry: { id: string; name: string; cases: unknown[] }) => ({
          id: entry.id,
          name: entry.name,
          caseCount: entry.cases.length,
          kind: 'pack' as const,
        })),
        ...flows.map((entry: { id: string; name: string; caseCount: number }) => ({
          id: entry.id,
          name: entry.name,
          caseCount: entry.caseCount,
          kind: 'flow' as const,
        })),
      ];
      earlierRuns.value = runs;
    } catch {
      error.value =
        'Die Sammlung konnte nicht vollständig geladen werden. Aktualisieren Sie die Ansicht oder öffnen Sie eine Testdatei.';
    } finally {
      loading.value = false;
      if (refreshAgain && alive) {
        refreshAgain = false;
        void refresh();
      }
    }
  }
  const open = (entry: TestEntry) =>
    controller.act(async () => {
      const value =
        entry.kind === 'test'
          ? await storage.readScenario(invoke, entry.id)
          : entry.kind === 'flow'
            ? await readTestFlow(invoke, entry.id)
            : await readTestLibrary(invoke, entry.id);
      await controller.open(value);
    });
  const remove = (entry: TestEntry) =>
    controller.act(async () => {
      if (entry.kind === 'test') await storage.removeScenario(invoke, entry.id);
      else if (entry.kind === 'flow') await deleteTestFlow(invoke, entry.id);
      else await deleteTestLibrary(invoke, entry.id);
      await controller.refresh();
      await refresh();
    });
  onMounted(() => {
    void refresh();
  });
  onBeforeUnmount(() => {
    alive = false;
  });
  return { entries, earlierRuns, loading, error, refresh, open, remove };
}
