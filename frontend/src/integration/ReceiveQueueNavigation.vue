<script setup>
import { computed } from 'vue';
const props = defineProps({ items: Array, current: String, busy: Boolean });
const emit = defineEmits(['back', 'next']);
const next = computed(() => {
  const items = props.items || [];
  const position = items.findIndex((item) => item.submissionId === props.current);
  return items[position < 0 ? 0 : position + 1];
});
</script>
<template>
  <nav aria-label="Empfangsnavigation" class="submission-return client-actions">
    <button class="button secondary" type="button" :disabled="busy" @click="emit('back')">
      Zurück zum Eingang
    </button>
    <button class="button" type="button" :disabled="busy || !next" @click="emit('next', next.submissionId)">
      Nächste Einreichung öffnen
    </button>
  </nav>
</template>
