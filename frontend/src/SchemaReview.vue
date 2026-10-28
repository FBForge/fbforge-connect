<script setup>
import { computed, useId } from 'vue';
import { schemaSources } from './schema-review.js';
const props = defineProps({ review: Object, schemaUri: String, schemaDocument: String });
const emit = defineEmits(['field']);
const id = useId();
const source = computed(() => schemaSources(props.schemaDocument));
</script>
<template>
  <section v-if="review?.status === 'invalid'" class="schema-review" :aria-labelledby="id">
    <h4 :id="id">Fachdaten weichen vom Schema ab</h4>
    <p>
      Die Daten bleiben lesbar. Prüfen Sie die Abweichungen und entscheiden Sie anschließend über Annahme oder
      Ablehnung.
    </p>
    <ul>
      <li v-for="(error, index) in review.errors" :key="index">
        <p>{{ error.message }}</p>
        <p v-if="error.line">
          XML-Zeile {{ error.line }}
          <span v-if="error.column">, Spalte {{ error.column }}</span>
        </p>
        <p v-else>
          <span>Feldpfad:</span>
          <code>{{ error.path || '/' }}</code>
        </p>
        <button v-if="error.path" type="button" class="button secondary" @click="emit('field', error.path)">
          Feld im Formular anzeigen
        </button>
      </li>
    </ul>
    <details>
      <summary>Verwendetes Schema anzeigen</summary>
      <p>{{ schemaUri }}</p>
      <pre class="application-source">{{
        source || 'Für dieses Schema steht keine lokale Kopie zur Verfügung.'
      }}</pre>
    </details>
  </section>
</template>
