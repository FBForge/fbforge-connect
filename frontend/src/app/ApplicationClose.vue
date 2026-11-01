<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '../native.js';
const props = defineProps({ busy: Boolean, active: Boolean, receiveBrowser: Object });
const dialog = ref(null),
  error = ref(''),
  closing = ref(false);
let unlisten;
async function requestClose() {
  if (closing.value) return;
  error.value = props.busy
    ? 'Eine Aktion läuft noch. Warten Sie auf das Ergebnis, bevor Sie FBForge Connect beenden.'
    : '';
  await nextTick();
  if (!dialog.value.open) dialog.value.showModal();
}
async function close() {
  if (props.busy || closing.value || (await props.receiveBrowser?.confirmLeave()) === false) return;
  closing.value = true;
  try {
    await invoke('close_application');
  } catch (cause) {
    error.value =
      cause === 'application_activity_pending'
        ? 'Eine Aktion oder ein Dateiexport ist noch offen. Schließen Sie diese Aktion zuerst ab.'
        : 'Die Sitzung konnte nicht vollständig gesichert werden. Die Anwendung bleibt geöffnet.';
  } finally {
    closing.value = false;
  }
}
onMounted(async () => {
  if (isTauri()) {
    try {
      unlisten = await listen('application-close-requested', requestClose);
    } catch {
      /* Browser fixtures have no native window event service. */
    }
  }
});
onBeforeUnmount(() => unlisten?.());
defineExpose({ requestClose });
</script>
<template>
  <dialog
    ref="dialog"
    class="tool-dialog"
    aria-labelledby="application-close-title"
    @cancel.prevent="dialog.close()"
  >
    <h2 id="application-close-title">FBForge Connect beenden?</h2>
    <p>
      Gespeicherte Profile, Vorgänge und Testabläufe bleiben erhalten. Sichern Sie offene Entwürfe und nur für
      diese Sitzung geladene Schlüssel vor dem Beenden.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="client-actions">
      <button class="button secondary" autofocus :disabled="closing" @click="dialog.close()">
        Zurück zur Anwendung
      </button>
      <button class="button" :disabled="busy || closing" @click="close">
        {{ closing ? 'Sitzung wird gesichert' : 'Anwendung beenden' }}
      </button>
    </div>
  </dialog>
</template>
