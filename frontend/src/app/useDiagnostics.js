import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { invoke, diagnosticLog } from '../native.js';
import { buildSupportReport } from '../support-report.js';
import { probeAdapter, errorMessage } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';

// Trace exports deliberately exclude user payloads and identifiers.
export function useDiagnostics({
  version,
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
          results.value[version] = await probeAdapter(invoke, version);
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
  let unsubscribe, downloadUrl, downloadTimer;
  onMounted(() => {
    unsubscribe = diagnosticLog.subscribe((entries) => {
      trace.value = entries;
    });
  });
  function clearDownload() {
    clearTimeout(downloadTimer);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  }
  onBeforeUnmount(() => {
    unsubscribe?.();
    clearDownload();
  });
  const reportJson = computed(() =>
    JSON.stringify(
      buildSupportReport({
        version,
        selectedApi: apiVersion.value,
        probes: results.value,
        entries: trace.value,
      }),
      null,
      2,
    ),
  );
  function exportReport() {
    clearDownload();
    downloadUrl = URL.createObjectURL(new Blob([reportJson.value], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `FBForge-Connect-Diagnose-${version}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    downloadTimer = setTimeout(clearDownload, 30000);
  }
  function clearHistory() {
    events.value = [];
    diagnosticLog.clear();
  }
  return { results, events, trace, reportJson, addEvent, probe, exportReport, clearHistory };
}
