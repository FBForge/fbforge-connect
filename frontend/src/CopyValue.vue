<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ value: String, label: { type: String, required: true } });
const notice = ref('');
watch(
  () => props.value,
  () => {
    notice.value = '';
  },
);
async function copy() {
  const value = props.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    if (value === props.value) notice.value = `${props.label} kopiert.`;
  } catch {
    if (value === props.value) notice.value = 'Bitte markieren und kopieren Sie den Wert.';
  }
}
</script>
<template>
  <span class="copy-value">
    <code v-if="value">{{ value }}</code>
    <span v-else>Noch nicht bekannt</span>
    <button
      v-if="value"
      type="button"
      class="button secondary copy-button"
      :aria-label="`${label} kopieren`"
      @click="copy"
    >
      Kopieren
    </button>
    <span class="copy-notice small-note" role="status">{{ notice }}</span>
  </span>
</template>
