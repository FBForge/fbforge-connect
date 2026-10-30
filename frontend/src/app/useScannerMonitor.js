import { shallowRef, computed, watch, onMounted, onBeforeUnmount, provide, inject } from 'vue';
import { invoke } from '../native.js';
import { requestResource } from '../resources.js';
import { checkedLocalScanner } from '../local-scanner.js';
const scannerKey = Symbol('scanner-monitor');
export const useScannerMonitor = () => inject(scannerKey, null);
export function provideScannerMonitor(session) {
  const local = shallowRef(null),
    configuration = shallowRef(null),
    error = shallowRef('');
  let alive = true,
    reading = false,
    timer,
    generation = 0,
    configured = '';
  const context = computed(() => `${session.value?.apiVersion}/${session.value?.sessionId}`);
  watch(context, () => {
    generation++;
    configured = '';
    configuration.value = null;
    error.value = '';
  });
  async function refresh(invalidate = false) {
    if (invalidate) configured = '';
    if (reading || !alive) return;
    reading = true;
    const stamp = generation;
    try {
      const value = checkedLocalScanner(await invoke('local_scanner_status'));
      if (!alive || stamp !== generation) return;
      local.value = value;
      // Never queue a Java request behind an update waiting for the component lock.
      if (session.value && !value.busy && configured !== context.value) {
        const config = await requestResource(invoke, { ...session.value }, 'malware_scanner_state');
        if (!alive || stamp !== generation) return;
        configuration.value = config;
        configured = context.value;
      }
      error.value = '';
    } catch {
      if (alive && stamp === generation) error.value = 'Scannerstatus derzeit nicht verfügbar.';
    } finally {
      reading = false;
    }
  }
  const monitor = { local, configuration, error, refresh };
  provide(scannerKey, monitor);
  onMounted(() => {
    void refresh();
    timer = setInterval(refresh, 1500);
  });
  onBeforeUnmount(() => {
    alive = false;
    clearInterval(timer);
  });
  return monitor;
}
