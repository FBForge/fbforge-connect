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
    class="tool-dialog environment-dialog"
    aria-labelledby="environment-title"
    aria-describedby="environment-details"
    @close="picker?.focus()"
  >
    <h2 id="environment-title">Zu {{ pending }} wechseln?</h2>
    <div
      id="environment-details"
      class="environment-dialog-body"
      role="region"
      aria-label="Hinweise zum Umgebungswechsel"
      tabindex="0"
    >
      <p>
        Alle aktuellen Verbindungen werden beendet. Nicht gespeicherte Inhalte und Schlüssel dieser Sitzung
        werden verworfen.
      </p>
      <div v-if="pending === 'PROD'" class="environment-dialog-notice production">
        <strong>PROD verarbeitet echte Daten.</strong>
        <p>
          Auch Testeinreichungen werden produktiv zugestellt. Senden, Antworten und Änderungen benötigen eine
          zusätzliche Bestätigung.
        </p>
      </div>
      <div v-else-if="pending === 'STAGE'" class="environment-dialog-notice">
        <strong>V-PKI-Zertifikate erforderlich</strong>
        <p>STAGE benötigt wie PROD gültige V-PKI-Zertifikate mit vollständiger Zertifikatskette.</p>
      </div>
      <p>Melden Sie sich anschließend mit Ihren Zugangsdaten für {{ pending }} neu an.</p>
    </div>
    <div class="client-actions environment-dialog-actions">
      <button type="button" class="button secondary" autofocus @click="dialog.close()">Abbrechen</button>
      <button type="button" class="button" @click="confirm">Zu {{ pending }} wechseln</button>
    </div>
  </dialog>
</template>
<style scoped>
.environment-dialog {
  width: min(36rem, calc(100% - 32px));
  max-height: calc(100dvh - 32px);
  padding: clamp(16px, 4vw, 28px);
}
.environment-dialog[open] {
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
}
.environment-dialog h2 {
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.35;
}
.environment-dialog-body {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.environment-dialog-body:focus-visible {
  outline-offset: -3px;
}
.environment-dialog-body > p {
  margin: 0;
}
.environment-dialog-body > :not(:first-child) {
  margin-top: 16px;
}
.environment-dialog-notice {
  padding: 16px;
  border: 1px solid var(--status-info-line);
  border-radius: 8px;
  background: var(--status-info-bg);
  color: var(--status-info-ink);
}
.environment-dialog-notice.production {
  border-color: var(--status-error-line);
  background: var(--status-error-bg);
  color: var(--status-error-ink);
}
.environment-dialog-notice p {
  margin: 6px 0 0;
}
.environment-dialog-actions {
  flex-shrink: 0;
  justify-content: flex-end;
  gap: 12px;
  margin: 0;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
</style>
