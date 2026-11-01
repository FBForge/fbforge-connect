<script setup>
defineProps({ disabled: Boolean });
const emit = defineEmits(['reply']);
</script>
<template>
  <div class="tool-section">
    <p>
      Der Empfang ist abgeschlossen. Der Antwortkanal gehört zum Vorgang und bleibt für diese Sitzung
      verfügbar.
    </p>
    <button class="button secondary" :disabled="disabled" @click="emit('reply')">Antwort verfassen</button>
  </div>
</template>
