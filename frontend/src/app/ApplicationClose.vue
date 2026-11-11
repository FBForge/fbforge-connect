<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { flushPreparations } from '../integration/scenarios/preparation-flush.ts';
import { invoke } from '../native.ts';
const props = defineProps({ busy: Boolean, active: Boolean, receiveBrowser: Object });
const dialog = ref(null),
  error = ref(''),
  closing = ref(false),
  recoveryFailed = ref(false);
let unlisten;
async function requestClose() {
  if (closing.value) return;
  error.value = props.busy
    ? 'Eine Aktion läuft noch. Warten Sie auf das Ergebnis, bevor Sie FBForge Connect beenden.'
    : '';
  await nextTick();
  if (!dialog.value.open) dialog.value.showModal();
}
async function close(withoutPreparation = false) {
  if (props.busy || closing.value || (await props.receiveBrowser?.confirmLeave()) === false) return;
  closing.value = true;
  let preparationSaved = false;
  try {
    if (!withoutPreparation) await flushPreparations();
    preparationSaved = true;
    await invoke('close_application');
  } catch (cause) {
    const code = typeof cause === 'string' ? cause : cause?.message;
    recoveryFailed.value = !preparationSaved && code !== 'preparation_pending';
    error.value =
      code === 'preparation_pending'
        ? 'Anlagen werden noch eingelesen. Warten Sie auf das Ergebnis, bevor Sie die Anwendung beenden.'
        : code === 'preparation_unavailable'
          ? 'Die Vorbereitung konnte nicht gesichert werden. Wiederholen Sie das Speichern oder beenden Sie ausdrücklich ohne diese Sicherung.'
          : cause === 'application_activity_pending'
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
      <button v-if="recoveryFailed" class="button secondary" :disabled="busy || closing" @click="close(true)">
        Ohne Vorbereitungssicherung beenden
      </button>
      <button class="button" :disabled="busy || closing" @click="close()">
        {{ closing ? 'Sitzung wird gesichert' : 'Anwendung beenden' }}
      </button>
    </div>
  </dialog>
</template>
