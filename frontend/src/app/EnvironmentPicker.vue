<script setup>
import { ref, nextTick } from 'vue';
import { environments } from '../environments.js';
const props = defineProps({ environment: String, busy: Boolean });
const emit = defineEmits(['change']);
const pending = ref(''),
  dialog = ref(null),
  picker = ref(null);
async function choose(event) {
  const value = event.target.value;
  event.target.value = props.environment;
  if (value === props.environment || props.busy) return;
  pending.value = value;
  await nextTick();
  dialog.value.showModal();
}
function confirm() {
  dialog.value.close();
  emit('change', pending.value);
}
</script>
<template>
  <label class="api-picker" for="environment-picker">
    <span>Umgebung</span>
    <select
      id="environment-picker"
      aria-label="Umgebung"
      ref="picker"
      :value="environment"
      :disabled="busy"
      @change="choose"
    >
      <option v-for="item in environments" :key="item" :value="item">{{ item }}</option>
    </select>
  </label>
  <dialog
    ref="dialog"
    class="confirmation-dialog"
    aria-labelledby="environment-title"
    @close="picker?.focus()"
  >
    <h2 id="environment-title">Zu {{ pending }} wechseln?</h2>
    <p>
      Alle aktuellen Verbindungen werden beendet. Nicht gespeicherte Inhalte und Schlüssel dieser Sitzung
      werden verworfen. Anschließend melden Sie sich mit den Zugangsdaten für {{ pending }} neu an.
    </p>
    <p v-if="pending === 'PROD'" class="status-badge error">
      <strong>PROD verarbeitet echte Daten.</strong>
      Auch Testeinreichungen werden produktiv zugestellt. Senden, Antworten und Änderungen benötigen eine
      zusätzliche Bestätigung.
    </p>
    <p v-else-if="pending === 'STAGE'">
      STAGE benötigt wie PROD gültige V-PKI-Zertifikate mit vollständiger Zertifikatskette.
    </p>
    <div class="button-row">
      <button type="button" class="button secondary" autofocus @click="dialog.close()">Abbrechen</button>
      <button type="button" class="button" @click="confirm">Zu {{ pending }} wechseln</button>
    </div>
  </dialog>
</template>
