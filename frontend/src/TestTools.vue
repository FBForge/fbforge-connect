<script setup>
import { ref, defineAsyncComponent, watch } from 'vue';
import TestPackages from './TestPackages.vue';
const TestFlows = defineAsyncComponent(() => import('./integration/TestFlows.vue'));
const ScenarioWorkspace = defineAsyncComponent(() => import('./integration/scenarios/ScenarioWorkspace.vue'));
const SchemaComparison = defineAsyncComponent(() => import('./SchemaComparison.vue'));
const ChannelSchemaDesigner = defineAsyncComponent(() => import('./integration/ChannelSchemaDesigner.vue'));
const props = defineProps({ busy: Boolean, session: { type: Object, default: null }, testSource: Object });
const emit = defineEmits(['send', 'busy', 'scanner-changed', 'context', 'activity']);
const mode = ref('packages');
const category = ref('tests');
const comparisonOpened = ref(false);
const flowsOpened = ref(false);
const schemasOpened = ref(false);
const guidedOpened = ref(false);
watch(
  () => props.testSource?.requestId,
  () => {
    if (props.testSource) {
      category.value = 'tests';
      guidedOpened.value = true;
      mode.value = 'guided';
    }
  },
  { immediate: true },
);
watch(mode, (value) => {
  if (value === 'guided') guidedOpened.value = true;
  if (value === 'flows') flowsOpened.value = true;
  if (value === 'comparison') comparisonOpened.value = true;
  if (value === 'schemas') schemasOpened.value = true;
});
</script>
<template>
  <div class="test-tools">
    <div class="tool-categories" role="group" aria-label="Testwerkzeug auswählen">
      <button
        v-for="tool in [
          {
            id: 'tests',
            title: 'Testfälle und Abläufe',
            description: 'Testdaten wiederverwenden und den Nachrichtenaustausch Schritt für Schritt prüfen.',
          },
          {
            id: 'schemas',
            title: 'Antwortschemas',
            description: 'JSON-Vorlagen für Statusmitteilungen und Nachforderungen erstellen.',
          },
          {
            id: 'comparison',
            title: 'Schema-Vergleich',
            description: 'Unterschiede zwischen zwei Schema-Versionen erkennen.',
          },
        ]"
        :key="tool.id"
        :aria-label="tool.title"
        type="button"
        class="tool-category"
        :aria-pressed="category === tool.id"
        @click="
          category = tool.id;
          mode = tool.id === 'tests' ? 'packages' : tool.id;
        "
      >
        <strong>{{ tool.title }}</strong>
        <span>{{ tool.description }}</span>
      </button>
    </div>
    <div
      v-if="category === 'tests'"
      class="client-actions"
      role="group"
      aria-label="Testfälle oder Testabläufe"
    >
      <button
        v-for="tool in [
          { id: 'guided', title: 'Integration testen' },
          { id: 'packages', title: 'Testpakete' },
          { id: 'flows', title: 'Testabläufe' },
        ]"
        :key="tool.id"
        class="button secondary"
        :aria-pressed="mode === tool.id"
        @click="mode = tool.id"
      >
        {{ tool.title }}
      </button>
    </div>
    <ScenarioWorkspace
      v-if="guidedOpened"
      v-show="mode === 'guided'"
      :session="session"
      :busy="busy"
      :source="testSource"
      @send="emit('send', $event)"
      @context="emit('context', $event)"
      @activity="emit('activity', $event)"
    />
    <TestFlows
      v-show="mode === 'flows'"
      v-if="flowsOpened"
      :session="session"
      :busy="busy"
      @context="emit('context', $event)"
      @send="emit('send', $event)"
      @busy="emit('busy', $event)"
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

<style scoped>
.tool-categories {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.tool-category {
  display: grid;
  gap: 8px;
  text-align: start;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  background: var(--surface);
  cursor: pointer;
}
.tool-category span {
  display: none;
  font-weight: 400;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.tool-category:hover {
  border-color: var(--accent);
}
.tool-category[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--status-info-bg);
}
@media (max-width: 860px) {
  .tool-categories {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
