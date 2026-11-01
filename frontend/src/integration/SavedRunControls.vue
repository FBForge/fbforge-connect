<script setup>
defineProps({ persistence: Object, environment: String, busy: Boolean, pending: Boolean });
const emit = defineEmits(['restore', 'remove', 'select']);
</script>
<template>
  <details v-if="persistence.saved.value.length" class="saved-flow-runs">
    <summary>Gespeicherten Durchlauf fortsetzen</summary>
    <label>
      Durchlauf
      <select
        aria-label="Durchlauf"
        :value="persistence.selected.value"
        @change="emit('select', $event.target.value)"
        :disabled="busy || pending"
      >
        <option value="">Bitte wählen</option>
        <option
          v-for="saved in persistence.saved.value"
          :key="saved.id"
          :value="saved.id"
          :disabled="saved.environment !== environment"
        >
          {{ saved.name }} · {{ saved.environment }} · {{ saved.passed }}/{{ saved.total }} Schritte
        </option>
      </select>
    </label>
    <div class="client-actions">
      <button
        class="button secondary"
        :disabled="busy || pending || !persistence.selected.value"
        @click="emit('restore')"
      >
        Durchlauf fortsetzen
      </button>
      <button
        class="button secondary"
        :disabled="busy || pending || !persistence.selected.value"
        @click="emit('remove')"
      >
        Gespeicherten Durchlauf löschen
      </button>
    </div>
  </details>
</template>
