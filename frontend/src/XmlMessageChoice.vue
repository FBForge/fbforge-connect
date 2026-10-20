<script setup>
import { computed } from 'vue';
import { xmlMessageKey } from './xml-examples.js';
const props = defineProps({ id: { type: String, required: true }, roots: Array, disabled: Boolean });
const selection = defineModel({ type: String, default: '' });
const selected = computed(() => props.roots?.find((root) => xmlMessageKey(root) === selection.value));
</script>

<template>
  <div v-if="roots?.length" class="xml-message-choice">
    <label :for="id">XML-Nachricht für die Beispieldaten</label>
    <select :id="id" v-model="selection" :disabled="disabled" :aria-describedby="`${id}-hint`">
      <option value="" disabled>Bitte wählen Sie die Nachricht für Ihren Test</option>
      <option v-for="root in roots" :key="xmlMessageKey(root)" :value="xmlMessageKey(root)">
        {{ root.label }}
      </option>
    </select>
    <p :id="`${id}-hint`" class="small-note">
      Ein Standard kann Anträge, Antworten und Transportnachrichten enthalten. Wählen Sie die Nachricht, die
      zu Ihrer Leistung und Ihrem Test passt. Erzeugen Sie danach die Beispieldaten.
      <span v-if="selected?.namespace">XML-Namensraum: {{ selected.namespace }}</span>
    </p>
  </div>
</template>

<style scoped>
.xml-message-choice {
  margin-block: 1rem;
}
span {
  display: block;
  overflow-wrap: anywhere;
}
</style>
