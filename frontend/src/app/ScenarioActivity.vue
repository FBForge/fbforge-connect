<script setup>
defineProps({ activity: Object, visible: Boolean });
const emit = defineEmits(['open']);
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
    <button class="button secondary" @click="emit('open')">Zurück zum Test</button>
  </div>
</template>
