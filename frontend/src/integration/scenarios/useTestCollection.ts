import { onMounted, onBeforeUnmount, ref } from 'vue';
import { invoke } from '../../native.ts';
import { listTests, readTest, removeTest } from './collection.ts';
import type { TestEntry } from './collection.ts';
export type { TestEntry } from './collection.ts';
import { uuid, title } from './model.ts';
import type { useScenarioWorkspace } from './useScenarioWorkspace.ts';

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
  const entries = ref<TestEntry[]>([]),
    earlierRuns = ref<EarlierRun[]>([]),
    loading = ref(false),
    error = ref('');
  async function refresh() {
    if (loading.value) {
      refreshAgain = true;
      return;
    }
    if (!alive) return;
    loading.value = true;
    error.value = '';
    try {
      const [tests, runs] = await Promise.all([
        listTests(invoke),
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
      entries.value = tests;
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
      const value = await readTest(invoke, entry);
      await controller.open(value);
    });
  const remove = (entry: TestEntry) =>
    controller.act(async () => {
      await removeTest(invoke, entry);
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
