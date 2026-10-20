<script setup>
import { ref, computed } from 'vue';
const props = defineProps({ node: Object, query: String, showTechnical: Boolean });
const expanded = ref(props.node.depth < 2);
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
</script>
<template>
  <details
    v-if="node.children.length"
    class="application-group"
    :open="Boolean(query) || expanded"
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
    <div v-if="query || expanded" class="application-group-body">
      <p v-if="node.schema?.description" class="application-description">{{ node.schema.description }}</p>
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
          :show-technical="showTechnical"
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
            :show-technical="showTechnical"
            :query="query"
          />
        </div>
      </details>
    </div>
  </details>
  <div v-else class="application-field" :class="{ 'application-match': query && node.matched }">
    <div class="application-field-label">
      {{ node.label }}
      <span v-if="node.schema?.required === true" class="schema-required">Pflichtfeld laut Schema</span>
      <span v-if="node.duplicate" class="application-duplicate">Mehrfaches JSON-Feld</span>
    </div>
    <p v-if="node.schema?.description" class="application-description">{{ node.schema.description }}</p>
    <div
      class="application-field-value"
      :class="{ 'application-empty': node.value === '' || node.type === 'null' }"
    >
      {{
        node.type === 'whitespace'
          ? JSON.stringify(node.value)
          : node.value === ''
            ? emptyLabel(node.type)
            : node.value
      }}
    </div>
    <p v-if="node.schema?.valueLabel" class="application-value-label">
      {{ node.schema.valueLabel }} · Bezeichnung aus Schema
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
        <template v-if="node.namespace">
          <dt>Namensraum</dt>
          <dd>{{ node.namespace }}</dd>
        </template>
        <template v-if="node.schema">
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
