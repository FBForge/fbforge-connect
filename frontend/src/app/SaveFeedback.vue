<script setup>
import { localSave } from '../local-download.js';
</script>
<template>
  <div v-if="localSave.message" class="save-feedback" :class="{ error: localSave.error }">
    <p :role="localSave.error ? 'alert' : 'status'">{{ localSave.message }}</p>
    <button
      v-if="!localSave.pending"
      class="button secondary small-button"
      @click="localSave = { pending: false, message: '', error: false }"
    >
      Meldung schließen
    </button>
  </div>
</template>
<style scoped>
.save-feedback {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border: 1px solid var(--status-info-line);
  border-radius: 8px;
  background: var(--surface);
  margin-bottom: 16px;
  box-shadow: var(--soft-shadow);
  overflow-wrap: anywhere;
}
.save-feedback.error {
  border-color: var(--status-error-line);
}
p {
  margin: 0;
  min-width: 0;
}
button {
  flex-shrink: 0;
}
</style>
