<script setup>
import { ref, defineAsyncComponent, watch } from 'vue';
import TestPackages from './TestPackages.vue';
const MalwareScannerSettings = defineAsyncComponent(() => import('./integration/MalwareScannerSettings.vue'));
const TestFlows = defineAsyncComponent(() => import('./integration/TestFlows.vue'));
const SchemaComparison = defineAsyncComponent(() => import('./SchemaComparison.vue'));
const ChannelSchemaDesigner = defineAsyncComponent(() => import('./integration/ChannelSchemaDesigner.vue'));
defineProps({ busy: Boolean, session: Object });
const emit = defineEmits(['send', 'busy', 'scanner-changed']);
const mode = ref('packages');
const comparisonOpened = ref(false);
const flowsOpened = ref(false);
const schemasOpened = ref(false);
watch(mode, (value) => {
  if (value === 'flows') flowsOpened.value = true;
  if (value === 'comparison') comparisonOpened.value = true;
  if (value === 'schemas') schemasOpened.value = true;
});
</script>
<template>
  <div class="test-tools">
    <div class="client-actions" role="group" aria-label="Testwerkzeug auswählen">
      <button
        v-for="tool in [
          { id: 'packages', title: 'Testpakete' },
          { id: 'comparison', title: 'Schema-Vergleich' },
          { id: 'flows', title: 'Testabläufe' },
          { id: 'schemas', title: 'Kanalschemas' },
          { id: 'scanner', title: 'Malwarescanner' },
        ]"
        :key="tool.id"
        type="button"
        class="button secondary"
        :aria-pressed="mode === tool.id"
        @click="mode = tool.id"
      >
        {{ tool.title }}
      </button>
    </div>
    <TestFlows
      v-show="mode === 'flows'"
      v-if="flowsOpened"
      :session="session"
      :busy="busy"
      @send="emit('send', $event)"
      @busy="emit('busy', $event)"
    />
    <MalwareScannerSettings
      v-if="mode === 'scanner'"
      :session="session"
      :busy="busy"
      @busy="emit('busy', $event)"
      @changed="emit('scanner-changed')"
    />
    <TestPackages v-show="mode === 'packages'" :busy="busy" @send="emit('send', $event)" />
    <SchemaComparison v-if="comparisonOpened" v-show="mode === 'comparison'" />
    <ChannelSchemaDesigner v-if="schemasOpened" v-show="mode === 'schemas'" :disabled="busy" />
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
