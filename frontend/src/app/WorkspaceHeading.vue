<script setup>
import { ref } from 'vue';
import DocumentationLink from '../DocumentationLink.vue';
defineProps({ section: String, description: String });
const heading = ref(null);
const topics = {
  Senden: 'send',
  Empfangen: 'receive',
  'Event Log': 'events',
  Destinations: 'destinations',
  Prozesse: 'processes',
  Testwerkzeuge: 'tools',
  Virenscan: 'tools',
};
defineExpose({ focus: (options) => heading.value?.focus(options) });
</script>
<template>
  <div class="workspace-heading" role="region" aria-label="Aktueller Arbeitsbereich">
    <div>
      <h1 ref="heading" tabindex="-1">{{ section }}</h1>
      <p>{{ description }}</p>
    </div>
    <DocumentationLink v-if="topics[section]" :topic="topics[section]">Anleitung</DocumentationLink>
  </div>
</template>
