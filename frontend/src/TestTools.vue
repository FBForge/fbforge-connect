<script setup>
import { ref, defineAsyncComponent, watch } from 'vue';
import TestPackages from './TestPackages.vue';
const SchemaComparison = defineAsyncComponent(() => import('./SchemaComparison.vue'));
defineProps({ busy: Boolean });
const emit = defineEmits(['send']);
const mode = ref('packages');
const comparisonOpened = ref(false);
watch(mode, (value) => {
  if (value === 'comparison') comparisonOpened.value = true;
});
</script>
<template>
  <div class="test-tools">
    <div class="client-actions" role="group" aria-label="Testwerkzeug auswählen">
      <button
        type="button"
        class="button secondary"
        :aria-pressed="mode === 'packages'"
        @click="mode = 'packages'"
      >
        Testpakete
      </button>
      <button
        type="button"
        class="button secondary"
        :aria-pressed="mode === 'comparison'"
        @click="mode = 'comparison'"
      >
        Schema-Vergleich
      </button>
    </div>
    <TestPackages v-show="mode === 'packages'" :busy="busy" @send="emit('send', $event)" />
    <SchemaComparison v-if="comparisonOpened" v-show="mode === 'comparison'" />
  </div>
</template>

<style>
.test-tools {
  display: grid;
  gap: 1rem;
}
.test-tools .tool-section {
  min-width: 0;
}
.test-tools :is(code, dd, h3, h4) {
  overflow-wrap: anywhere;
}
.test-package-summary {
  margin-block: 1.5rem;
}
.schema-comparison-result {
  margin-top: 1.5rem;
}
.schema-change-list {
  list-style: none;
  padding: 0;
}
.schema-change-list > li {
  padding: 1rem 0;
  border-bottom: 1px solid var(--line);
}
.schema-change-list h4 {
  margin: 0 0 0.5rem;
}
.schema-change-list pre {
  max-height: 18rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.test-tools details {
  margin-block: 1rem;
}
.test-tools button[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--surface);
  font-weight: 700;
}
</style>
