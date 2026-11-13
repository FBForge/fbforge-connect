<script setup>
defineProps({ activity: Object, visible: Boolean, busy: Boolean });
const emit = defineEmits(['open', 'close']);
</script>
<template>
  <div v-if="activity && visible" class="connection-notice" aria-label="Aktueller Integrationstest">
    <div>
      <strong>{{ activity.name }}</strong>
      <p>
        Schritt {{ activity.index }} von {{ activity.total }} · {{ activity.step
        }}{{ activity.waiting ? ' · Warten aktiv' : '' }}
      </p>
    </div>
    <div class="client-actions">
      <button class="button secondary" @click="emit('open')">Zurück zum Test</button>
      <button class="button secondary" :disabled="busy || activity.pending" @click="emit('close')">
        Test schließen
      </button>
    </div>
  </div>
</template>
