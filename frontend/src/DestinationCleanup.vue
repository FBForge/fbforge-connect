<script setup>
import { cancelledProductionAction } from './environments.js';
import { useEnvironment } from './environments.js';
const environment = useEnvironment();
import { ref, computed, nextTick, watch } from 'vue';
import { invoke } from './native.js';
import {
  prepareDestinationCleanup,
  executeDestinationCleanup,
  cancelDestinationCleanup,
} from './destination-cleanup.js';
import { diagnosticCode, errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
const props = defineProps({ session: Object, destination: Object, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'changed']);
const pending = ref(false),
  preview = ref(null),
  error = ref(''),
  dialog = ref(null),
  opener = ref(null);
const disabled = computed(() => props.busy || pending.value || !props.session);
let generation = 0;
watch(
  () => `${props.session?.sessionId}/${props.destination?.destinationId}`,
  () => {
    generation++;
    dialog.value?.close();
    preview.value = null;
    error.value = '';
  },
);
async function run(action, operation) {
  if (disabled.value) return;
  const session = { ...props.session },
    stamp = generation,
    started = performance.now();
  pending.value = true;
  emit('busy', true);
  error.value = '';
  let status = 'Erfolgreich';
  try {
    await operation(session, () => stamp === generation);
  } catch (cause) {
    status = cancelledProductionAction(cause) ? 'Abgebrochen' : 'Fehlgeschlagen';
    if (stamp === generation && !cancelledProductionAction(cause))
      error.value = `${errorMessage(cause)} (${diagnosticCode(cause)})`;
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    emit('busy', false);
    emit('activity', { api: session.apiVersion, role: 'Destination-Verwaltung', action, status, started });
  }
}
function prepare() {
  return run('Destination-Entwurf prüfen', async (session, current) => {
    const result = await prepareDestinationCleanup(invoke, session, props.destination.destinationId);
    if (current()) {
      preview.value = result;
      await nextTick();
      dialog.value.showModal();
    }
  });
}
function cancel() {
  if (preview.value?.status !== 'prepared') return;
  const attempt = preview.value.attemptId;
  return run('Entwurfsbereinigung abbrechen', async (session, current) => {
    await cancelDestinationCleanup(invoke, session, attempt);
    if (current()) {
      dialog.value?.close();
      preview.value = null;
      opener.value?.focus();
    }
  });
}
function execute() {
  const confirmed = preview.value;
  if (confirmed?.status !== 'prepared') return;
  return run('Destination-Entwurf entfernen', async (session, current) => {
    preview.value = { ...confirmed, status: 'running' };
    dialog.value?.close();
    try {
      const result = await executeDestinationCleanup(invoke, session, confirmed);
      if (current()) {
        preview.value = result;
        emit('changed');
      }
    } catch (cause) {
      if (current())
        preview.value = cancelledProductionAction(cause) ? confirmed : { ...confirmed, status: 'uncertain' };
      if (cancelledProductionAction(cause) && current()) dialog.value?.showModal();
      throw cause;
    }
  });
}
</script>
<template>
  <section class="tool-section" aria-labelledby="cleanup-title">
    <p class="workspace-eyebrow">FIT-Connect {{ environment }}</p>
    <h3 id="cleanup-title">Nicht aktivierten Destination-Entwurf entfernen</h3>
    <p>
      Nur eigene Destinations im Status „draft“ oder „created“ können hier entfernt werden. Die privaten
      Schlüssel bleiben im lokalen Profil erhalten.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="preview?.status === 'removed'" role="status">
      Die Destination wurde entfernt. Laden Sie die Liste neu.
    </p>
    <p v-if="preview?.status === 'uncertain'" role="alert">
      Die Entfernung wurde nicht sicher bestätigt. Bitte die Liste neu laden und den Serverzustand klären. Es
      wird nichts erneut gelöscht.
    </p>
    <p v-if="['conflict', 'failed', 'expired'].includes(preview?.status)" role="alert">
      Der Entwurf wurde nicht entfernt. Bitte die Konfiguration neu laden und erneut prüfen.
    </p>
    <button
      ref="opener"
      class="button secondary"
      :disabled="disabled || ['uncertain', 'removed', 'running'].includes(preview?.status)"
      @click="prepare"
    >
      Entfernung dieses Destination-Entwurfs vorbereiten
    </button>
    <dialog ref="dialog" aria-labelledby="cleanup-confirm-title" @cancel.prevent="cancel">
      <h3 id="cleanup-confirm-title">Diesen Destination-Entwurf endgültig entfernen?</h3>
      <p>
        <strong>{{ preview?.name }}</strong>
        <br />
        <code>{{ preview?.destinationId }}</code>
      </p>
      <p>
        Die Destination wird bei FIT-Connect gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
        Vorher wird geprüft, ob er seit der Vorschau geändert oder aktiviert wurde.
      </p>
      <div class="client-actions">
        <button class="button secondary" autofocus :disabled="disabled" @click="cancel">Abbrechen</button>
        <button class="button" :disabled="disabled" @click="execute">
          Diesen Destination-Entwurf endgültig entfernen
        </button>
      </div>
    </dialog>
  </section>
</template>
