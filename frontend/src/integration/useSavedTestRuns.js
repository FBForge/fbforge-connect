import { ref, onMounted } from 'vue';
import { invoke } from '../native.js';
import { validateTestFlow } from './test-flows.js';
export function useSavedTestRuns() {
  const saved = ref([]),
    selected = ref(''),
    status = ref(''),
    error = ref('');
  let queue = Promise.resolve();
  async function refresh() {
    const rows = await invoke('test_library', { request: { action: 'run_list' } });
    if (!Array.isArray(rows) || rows.length > 32) throw new Error();
    saved.value = rows;
  }
  function save(flow, run, context) {
    if (!flow || !run) return Promise.resolve();
    const document = JSON.parse(JSON.stringify({ flow, run, context }));
    status.value = 'Fortschritt wird gespeichert';
    queue = queue
      .catch(() => {})
      .then(async () => {
        await invoke('test_library', { request: { action: 'run_save', id: run.id, document } });
        status.value = 'Fortschritt für Ihr Windows-Benutzerkonto gespeichert';
        error.value = '';
        await refresh();
      })
      .catch(() => {
        error.value =
          'Der Fortschritt konnte nicht gespeichert werden. Exportieren Sie das Durchlaufergebnis vor dem Beenden.';
        status.value = '';
      });
    return queue;
  }
  async function read() {
    const document = await invoke('test_library', { request: { action: 'run_read', id: selected.value } });
    document.flow = validateTestFlow(document.flow);
    if (
      document.run?.id !== selected.value ||
      !Array.isArray(document.run.results) ||
      document.run.results.length > document.flow.steps.length ||
      !document.context
    )
      throw new Error();
    return document;
  }
  async function remove() {
    await invoke('test_library', { request: { action: 'run_delete', id: selected.value } });
    selected.value = '';
    await refresh();
  }
  onMounted(() => {
    void refresh().catch(() => {
      error.value = 'Gespeicherte Durchläufe konnten nicht geladen werden.';
    });
  });
  return { saved, selected, status, error, save, read, remove };
}
