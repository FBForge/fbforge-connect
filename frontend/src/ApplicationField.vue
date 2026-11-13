<script setup>
import { ref, computed, watch } from 'vue';
import { fieldDisplay, fieldAttachment } from './field-display.js';
const props = defineProps({
  node: Object,
  query: String,
  showTechnical: Boolean,
  expansion: Object,
  attachments: { type: Array, default: () => [] },
  validationErrors: { type: Array, default: () => [] },
});
const fieldErrors = computed(() => props.validationErrors.filter((error) => error.path === props.node.path));
const hasErrors = computed(() =>
  props.validationErrors.some(
    (error) => error.path === props.node.path || error.path.startsWith(`${props.node.path}/`),
  ),
);
const expanded = ref(props.node.depth < 2);
watch(
  () => props.expansion,
  (value) => {
    expanded.value = value ? value.open : props.node.depth < 2;
  },
  { immediate: true },
);
const displayValue = computed(() => fieldDisplay(props.node));
const attachment = computed(() => fieldAttachment(props.node, props.attachments));
const fields = computed(() => props.node.children.filter((child) => child.type !== 'whitespace'));
const whitespace = computed(() => props.node.children.filter((child) => child.type === 'whitespace'));
const emptyLabel = (type) =>
  ({
    array: 'Leere Liste []',
    object: 'Leeres Objekt {}',
    element: 'Leeres XML-Element',
    string: 'Leere Zeichenfolge',
    text: 'Leerer Text',
    attribute: 'Leeres Attribut',
  })[type] || 'Leer';
const renderedValue = computed(() =>
  props.node.type === 'whitespace'
    ? JSON.stringify(props.node.value)
    : props.node.value === ''
      ? emptyLabel(props.node.type)
      : attachment.value
        ? `${attachment.value.fileName} · Anlage`
        : displayValue.value,
);
</script>
<template>
  <details
    v-if="node.children.length"
    class="application-group"
    :class="{ 'application-invalid': fieldErrors.length }"
    :data-field-path="node.path"
    tabindex="-1"
    :open="Boolean(query) || expanded || hasErrors"
    @toggle="
      (event) => {
        if (!query) expanded = event.target.open;
      }
    "
  >
    <summary>
      <strong>{{ node.label }}</strong>
      <span>{{ node.children.length }} {{ node.children.length === 1 ? 'Eintrag' : 'Einträge' }}</span>
      <span v-if="node.duplicate" class="application-duplicate">Mehrfaches JSON-Feld</span>
    </summary>
    <div v-if="query || expanded || hasErrors" class="application-group-body">
      <p v-for="(error, index) in fieldErrors" :key="index" class="application-field-error">
        {{ error.message }}
      </p>
      <details v-if="node.schema?.description" class="application-field-help">
        <summary :aria-label="`Beschreibung: ${node.label}`">Beschreibung der Gruppe</summary>
        <p class="application-description">{{ node.schema.description }}</p>
      </details>
      <p v-if="node.schema?.ambiguous" class="application-duplicate">Schema-Beschriftung nicht eindeutig.</p>
      <details v-if="showTechnical && node.schema" class="application-origin">
        <summary>Schemaherkunft der Gruppe</summary>
        <p v-for="(entry, index) in node.schema.sources" :key="index" class="application-path">
          {{ entry.uri }} · {{ entry.location || '/' }}
        </p>
      </details>
      <p v-if="showTechnical" class="application-path">
        {{ node.path || '/' }}
        <span v-if="node.namespace">· Namensraum: {{ node.namespace }}</span>
      </p>
      <div class="application-fields">
        <ApplicationField
          v-for="child in fields"
          :key="child.id"
          :node="child"
          :validation-errors="validationErrors"
          :show-technical="showTechnical"
          :expansion="expansion"
          :attachments="attachments"
          :query="query"
        />
      </div>
      <details v-if="whitespace.length" class="application-xml-spacing" :open="Boolean(query)">
        <summary>XML-Leerraum ({{ whitespace.length }})</summary>
        <div class="application-fields">
          <ApplicationField
            v-for="child in whitespace"
            :key="child.id"
            :node="child"
            :validation-errors="validationErrors"
            :show-technical="showTechnical"
            :expansion="expansion"
            :attachments="attachments"
            :query="query"
          />
        </div>
      </details>
    </div>
  </details>
  <div
    v-else
    class="application-field"
    :class="{
      'application-match': query && node.matched,
      'application-invalid': fieldErrors.length,
      'application-field-long': node.label.length > 160,
    }"
    :data-field-path="node.path"
    tabindex="-1"
  >
    <div class="application-field-label">
      {{ node.label }}
      <span v-if="showTechnical && node.schema?.required === true" class="schema-required">
        Pflichtfeld laut Schema
      </span>
      <span v-if="node.duplicate" class="application-duplicate">Mehrfaches JSON-Feld</span>
    </div>
    <details v-if="node.schema?.description" class="application-field-help">
      <summary :aria-label="`Feldhinweis: ${node.label}`">Feldhinweis</summary>
      <p class="application-description">{{ node.schema.description }}</p>
    </details>
    <div
      class="application-field-value"
      :class="{ 'application-empty': node.value === '' || node.type === 'null' }"
      v-text="renderedValue"
    />
    <p v-for="(error, index) in fieldErrors" :key="index" class="application-field-error">
      {{ error.message }}
    </p>
    <p v-if="node.schema?.ambiguous" class="application-duplicate">Schema-Beschriftung nicht eindeutig.</p>
    <details v-if="showTechnical" class="application-origin">
      <summary>Feldherkunft</summary>
      <dl>
        <dt>Originalfeld</dt>
        <dd>{{ node.key }}</dd>
        <dt>Pfad</dt>
        <dd>{{ node.path || '/' }}</dd>
        <dt>Typ</dt>
        <dd>{{ node.type }}</dd>
        <dt>Originalwert</dt>
        <dd>{{ node.value }}</dd>
        <template v-if="node.namespace">
          <dt>Namensraum</dt>
          <dd>{{ node.namespace }}</dd>
        </template>
        <template v-if="node.schema">
          <template v-if="node.schema.valueLabel">
            <dt>Schema-Bezeichnung</dt>
            <dd>{{ node.schema.valueLabel }}</dd>
          </template>
          <dt>Schema-Typ</dt>
          <dd>
            {{ node.schema.type || 'Nicht angegeben'
            }}{{ node.schema.format ? ` · ${node.schema.format}` : '' }}
          </dd>
          <template v-for="(entry, index) in node.schema.sources" :key="index">
            <dt>Schemaquelle</dt>
            <dd>
              {{ entry.uri }}
              <br />
              {{ entry.location || '/' }}
            </dd>
          </template>
        </template>
      </dl>
    </details>
  </div>
</template>
