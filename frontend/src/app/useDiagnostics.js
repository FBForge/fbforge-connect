import { downloadLocal } from '../local-download.js';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { invoke, diagnosticLog } from '../native.js';
import { buildSupportReport } from '../support-report.js';
import { probeAdapter, errorMessage } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';

// Trace exports deliberately exclude user payloads and identifiers.
export function useDiagnostics({
  version,
  environment,
  apiVersion,
  busy,
  pendingAction,
  error,
  sessions,
  refreshStorageStatus,
}) {
  const results = ref({}),
    events = ref([]);
  function addEvent(api, action, status, started, role = '—') {
    void refreshStorageStatus();
    events.value = [
      {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString('de-DE'),
        api,
        role,
        action,
        status,
        duration: Math.round(performance.now() - started),
      },
      ...events.value,
    ].slice(0, 100);
  }
  async function probe(versions) {
    if (busy.value) return;
    busy.value = true;
    pendingAction.value = 'probe';
    error.value = '';
    try {
      for (const version of versions) {
        delete results.value[version];
        const started = performance.now();
        let status = 'Erfolgreich';
        try {
          if (!isTauri()) throw new Error('desktop_required');
          results.value[version] = await probeAdapter(invoke, version, environment.value);
        } catch (cause) {
          status = 'Fehlgeschlagen';
          error.value = errorMessage(cause);
          if (resetsSessions(cause)) sessions.value = {};
        }
        addEvent(version, 'SDK lokal laden', status, started);
      }
    } finally {
      busy.value = false;
      pendingAction.value = '';
    }
  }
  const trace = ref(diagnosticLog.snapshot());
  let unsubscribe;
  onMounted(() => {
    unsubscribe = diagnosticLog.subscribe((entries) => {
      trace.value = entries;
    });
  });

  onBeforeUnmount(() => {
    unsubscribe?.();
  });
  const reportJson = computed(() =>
    JSON.stringify(
      buildSupportReport({
        version,
        environment: environment.value,
        selectedApi: apiVersion.value,
        probes: results.value,
        entries: trace.value,
      }),
      null,
      2,
    ),
  );
  function exportReport() {
    return downloadLocal(reportJson.value, `FBForge-Connect-Diagnose-${version}.json`);
  }
  function clearHistory() {
    events.value = [];
    diagnosticLog.clear();
  }
  return { results, events, trace, reportJson, addEvent, probe, exportReport, clearHistory };
}
