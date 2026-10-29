<script setup>
import { computed } from 'vue';
import { configurationDifferences } from './destination-templates.js';
const props = defineProps({ before: Object, after: Object });
const changes = computed(() => configurationDifferences(props.before, props.after));
</script>
<template>
  <details v-if="changes.length">
    <summary>Vollständiger Feldvergleich ({{ changes.length }})</summary>
    <dl v-for="row in changes" :key="row.field">
      <dt>{{ row.field }}</dt>
      <dd>
        <strong>Vorher</strong>
        <pre>{{ JSON.stringify(row.before, null, 2) }}</pre>
        <strong>Nachher</strong>
        <pre>{{ JSON.stringify(row.after, null, 2) }}</pre>
      </dd>
    </dl>
  </details>
</template>
