<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { mount } from './json-viewer.js';

const props = defineProps({ preview: Object });
const emit = defineEmits(['close']);
const dialog = ref(null), jsonHost = ref(null);
let viewer;
onMounted(() => {
  if (jsonHost.value) viewer = mount(jsonHost.value, { text: props.preview.rawText, title: 'JSON-Inhalt', note: 'Original kopieren oder formatiert lesen' });
  dialog.value.showModal();
});
onBeforeUnmount(() => { viewer?.destroy(); dialog.value?.close(); });
</script>

<template>
  <dialog ref="dialog" class="tool-dialog submission-preview-dialog submission-preview" aria-labelledby="content-preview-title"
    @cancel.prevent="emit('close')" @close="emit('close')">
    <div class="tool-section-heading"><div><h2 id="content-preview-title">Lokale Vorschau</h2><p>{{ preview.filename }}</p></div>
      <button class="button secondary" type="button" autofocus @click="emit('close')">Vorschau schließen</button></div>
    <p>{{ preview.notice }}</p>
    <div v-if="preview.kind === 'text' && preview.json" ref="jsonHost"></div>
    <pre v-else-if="preview.kind === 'text'">{{ preview.text }}</pre>
    <img v-else-if="preview.kind === 'image'" :src="preview.url" :alt="preview.filename">
    <p class="small-note">{{ preview.footer || 'Inhalte und Verweise werden nicht ausgeführt. PDF, HTML, SVG und Office-Dateien bleiben ausschließlich als Download verfügbar.' }}</p>
  </dialog>
</template>
