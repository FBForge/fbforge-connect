<script setup>
import { computed, ref } from 'vue';
import { useScannerMonitor } from './useScannerMonitor.js';
import { scannerOperation } from '../local-scanner.js';
import { invoke } from '../native.js';
defineProps({ visible: Boolean });
defineEmits(['open']);
const monitor = useScannerMonitor();
const cancelError = ref('');
const local = computed(() => monitor?.local.value);
const state = computed(() => monitor?.configuration.value);
const text = computed(() =>
  monitor?.error.value
    ? monitor.error.value
    : local.value?.busy
      ? scannerOperation(local.value.operation)
      : state.value?.kind === 'off'
        ? 'Virenscan ausgeschaltet'
        : state.value?.kind === 'local' || local.value?.enabled
          ? local.value?.ready
            ? 'Lokaler Virenscan bereit'
            : 'Lokaler Virenscan nicht bereit'
          : state.value?.kind === 'icap'
            ? 'Eigener ICAP-Dienst eingerichtet'
            : state.value?.kind === 'clamav'
              ? 'Eigener ClamAV eingerichtet'
              : 'Virenscan noch nicht eingerichtet',
);
const tone = computed(() =>
  monitor?.error.value
    ? 'warn'
    : local.value?.busy
      ? 'info'
      : local.value?.enabled
        ? local.value.ready
          ? 'ok'
          : 'warn'
        : !state.value || state.value.kind === 'off'
          ? 'warn'
          : 'info',
);

async function cancel() {
  try {
    await invoke('cancel_local_scanner_operation');
    cancelError.value = '';
  } catch {
    cancelError.value = 'Abbruch konnte nicht bestätigt werden. Öffnen Sie den Virenscan.';
  }
}
</script>
<template>
  <div v-if="monitor && (visible || local?.busy)" class="scan-status">
    <div>
      <p role="status">
        <span class="status-badge" :class="tone">{{ text }}</span>
      </p>
      <p v-if="local?.busy" class="small-note">
        Aktualisierung läuft im Hintergrund. Eine erfolgreiche Dateiprüfung wird erst nach dem Scan bestätigt.
      </p>
      <p v-else class="small-note">
        Das Ergebnis für Metadaten, Fachdaten und Anlagen erscheint nach der Inhaltsprüfung.
      </p>
      <p v-if="cancelError" role="alert">{{ cancelError }}</p>
    </div>
    <button v-if="local?.busy" type="button" class="button secondary" @click="cancel">
      Scanner-Aktion abbrechen
    </button>
    <button type="button" class="button secondary" @click="$emit('open')">Virenscan öffnen</button>
  </div>
</template>
