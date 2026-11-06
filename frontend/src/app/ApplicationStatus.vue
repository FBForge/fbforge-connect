<script setup>
defineProps({
  storageError: Boolean,
  busy: Boolean,
  connected: Boolean,
  environment: String,
  apiVersion: String,
  count: Number,
});
const emit = defineEmits(['diagnostics']);
</script>
<template>
  <div v-if="storageError" class="storage-warning" role="alert">
    Schlüsselbestand noch nicht gesichert. Bitte unter „Verbinden“ erneut sichern.
  </div>
  <footer class="app-statusbar">
    <span class="status-connection">
      <span class="connection-dot" :class="{ connected }" aria-hidden="true"></span>
      {{ busy ? 'Aktion läuft …' : connected ? 'Angemeldet' : 'Nicht verbunden' }}
    </span>
    <span>{{ environment }} · API {{ apiVersion }}</span>
    <button type="button" @click="emit('diagnostics')">{{ count }} technische Aufrufe</button>
  </footer>
</template>
