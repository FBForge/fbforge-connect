<script setup>
import { ref, defineAsyncComponent, watch } from 'vue';
const TestFlows = defineAsyncComponent(() => import('./integration/TestFlows.vue'));
const ScenarioWorkspace = defineAsyncComponent(() => import('./integration/scenarios/ScenarioWorkspace.vue'));
const SchemaComparison = defineAsyncComponent(() => import('./SchemaComparison.vue'));
const ChannelSchemaDesigner = defineAsyncComponent(() => import('./integration/ChannelSchemaDesigner.vue'));
const props = defineProps({
  busy: Boolean,
  session: { type: Object, default: null },
  testSource: Object,
  active: { type: Boolean, default: true },
});
const emit = defineEmits(['send', 'busy', 'scanner-changed', 'context', 'activity']);
const mode = ref('tests');
const legacyRun = ref('');
const scenario = ref(null);
defineExpose({ closeTest: () => scenario.value?.closeTest() });
const tools = [
  { id: 'tests', title: 'Tests' },
  { id: 'schemas', title: 'Antwortschemas' },
  { id: 'comparison', title: 'Schema-Vergleich' },
];
const comparisonOpened = ref(false);
const schemasOpened = ref(false);
function selectTool(id) {
  mode.value = id;
  if (id === 'comparison') comparisonOpened.value = true;
  if (id === 'schemas') schemasOpened.value = true;
}
function keydown(event, index) {
  const next = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  selectTool(tools[next].id);
  event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
}
watch(
  () => props.testSource?.requestId,
  () => {
    if (props.testSource) {
      legacyRun.value = '';
      mode.value = 'tests';
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="test-tools">
    <div class="receive-tabs test-tools-nav" role="tablist" aria-label="Testwerkzeuge">
      <button
        v-for="(tool, index) in tools"
        :key="tool.id"
        :id="`test-tool-${tool.id}`"
        role="tab"
        :aria-controls="`test-panel-${tool.id}`"
        :aria-selected="mode === tool.id"
        :tabindex="mode === tool.id ? 0 : -1"
        type="button"
        @click="selectTool(tool.id)"
        @keydown="keydown($event, index)"
      >
        {{ tool.title }}
      </button>
    </div>
    <div id="test-panel-tests" role="tabpanel" aria-labelledby="test-tool-tests" v-show="mode === 'tests'">
      <ScenarioWorkspace
        ref="scenario"
        v-show="!legacyRun"
        :session="session"
        :busy="busy"
        :source="testSource"
        :active="active && mode === 'tests' && !legacyRun"
        @send="emit('send', $event)"
        @context="emit('context', $event)"
        @activity="emit('activity', $event)"
        @legacy-run="legacyRun = $event"
      />
      <template v-if="legacyRun">
        <div class="client-actions">
          <button class="button secondary" @click="legacyRun = ''">Zur Testübersicht</button>
        </div>
        <TestFlows
          :initial-run="legacyRun"
          :session="session"
          :busy="busy"
          @context="emit('context', $event)"
          @send="emit('send', $event)"
          @busy="emit('busy', $event)"
        />
      </template>
    </div>
    <div
      id="test-panel-comparison"
      role="tabpanel"
      aria-labelledby="test-tool-comparison"
      v-show="mode === 'comparison'"
    >
      <SchemaComparison v-if="comparisonOpened" />
    </div>
    <div
      id="test-panel-schemas"
      role="tabpanel"
      aria-labelledby="test-tool-schemas"
      v-show="mode === 'schemas'"
    >
      <ChannelSchemaDesigner v-if="schemasOpened" :disabled="busy" :session="session" />
    </div>
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
</style>

<style scoped>
.test-tools-nav {
  margin: 0;
  flex-wrap: wrap;
}
</style>
